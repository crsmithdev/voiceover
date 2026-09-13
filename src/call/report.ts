/**
 * The call report (spec 1.5, 9.8, 11.4).
 *
 * 1.5 says a call does not end without a report. 11.4 says the report is
 * written from local state and never through the brain, because the fault that
 * ended the call can be the brain. So nothing here calls anything: it reads the
 * state the reducer already holds and turns it into a record.
 */
import type { AnsweredBy, CallState, EndReason } from "./state.ts";

export interface CallContext {
  number: string;
  goal: string;
  /** What the far end said, as the speech-to-text heard it. */
  heard: string[];
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
  trace: string[];
}

const CLEAN: EndReason[] = ["goal-closed", "message-left", "caller-hung-up"];

export function buildReport(state: CallState, context: CallContext, endedAt: number): Report {
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
    said: state.delivered,
    heard: context.heard,
    blocked: context.blocked,
    disclosureLeftOwed: state.owedDisclosure,
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
  "dead-line": "the line was dead",
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
