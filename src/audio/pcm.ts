/**
 * Turning a wav into the frames LiveKit wants.
 *
 * The frame copy in `frameAt` is not a nicety. AudioFrame reads the underlying
 * buffer without the view's offset, so handing it a subarray publishes the
 * start of the file for every frame. A Piper wav opens quietly, so the fault
 * arrives as silence rather than as a stutter, which is far worse to find.
 * Learned in sidetone; the same rule applies here.
 */
export const RTC_RATE = 48_000;
export const FRAME_MS = 20;

export interface Wav {
  samples: Int16Array;
  sampleRate: number;
}

/** Signed 16 bit mono PCM, which is what Piper writes. */
export function decodeWav(bytes: Uint8Array): Wav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 0x52494646) throw new Error("not a RIFF file");
  let at = 12;
  let sampleRate = 0;
  while (at + 8 <= bytes.byteLength) {
    const id = view.getUint32(at, false);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 0x666d7420) {
      const bits = view.getUint16(body + 14, true);
      if (view.getUint16(body + 2, true) !== 1) throw new Error("only mono is supported");
      if (bits !== 16) throw new Error(`only 16 bit samples are supported, this is ${bits}`);
      sampleRate = view.getUint32(body + 4, true);
    }
    if (id === 0x64617461) {
      if (!sampleRate) throw new Error("the data chunk came before the format chunk");
      const samples = new Int16Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(body + i * 2, true);
      return { samples, sampleRate };
    }
    at = body + size + (size % 2);
  }
  throw new Error("no data chunk");
}

/** Nearest neighbour. Good enough between 22 kHz and 48 kHz for speech. */
export function resample(samples: Int16Array, from: number, to: number): Int16Array {
  if (from === to) return samples;
  const out = new Int16Array(Math.round((samples.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    out[i] = samples[Math.min(samples.length - 1, Math.floor((i * from) / to))] as number;
  }
  return out;
}

/** One whole frame, copied. The last frame is short and the rest is silence. */
export function frameAt(samples: Int16Array, at: number, size: number): Int16Array {
  const out = new Int16Array(size);
  out.set(samples.subarray(at, Math.min(at + size, samples.length)));
  return out;
}

/** A minimal RIFF header around mono 16 bit samples, for a worker that reads files. */
export function encodeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.byteLength);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.byteLength, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.byteLength, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i] as number, true);
  return bytes;
}
