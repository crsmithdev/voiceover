/**
 * Speech to text for the agent framework (spec 13.2), over the voice bridge's
 * faster-whisper worker.
 *
 * The worker takes a file and returns a transcript, so this declares itself
 * non-streaming. The framework's `StreamAdapter` puts a voice detector in front
 * of it and turns it into a stream, which is the supported way to use an engine
 * that cannot stream.
 */
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AudioBuffer, asLanguageCode, mergeFrames, stt } from "@livekit/agents";
import { encodeWav } from "../audio/pcm.ts";
import { MODELS, Worker, cudaLibraryPath } from "./worker.ts";

const MODEL = process.env.VOICEOVER_STT_MODEL ?? "small.en";

export class WhisperSTT extends stt.STT {
  label = "caller.WhisperSTT";
  private worker = new Worker("stt_worker.py", [MODEL, MODELS], { LD_LIBRARY_PATH: cudaLibraryPath() });
  private started: Promise<unknown> | null = null;

  constructor() {
    super({ streaming: false, interimResults: false });
  }

  /** Loading costs seconds, so warm it before a call rather than inside one. */
  async warm(): Promise<void> {
    this.started ??= this.worker.start();
    await this.started;
  }

  async _recognize(buffer: AudioBuffer): Promise<stt.SpeechEvent> {
    await this.warm();
    const frame = mergeFrames(buffer);
    const path = join(tmpdir(), `caller-stt-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    await writeFile(path, encodeWav(frame.data, frame.sampleRate));
    const reply = await this.worker.ask({ wav: path });
    const text = String(reply.text ?? "").trim();
    const seconds = frame.samplesPerChannel / frame.sampleRate;
    return {
      type: stt.SpeechEventType.FINAL_TRANSCRIPT,
      alternatives: [{ language: asLanguageCode("en"), text, startTime: 0, endTime: seconds, confidence: 1 }],
    };
  }

  stream(): never {
    // 4.5 of the bridge's rule carried here: a local engine only, and this one
    // cannot stream. Wrap it in the framework's StreamAdapter instead.
    throw new Error("WhisperSTT does not stream; wrap it in the framework's StreamAdapter with a VAD");
  }

  async close(): Promise<void> {
    this.worker.stop();
  }
}
