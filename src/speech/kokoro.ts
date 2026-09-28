/**
 * A second voice, for the test receiver (spec 12.8, 12.10).
 *
 * The caller speaks with Piper. A receiver that spoke with the same voice would
 * make a rehearsal hard to follow by ear, so it speaks with Kokoro, which the
 * voice bridge installed in its own virtual environment (spec 18.12.1). All
 * voices sit in one pack and are chosen per request, so a transfer to a new
 * person is a change of name, not a new worker.
 */
import { readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { type APIConnectOptions, tts } from "@livekit/agents";
import { decodeWav } from "../audio/pcm.ts";
import { FileChunkedStream } from "./tts.ts";
import { Worker } from "./worker.ts";

const KOKORO_RATE = 24_000;

export class KokoroTTS extends tts.TTS {
  label = "caller.KokoroTTS";
  private worker: Worker;
  private started: Promise<Record<string, unknown>> | null = null;

  constructor(public voice: string) {
    super(KOKORO_RATE, 1, { streaming: false });
    this.worker = new Worker("kokoro", voice);
  }

  async warm(): Promise<void> {
    this.started ??= this.worker.start();
    const ready = (await this.started) as { sample_rate?: number; provider?: string };
    if (ready.sample_rate && ready.sample_rate !== KOKORO_RATE) {
      throw new Error(`Kokoro runs at ${ready.sample_rate} Hz and this adapter declared ${KOKORO_RATE}`);
    }
    // The engine says what is wrong with itself; onnxruntime falls back to the
    // processor without failing, so this is the only warning there will be.
    const complaint = this.worker.complaint(ready as Record<string, unknown>);
    if (complaint) console.warn(`WARNING: ${complaint}`);
  }

  async say(text: string): Promise<{ samples: Int16Array; sampleRate: number }> {
    await this.warm();
    const { bytes } = await this.worker.round({ text, voice: this.voice }, { read: true });
    return decodeWav(bytes as Uint8Array);
  }

  synthesize(text: string, connOptions?: APIConnectOptions, abortSignal?: AbortSignal): tts.ChunkedStream {
    return new FileChunkedStream(text, this, connOptions, abortSignal);
  }

  stream(): never {
    throw new Error("KokoroTTS does not stream; wrap it in the framework's StreamAdapter");
  }

  async close(): Promise<void> {
    this.worker.stop();
  }
}
