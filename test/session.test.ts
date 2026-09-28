/**
 * The Parts seam (spec 13.6.1): the assembly runs with fakes in its place.
 *
 * Before `Parts` existed there was no parameter a fake could enter through, so
 * `buildEngines` needed a Python venv, a CUDA wheel tree, a Silero download and
 * an OpenRouter key to run at all, and had no tests. This file needs none of
 * them: it asserts the wiring, which is the part that broke silently.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { type llm, inference, initializeLogger } from "@livekit/agents";
import { type Parts, buildEngines } from "../src/call/session.ts";
import { constants } from "../src/call/state.ts";
import type { KokoroTTS } from "../src/speech/kokoro.ts";
import type { WhisperSTT } from "../src/speech/stt.ts";

// `new AgentSession` reads the framework's global logger and throws a TypeError
// when nothing has set one. Every path that builds a session calls this first
// (`room.ts`, `scripts/call.ts`, and the worker for a job), so a test does too.
beforeAll(() => initializeLogger({ pretty: false, level: "silent" }));

/** A voice that reports a rate and counts its warm, which is all the assembly asks of one. */
function fakeVoice() {
  const it = {
    warmed: 0,
    closed: 0,
    sampleRate: 24_000,
    numChannels: 1,
    label: "fake-tts",
    capabilities: { streaming: false },
    warm: async () => {
      it.warmed++;
    },
    close: async () => {
      it.closed++;
    },
    stream: () => {
      throw new Error("a fake voice does not stream");
    },
    synthesize: () => {
      throw new Error("a fake voice does not synthesize");
    },
    on: () => it,
    off: () => it,
    emit: () => false,
  };
  return it;
}

function fakeEars() {
  const it = {
    warmed: 0,
    closed: 0,
    label: "fake-stt",
    capabilities: { streaming: false, interimResults: false },
    warm: async () => {
      it.warmed++;
    },
    close: async () => {
      it.closed++;
    },
    stream: () => {
      throw new Error("a fake transcriber does not stream");
    },
    recognize: () => {
      throw new Error("a fake transcriber does not recognize");
    },
    on: () => it,
    off: () => it,
    emit: () => false,
  };
  return it;
}

/** The voice detector and the brain are only held and handed on, so a token stands in. */
const fakeVad = { label: "fake-vad", stream: () => ({}) } as unknown as NonNullable<Parts["vad"]>;
const fakeBrain = { label: "fake-llm" } as unknown as llm.LLM;

function parts() {
  const voice = fakeVoice();
  const ears = fakeEars();
  return {
    voice,
    ears,
    given: {
      voice: voice as unknown as KokoroTTS,
      ears: ears as unknown as WhisperSTT,
      vad: fakeVad,
      brain: fakeBrain,
    } satisfies Parts,
  };
}

describe("buildEngines takes its parts rather than making them", () => {
  test("it warms both engines before the call, never inside one (3.1)", async () => {
    const p = parts();
    const built = await buildEngines({ turnTaking: false }, p.given);
    expect(p.voice.warmed).toBe(1);
    expect(p.ears.warmed).toBe(1);
    expect(built.session).toBeDefined();
    expect(built.voice).toBe(p.given.voice);
    expect(built.ears).toBe(p.given.ears);
  });

  test("close() closes both, so a call leaves no worker behind", async () => {
    const p = parts();
    const built = await buildEngines({ turnTaking: false }, p.given);
    await built.close();
    expect(p.voice.closed).toBe(1);
    expect(p.ears.closed).toBe(1);
  });

  test("it needs no OPENROUTER_API_KEY when the brain is given", async () => {
    const key = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const built = await buildEngines({ turnTaking: false }, parts().given);
      expect(built.session).toBeDefined();
    } finally {
      if (key !== undefined) process.env.OPENROUTER_API_KEY = key;
    }
  });

  test("turnTaking pins the framework's turn values to the product's constants (17.2)", async () => {
    const detector = new inference.TurnDetector({ version: "v1-mini" });
    const withTurns = await buildEngines({ turnTaking: true }, { ...parts().given, turnDetection: detector });
    const without = await buildEngines({ turnTaking: false }, { ...parts().given, turnDetection: detector });
    // The framework resolves what it was handed onto `sessionOptions`, so read
    // it back from there rather than trusting the object we passed in. It also
    // prefers `turnHandling.turnDetection` over the deprecated flat field
    // (agent_session.js:719), which is why 17.5 says to use the object.
    const turns = (e: { session: unknown }) =>
      (e.session as { sessionOptions: { turnHandling: { turnDetection?: unknown; interruption?: { minWords?: number } } } })
        .sessionOptions.turnHandling;

    // 17.3: two words, raised from the framework's own zero on purpose.
    expect(turns(withTurns).interruption?.minWords).toBe(constants.minInterruptionWords);
    expect(turns(withTurns).interruption?.minWords).toBe(2);
    expect(turns(withTurns).turnDetection).toBe(detector);

    // `turnTaking: false` withholds the detector this product names and 17.3's
    // interruption values. It does not leave the session without turn
    // detection: the framework builds its own whenever none is configured
    // (agent_session.js:326), and only `turnDetection: null` turns it off. So
    // the receiver was never missing a detector — it was missing these values.
    expect(turns(without).turnDetection).not.toBe(detector);
    expect(turns(without).turnDetection).toBeDefined();
    expect(turns(without).interruption?.minWords).not.toBe(2);
  });
});
