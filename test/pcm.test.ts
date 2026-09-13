/** Wav decoding and the frame copy that a subarray silently breaks. */
import { describe, expect, test } from "bun:test";
import { decodeWav, frameAt, resample } from "../src/audio/pcm.ts";

function wav(samples: number[], rate = 22_050): Uint8Array {
  const data = new Int16Array(samples);
  const bytes = new Uint8Array(44 + data.byteLength);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => [...text].forEach((c, i) => bytes.set([c.charCodeAt(0)], at + i));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + data.byteLength, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, data.byteLength, true);
  bytes.set(new Uint8Array(data.buffer), 44);
  return bytes;
}

describe("decodeWav", () => {
  test("reads mono 16 bit samples and the rate", () => {
    const decoded = decodeWav(wav([0, 1000, -1000, 32767]));
    expect(decoded.sampleRate).toBe(22_050);
    expect([...decoded.samples]).toEqual([0, 1000, -1000, 32767]);
  });

  test("refuses a file that is not RIFF", () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow("not a RIFF");
  });
});

describe("resample", () => {
  test("returns the same array when the rate matches", () => {
    const samples = new Int16Array([1, 2, 3]);
    expect(resample(samples, 48_000, 48_000)).toBe(samples);
  });

  test("stretches 22 kHz up to 48 kHz", () => {
    const out = resample(new Int16Array([1, 2, 3, 4]), 22_050, 48_000);
    expect(out.length).toBe(Math.round((4 * 48_000) / 22_050));
    expect(out[0]).toBe(1);
  });
});

describe("frameAt", () => {
  test("copies, so a frame is not a view onto the start of the buffer", () => {
    const samples = new Int16Array([1, 2, 3, 4, 5, 6]);
    const second = frameAt(samples, 2, 2);
    expect([...second]).toEqual([3, 4]);
    // The defect this guards: a view would share the buffer and read from 0.
    expect(second.byteOffset).toBe(0);
    expect(second.buffer).not.toBe(samples.buffer);
  });

  test("pads the last short frame with silence", () => {
    expect([...frameAt(new Int16Array([1, 2, 3]), 2, 4)]).toEqual([3, 0, 0, 0]);
  });
});
