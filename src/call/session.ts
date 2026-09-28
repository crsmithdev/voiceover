/**
 * The agent session (spec 13.6): the framework's parts, configured.
 *
 * The division of labour is worth stating, because revision 3 blurred it. The
 * framework owns the mechanics of a turn: the voice detector, the end-of-turn
 * model, interruption and its false-interruption resume. The state machine in
 * `state.ts` owns the call: what answered, the limits, the disclosure debt and
 * the report. Neither reimplements the other.
 */
import {
  type AgentSessionOptions,
  Agent,
  AgentSession,
  InferenceRunner,
  getJobContext,
  inference,
  llm,
  stt as sttNs,
  tokenize,
  tts as ttsNs,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import { type Brief, instructionsFor } from "./brief.ts";
import { prompt } from "../prompts.ts";
import { WhisperSTT } from "../speech/stt.ts";
import { KokoroTTS } from "../speech/kokoro.ts";
import { PiperTTS } from "../speech/tts.ts";
import { constants } from "./state.ts";

const BRAIN = process.env.VOICEOVER_BRAIN ?? "anthropic/claude-haiku-4.5";
/** One of Kokoro's 54 voices. Chris picks it by ear; `scripts/voices.ts` renders them. */
const VOICEOVER_VOICE = process.env.VOICEOVER_KOKORO_VOICE ?? "am_michael";
/** The framework's own name for the end-of-turn inference method. */
const EOT_METHOD = "lk_eot_audio";
const ROUTE = process.env.VOICEOVER_BRAIN_BASE_URL ?? "https://openrouter.ai/api/v1";

export interface Engines {
  session: AgentSession;
  agent: Agent;
  /** Held so a call can warm them before dialling and close them after. */
  voice: KokoroTTS | PiperTTS;
  ears: WhisperSTT;
  close(): Promise<void>;
}

export interface SessionHooks {
  /** 9.8: the caller names a detail it could not give, so the report can carry it. */
  onDeferred?(detail: string): void;
}

/**
 * Everything that differs between a real call and a test, and nothing else.
 *
 * Every field is optional, so a call passes none of them and gets what it
 * always got. A test passes fakes and needs no GPU, no Python and no key. Named
 * after sidetone's `Parts` in `src/bridge.ts`, which exists for the same reason:
 * the assembly has one copy, and only the pieces under it are swapped.
 */
export interface Parts {
  voice?: KokoroTTS | PiperTTS;
  ears?: WhisperSTT;
  brain?: llm.LLM;
  vad?: AgentSessionOptions["vad"];
  turnDetection?: NonNullable<AgentSessionOptions["turnHandling"]>["turnDetection"];
}

/** What the caller and the receiver assemble identically. The `Agent` is not part of it. */
export interface Built {
  session: AgentSession;
  voice: KokoroTTS | PiperTTS;
  ears: WhisperSTT;
  close(): Promise<void>;
}

export interface BuildOptions {
  /** One of Kokoro's 54 voices, or unset for the caller's own. */
  voiceName?: string;
  /** The brain to route to, or unset for the caller's own (4.6). */
  brain?: string;
  /**
   * Whether this side gets 8.4's local model and 17.3's interruption constants.
   *
   * Read what `false` does not mean. The framework builds its own
   * `InferenceTurnDetector` whenever none is configured
   * (`agent_session.js:326`), so `false` does not leave a session with no turn
   * detection — only `turnDetection: null` does that. What `false` withholds is
   * the v1-mini detector this product names and the interruption values of
   * 17.3, which is the real difference between the caller and the receiver.
   *
   * The receiver takes `false` because it is not a job: nothing in
   * `src/rehearsal` defines an agent or takes a `JobContext`, so 8.5 applies and
   * no executor exists for a local model to run in. Its turns therefore commit
   * on a delay whatever is configured, and rehearsal turn timing is not the
   * caller's turn timing. Turning this on for the receiver would not fix that.
   */
  turnTaking: boolean;
}

export async function buildEngines(options: BuildOptions, parts: Parts = {}): Promise<Built> {
  // 18.12: Kokoro on the card, and never the voice the bridge speaks with
  // (18.12.2). `VOICEOVER_TTS=piper` falls back to the bridge's own voice.
  const voice =
    parts.voice ??
    (process.env.VOICEOVER_TTS === "piper" ? new PiperTTS() : new KokoroTTS(options.voiceName ?? VOICEOVER_VOICE));
  const ears = parts.ears ?? new WhisperSTT();
  // Loading costs seconds each. Spec 3.1 allows that before a call, never inside one.
  await Promise.all([voice.warm(), ears.warm()]);

  const vad = parts.vad ?? (await silero.VAD.load());
  const brain = parts.brain ?? openRouter(options.brain ?? BRAIN);

  const sessionOptions: AgentSessionOptions = {
    vad,
    // Both engines take a file and return a result, so the framework supplies
    // the streaming: a voice detector in front of one, a sentence rule in front
    // of the other (spec 13.6.1).
    stt: new sttNs.StreamAdapter(ears, vad),
    tts: new ttsNs.StreamAdapter(voice, new tokenize.basic.SentenceTokenizer()),
    llm: brain,
    ...(options.turnTaking
      ? {
          // 17.5: the flat options are deprecated, so every turn value goes in
          // the object, `turnDetection` included.
          turnHandling: {
            // 8.4. The local model, explicitly: the cloud one would be a paid
            // network call on the hot path, which 13.8 forbids.
            turnDetection: parts.turnDetection ?? new inference.TurnDetector({ version: "v1-mini" }),
            interruption: {
              minDuration: constants.minInterruptionMs,
              // 17.3. The framework default is 0 and the echo defence needs a word.
              minWords: constants.minInterruptionWords,
              falseInterruptionTimeout: constants.falseInterruptionMs,
              resumeFalseInterruption: true,
            },
          },
        }
      : {}),
  };

  // The local end-of-turn model needs an inference executor, and the executor
  // only exists under the framework's worker model, which registers the runner
  // in `worker.js`. A standalone session gets neither and the detector quietly
  // pins every prediction to 1.0, which is the fixed-delay endpointing that
  // spec 8.2 rejects. Say so loudly rather than let one log line carry it.
  // Inside a job the runner is registered in the worker process and the
  // executor arrives on the job context, so the registry here says nothing.
  // Outside one there is no executor at all, which is 8.5.
  if (options.turnTaking && !getJobContext(false) && !InferenceRunner.registeredRunners[EOT_METHOD]) {
    console.warn(
      "WARNING: the local end-of-turn model is not available in a standalone session.\n" +
        "         Turns will commit on a fixed delay instead (spec 8.2 calls that not good enough).\n" +
        "         Running under the framework's worker model is what registers it (spec 18.14).",
    );
  }

  return {
    session: new AgentSession(sessionOptions),
    voice,
    ears,
    close: async () => {
      await voice.close();
      await ears.close();
    },
  };
}

/** The one route to a hosted brain (4.8). A `Parts.brain` skips it entirely. */
export function openRouter(model: string): llm.LLM {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set; put it in .env");
  return new openai.LLM({ model, baseURL: ROUTE, apiKey });
}

export async function buildSession(
  brief: Brief,
  hooks: SessionHooks = {},
  parts: Parts = {},
): Promise<Engines> {
  const built = await buildEngines({ turnTaking: true }, parts);
  const agent = new Agent({
    instructions: instructionsFor(brief),
    tools: {
      // 9.8 asks for every blocked item in the report. Nothing else can know
      // what the caller withheld or deferred, so the caller says it itself.
      note_deferred_detail: llm.tool({
        description: prompt("caller.tool.note-deferred"),
        parameters: {
          type: "object",
          properties: {
            detail: {
              type: "string",
              description: "One short line naming what was asked for and why it was not given.",
            },
          },
          required: ["detail"],
        },
        execute: async ({ detail }: { detail: string }) => {
          hooks.onDeferred?.(detail);
          return "Noted for the report. Carry on with the call.";
        },
      }),
    },
  });

  return { ...built, agent };
}
