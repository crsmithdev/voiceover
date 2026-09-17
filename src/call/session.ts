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
import { PiperTTS } from "../speech/tts.ts";
import { constants } from "./state.ts";

const BRAIN = process.env.CALLER_BRAIN ?? "anthropic/claude-haiku-4.5";
/** The framework's own name for the end-of-turn inference method. */
const EOT_METHOD = "lk_eot_audio";
const ROUTE = process.env.CALLER_BRAIN_BASE_URL ?? "https://openrouter.ai/api/v1";

export interface Engines {
  session: AgentSession;
  agent: Agent;
  /** Held so a call can warm them before dialling and close them after. */
  voice: PiperTTS;
  ears: WhisperSTT;
  close(): Promise<void>;
}

export interface SessionHooks {
  /** 9.8: the caller names a detail it could not give, so the report can carry it. */
  onDeferred?(detail: string): void;
}

export async function buildSession(brief: Brief, hooks: SessionHooks = {}): Promise<Engines> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set; put it in .env");

  const voice = new PiperTTS();
  const ears = new WhisperSTT();
  // Loading costs seconds each. Spec 3.1 allows that before a call, never inside one.
  await Promise.all([voice.warm(), ears.warm()]);

  const vad = await silero.VAD.load();

  const options: AgentSessionOptions = {
    vad,
    // Both engines take a file and return a result, so the framework supplies
    // the streaming: a voice detector in front of one, a sentence rule in front
    // of the other (spec 13.6.1).
    stt: new sttNs.StreamAdapter(ears, vad),
    tts: new ttsNs.StreamAdapter(voice, new tokenize.basic.SentenceTokenizer()),
    llm: new openai.LLM({ model: BRAIN, baseURL: ROUTE, apiKey }),
    // 8.4. The local model, explicitly: the cloud one would be a paid network
    // call on the hot path, which 13.8 forbids.
    turnDetection: new inference.TurnDetector({ version: "v1-mini" }),
    turnHandling: {
      interruption: {
        minDuration: constants.minInterruptionMs,
        // 17.3. The framework default is 0 and the echo defence needs a word.
        minWords: constants.minInterruptionWords,
        falseInterruptionTimeout: constants.falseInterruptionMs,
        resumeFalseInterruption: true,
      },
    },
  };

  // The local end-of-turn model needs an inference executor, and the executor
  // only exists under the framework's worker model, which registers the runner
  // in `worker.js`. A standalone session gets neither and the detector quietly
  // pins every prediction to 1.0, which is the fixed-delay endpointing that
  // spec 8.2 rejects. Say so loudly rather than let one log line carry it.
  if (!InferenceRunner.registeredRunners[EOT_METHOD]) {
    console.warn(
      "WARNING: the local end-of-turn model is not available in a standalone session.\n" +
        "         Turns will commit on a fixed delay instead (spec 8.2 calls that not good enough).\n" +
        "         Running under the framework's worker model is what registers it (spec 18.14).",
    );
  }

  const session = new AgentSession(options);
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

  return {
    session,
    agent,
    voice,
    ears,
    close: async () => {
      await voice.close();
      await ears.close();
    },
  };
}
