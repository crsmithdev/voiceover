/**
 * The two speech adapters, end to end and locally (spec 12.4 in miniature):
 * the voice says a sentence and the transcriber reads it back. No network, no
 * telephone, no brain.
 *
 * These need the voice bridge and its models, so they skip when it is absent
 * rather than fail on a machine that does not have it.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { initializeLogger } from "@livekit/agents";
import { decodeWav, encodeWav } from "../src/audio/pcm.ts";
import { WhisperSTT } from "../src/speech/stt.ts";
import { PiperTTS } from "../src/speech/tts.ts";
import { BRIDGE, pythonBin } from "../src/speech/worker.ts";

describe("encodeWav", () => {
  test("round trips through decodeWav", () => {
    const samples = new Int16Array([0, 1234, -1234, 32767, -32768]);
    const decoded = decodeWav(encodeWav(samples, 22_050));
    expect(decoded.sampleRate).toBe(22_050);
    expect([...decoded.samples]).toEqual([...samples]);
  });
});

const available = existsSync(pythonBin()) && existsSync(`${BRIDGE}/speech/tts_worker.py`);
const describeLocal = available ? describe : describe.skip;

describeLocal("the local engines", () => {
  // The framework's classes log, and its logger is global rather than injected.
  beforeAll(() => initializeLogger({ pretty: false, level: "silent" }));

  const voice = new PiperTTS();
  const ears = new WhisperSTT();
  afterAll(async () => {
    await voice.close();
    await ears.close();
  });

  test(
    "the voice produces audio at the rate it declared",
    async () => {
      const frame = await voice.synthesize("Tuesday the twenty-second at nine fifteen.").collect();
      expect(frame.sampleRate).toBe(22_050);
      expect(frame.samplesPerChannel).toBeGreaterThan(11_000); // over half a second
      let peak = 0;
      for (const sample of frame.data) peak = Math.max(peak, Math.abs(sample));
      // The frame copy fault publishes near-silence rather than a stutter.
      expect(peak).toBeGreaterThan(1_000);
    },
    60_000,
  );

  test(
    "the transcriber reads back what the voice said",
    async () => {
      const said = "Thursday at eight thirty works for him.";
      const frame = await voice.synthesize(said).collect();
      const event = await ears._recognize(frame);
      const heard = event.alternatives?.[0]?.text.toLowerCase() ?? "";
      expect(heard).toContain("thursday");
      expect(heard).toContain("works for him");
      // The words come back as words and the numbers come back as digits:
      // "eight thirty" is transcribed "8.30". Anything that compares a
      // transcript to what was said has to expect that (see 15.10).
      expect(heard).toMatch(/8[.:]30|eight thirty/);
    },
    120_000,
  );

  test(
    "silence transcribes to nothing rather than to a word",
    async () => {
      // Whisper writes "you" or "Thank you." for silence unless the voice
      // filter is on. The bridge's worker turns it on; this checks it stayed on.
      const silence = await voice.synthesize("Hello.").collect();
      const quiet = new Int16Array(silence.samplesPerChannel);
      const { AudioFrame } = await import("@livekit/rtc-node");
      const event = await ears._recognize(new AudioFrame(quiet, 22_050, 1, quiet.length));
      expect(event.alternatives?.[0]?.text.trim()).toBe("");
    },
    120_000,
  );
});
