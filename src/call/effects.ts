/**
 * What doing something looks like, so the state machine can decide it (spec 6.4).
 *
 * `state.ts` has always computed the actions a call needs and every caller threw
 * them away, so the soft and hard limits were decided twice: once in the reducer
 * with 24 tests behind it, and once imperatively in `agent.ts` with none. Only
 * the untested copy acted. This is the seam that ends that.
 *
 * One method, not one per action. `Action` is a closed union, so `perform` stays
 * one method however many kinds it grows, and an interface with a member each
 * would be as wide as the union it serves.
 */
import type { AgentSession } from "@livekit/agents";
import type { Action, EndReason, Phase } from "./state.ts";

export interface Effects {
  perform(action: Action): void;
}

/** Does nothing, for a caller that has not been moved across the seam yet. */
export const inert: Effects = { perform: () => {} };

/** Collects what was decided, for a test and for `run()`. */
export function recorded(into: Action[]): Effects {
  return { perform: (action) => void into.push(action) };
}

export interface FrameworkEnds {
  /** A getter, because the job builds the bridge before the engines exist. */
  readonly session: AgentSession;
  /** 11.2 the close speaks one more line and never cuts the one in flight. */
  closingLine: string;
  /** Ends the call for this reason. The job owns the teardown and the report. */
  end(reason: EndReason): void;
  note(text: string, tone?: "amber" | "green" | "red"): void;
  /**
   * The reducer's own phase changes do not reach `onPhase`, which the framework's
   * agent state drives instead (bridge.ts:131). Until those two producers are
   * one, the close says so itself, exactly where the job used to.
   */
  phase(phase: Phase): void;
}

/**
 * The live adapter: the framework performs what the reducer decided.
 *
 * `speak`, `resumePlayback` and `cancelBrain` are deliberately not wired. The
 * framework owns the speaking path (13.6) and drives it from its own turn
 * handling; the reducer's copies of those actions describe the same thing rather
 * than commanding it, and wiring both would give one sentence two sources. What
 * the reducer alone decides is when a call ends, and that is what this performs.
 */
export function framework(ends: FrameworkEnds): Effects {
  return {
    perform(action: Action) {
      switch (action.kind) {
        case "beginClose":
          ends.note("Soft limit. It closes after the current sentence.", "amber");
          ends.phase("closing");
          // 11.2 allowInterruptions off: the close is the last thing it says.
          void ends.session
            .generateReply({ instructions: ends.closingLine, allowInterruptions: false })
            .waitForPlayout()
            .then(() => ends.end("soft-limit"))
            .catch(() => ends.end("soft-limit"));
          break;

        case "stopPlayback":
          // 11.3 the hard limit cuts, and only the hard limit does. `force`
          // because an uninterruptible close must still yield to the cut, and
          // `.await` because interrupt returns a Future, not a promise.
          void ends.session
            .interrupt({ force: true })
            .await.catch(() => undefined);
          break;

        case "endCall":
          ends.end(action.reason);
          break;

        // The report is written by the job from local state (11.4), on the way
        // out of every ending, so `endCall` already covers it.
        case "writeReport":
        case "speak":
        case "resumePlayback":
        case "sendToBrain":
        case "cancelBrain":
          break;
      }
    },
  };
}
