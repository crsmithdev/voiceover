/**
 * The call report (spec 1.5, 9.8, 11.4).
 *
 * 1.5 says a call does not end without a report. 11.4 says the report is
 * written from local state and never through the brain, because the fault that
 * ended the call can be the brain. So nothing here calls anything: it reads the
 * state the reducer already holds and turns it into a record.
 */
import { type AnsweredBy, type CallState, type Constants, type EndReason, constants } from "./state.ts";

/**
 * One turn's latency, split the way Section 15 splits it.
 *
 * It lives here rather than beside the code that measures it, because the report
 * is where it ends up and 15.15.5 is a rule about how it is reported: the pause
 * is a setting, not a cost, so it is never folded into the total's explanation.
 */
export interface TurnTiming {
  /** End of speech to the turn being committed, the transcriber's time inside it. */
  pause: number;
  stt: number;
  /** The brain, to its first token. */
  brain: number;
  /** The voice, to its first audio. */
  voice: number;
  total: number;
}

export interface CallContext {
  number: string;
  goal: string;
  /** What the far end said, as the speech-to-text heard it. */
  heard: string[];
  /**
   * What the caller said. It comes from the session rather than from the state
   * machine: the framework owns playback, so `state.delivered` never fills in a
   * real call and a report built from it claims the caller said nothing.
   */
  said: string[];
  /** Facts the brief did not hold, which the caller deferred (9.4, 9.8). */
  blocked: string[];
}

export interface Report {
  number: string;
  goal: string;
  outcome: EndReason | "unknown";
  /** null when nothing answered at all. */
  answeredBy: AnsweredBy | null;
  /** True when the goal was reached or refused cleanly, not cut short. */
  clean: boolean;
  startedAt: number | null;
  endedAt: number;
  durationMs: number | null;
  phaseAtEnd: string;
  said: string[];
  heard: string[];
  blocked: string[];
  /** 10.2: a question the caller never answered is a failure worth seeing first. */
  disclosureLeftOwed: boolean;
  /**
   * 15.16 the per-turn latency this call actually had.
   *
   * The bridge measured these all along and nothing kept them: they reached the
   * console live and stopped there, so the one number the product's central
   * claim rests on could not be read back after the call. `pause` is reported on
   * its own because a pause is a setting, not a cost (15.15.5).
   */
  timings: TurnTiming[];
  /** The middle total of those turns, or null when no turn completed. */
  middleReplyMs: number | null;
  /**
   * 17.2 the constants this call ran under.
   *
   * A default that is not written down is a dependency that can move, and a
   * report read next month has to say which values produced it. This is
   * sidetone's `settingsInForce` in its record header, for the same reason.
   */
  ranUnder: Constants;
  trace: string[];
}

const CLEAN: EndReason[] = ["goal-closed", "message-left", "caller-hung-up"];

export interface Measured {
  timings: TurnTiming[];
  middleReplyMs: number | null;
  ranUnder: Constants;
}

export function buildReport(
  state: CallState,
  context: CallContext,
  endedAt: number,
  measured: Measured = { timings: [], middleReplyMs: null, ranUnder: constants },
): Report {
  return {
    number: context.number,
    goal: context.goal,
    outcome: state.endReason ?? "unknown",
    answeredBy: state.answeredBy,
    clean: state.endReason !== null && CLEAN.includes(state.endReason),
    startedAt: state.startedAt,
    endedAt,
    durationMs: state.startedAt === null ? null : endedAt - state.startedAt,
    phaseAtEnd: state.phase,
    said: context.said,
    heard: context.heard,
    blocked: context.blocked,
    disclosureLeftOwed: state.owedDisclosure,
    timings: measured.timings,
    middleReplyMs: measured.middleReplyMs,
    ranUnder: measured.ranUnder,
    trace: state.trace,
  };
}

const REASONS: Record<EndReason | "unknown", string> = {
  "goal-closed": "the caller closed the call",
  "soft-limit": "the call reached the soft limit and closed",
  "hard-limit": "the call was cut at the hard limit",
  "message-left": "a message was left on a voicemail machine",
  "far-end-hung-up": "the other party hung up",
  "caller-hung-up": "the caller ended the call",
  "operator-hung-up": "Chris hung up from the console",
  "dead-line": "the line was dead",
  "dead-air": "the caller went silent and the call was ended from this side",
  unknown: "the call ended without a reason being recorded",
};

/** A few lines a person can read without opening the record. */
export function summarise(report: Report): string {
  const seconds = report.durationMs === null ? "unknown" : `${Math.round(report.durationMs / 1000)} s`;
  const answered =
    report.answeredBy === null
      ? "nothing answered"
      : report.answeredBy === "unknown"
        ? "something answered, and nothing could tell what"
        : `answered by a ${report.answeredBy === "person" ? "person" : report.answeredBy}`;
  const lines = [
    `${report.number} — ${REASONS[report.outcome]}`,
    answered,
    `goal: ${report.goal}`,
    `${seconds}, ${report.said.length} said, ${report.heard.length} heard`,
  ];
  if (report.blocked.length) {
    lines.push(`blocked, ${report.blocked.length}:`);
    for (const item of report.blocked) lines.push(`  - ${item}`);
  }
  if (report.disclosureLeftOwed) lines.push("WARNING: a direct question about being a machine went unanswered");
  if (!report.clean) lines.push(`WARNING: the call did not close cleanly, and stopped while ${report.phaseAtEnd}`);
  return lines.join("\n");
}
