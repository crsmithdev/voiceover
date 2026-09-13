/**
 * Text to speech for the agent framework (spec 13.2), over the voice bridge's
 * Piper worker.
 *
 * The worker writes a whole wav for a sentence and costs about 80 milliseconds
 * to do it (spec 15.5), so this declares itself non-streaming and the
 * framework's `StreamAdapter` feeds it a sentence at a time.
 *
 * Spec 18.12: the voice is the bridge's, not a chosen one, and Chris found it
 * usable but not good on a telephone. Swapping it is a change to one name here.
 */
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AudioFrame } from "@livekit/rtc-node";
import { type APIConnectOptions, tts } from "@livekit/agents";
import { decodeWav, frameAt } from "../audio/pcm.ts";
import { MODELS, Worker } from "./worker.ts";

const VOICE = process.env.CALLER_VOICE ?? "en_US-lessac-medium";
/** Piper's own rate for this voice. `warm` checks it rather than trusting it. */
const PIPER_RATE = 22_050;
const FRAME_MS = 20;

export class PiperTTS extends tts.TTS {
  label = "caller.PiperTTS";
  private worker = new Worker("tts_worker.py", [join(MODELS, `${VOICE}.onnx`)]);
  private started: Promise<unknown> | null = null;

  constructor() {
    super(PIPER_RATE, 1, { streaming: false });
  }

  /** Loading the voice costs about a second, so pay it before a call. */
  async warm(): Promise<void> {
    this.started ??= this.worker.start();
    const ready = (await this.started) as { sample_rate?: number };
    if (ready.sample_rate && ready.sample_rate !== PIPER_RATE) {
      throw new Error(`the voice runs at ${ready.sample_rate} Hz and this adapter declared ${PIPER_RATE}`);
    }
  }

  async say(text: string): Promise<{ samples: Int16Array; sampleRate: number }> {
    await this.warm();
    const path = join(tmpdir(), `caller-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    await this.worker.ask({ text, wav: path });
    return decodeWav(new Uint8Array(await readFile(path)));
  }

  synthesize(text: string, connOptions?: APIConnectOptions, abortSignal?: AbortSignal): tts.ChunkedStream {
    return new PiperChunkedStream(text, this, connOptions, abortSignal);
  }

  stream(): never {
    throw new Error("PiperTTS does not stream; wrap it in the framework's StreamAdapter");
  }

  async close(): Promise<void> {
    this.worker.stop();
  }
}

class PiperChunkedStream extends tts.ChunkedStream {
  label = "caller.PiperChunkedStream";

  constructor(
    text: string,
    private readonly voice: PiperTTS,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal,
  ) {
    super(text, voice, connOptions, abortSignal);
  }

  protected async run(): Promise<void> {
    const { samples, sampleRate } = await this.voice.say(this.inputText);
    const size = (sampleRate * FRAME_MS) / 1000;
    const requestId = `piper-${Date.now()}`;
    for (let at = 0; at < samples.length; at += size) {
      if (this.abortSignal.aborted) break;
      // frameAt copies. A subarray would publish the start of the sentence for
      // every frame, and a Piper file opens quietly, so it arrives as silence.
      const frame = new AudioFrame(frameAt(samples, at, size), sampleRate, 1, size);
      this.queue.put({
        requestId,
        segmentId: requestId,
        frame,
        final: at + size >= samples.length,
      });
    }
    this.queue.close();
  }
}
