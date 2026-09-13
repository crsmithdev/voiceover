/** The report (spec 1.5, 9.8, 11.4). */
import { describe, expect, test } from "bun:test";
import { buildReport, summarise } from "../src/call/report.ts";
import { type Event, constants, run } from "../src/call/state.ts";

const context = {
  number: "+14155550100",
  goal: "book a cleaning, weekday morning",
  heard: ["Can you spell the last name?"],
  blocked: [],
};

const k = { ...constants, softLimitMs: 10_000, hardLimitMs: 20_000 };

const closed: Event[] = [
  { kind: "dial", at: 0 },
  { kind: "answered", at: 1_000, by: "person" },
  { kind: "sentenceReady", at: 1_500, text: "Thanks very much, goodbye." },
  { kind: "tick", at: 11_000 },
  { kind: "playbackFinished", at: 12_000 },
  { kind: "sentenceReady", at: 12_500, text: "Have a good day." },
  { kind: "playbackFinished", at: 14_000 },
];

describe("buildReport", () => {
  test("a closed call reads as clean", () => {
    const { state } = run(closed, k);
    const report = buildReport(state, context, 14_000);
    expect(report.outcome).toBe("goal-closed");
    expect(report.clean).toBe(true);
    expect(report.durationMs).toBe(14_000);
    expect(report.said).toHaveLength(2);
  });

  test("a cut call reads as not clean and says why", () => {
    const { state } = run(
      [
        { kind: "dial", at: 0 },
        { kind: "answered", at: 1_000, by: "person" },
        { kind: "sentenceReady", at: 1_500, text: "One moment." },
        { kind: "tick", at: 21_000 },
      ],
      k,
    );
    const report = buildReport(state, context, 21_000);
    expect(report.outcome).toBe("hard-limit");
    expect(report.clean).toBe(false);
    expect(summarise(report)).toContain("cut at the hard limit");
  });

  test("the report needs nothing but the state, so a dead brain cannot stop it", () => {
    const { state } = run([{ kind: "dial", at: 0 }, { kind: "answered", at: 800, by: "dead" }], k);
    const report = buildReport(state, context, 800);
    expect(report.outcome).toBe("dead-line");
    expect(report.trace.length).toBeGreaterThan(0);
  });

  test("an unanswered disclosure question is shouted about", () => {
    const { state } = run(
      [
        { kind: "dial", at: 0 },
        { kind: "answered", at: 1_000, by: "person" },
        { kind: "transcript", at: 1_400, words: 4, disclosureQuestion: true },
        { kind: "farEndHungUp", at: 2_000 },
      ],
      k,
    );
    const report = buildReport(state, context, 2_000);
    expect(report.disclosureLeftOwed).toBe(true);
    expect(summarise(report)).toContain("WARNING: a direct question");
  });

  test("blocked items are listed for Chris", () => {
    const { state } = run(closed, k);
    const report = buildReport(state, { ...context, blocked: ["date of birth", "insurance member id"] }, 14_000);
    const text = summarise(report);
    expect(text).toContain("blocked, 2:");
    expect(text).toContain("insurance member id");
  });
});
