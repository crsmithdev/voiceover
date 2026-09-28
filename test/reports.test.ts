/**
 * Where reports live, and for how long (spec 18.6, 11.4).
 *
 * The write was tested. The listing, the thirty-day expiry and the fact that a
 * `.json` and its `.txt` are one unit lived in an HTTP handler and were not,
 * which meant the rule that the other party's words do not accumulate forever
 * ran only when somebody opened the log.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { readdir, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Report } from "../src/call/report.ts";
import { KEEP_DAYS, reports } from "../src/call/reports.ts";
import { constants } from "../src/call/state.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "voiceover-reports-"));
  dirs.push(dir);
  return dir;
}

function report(overrides: Partial<Report> = {}): Report {
  return {
    number: "+15551230000",
    goal: "check the line",
    outcome: "goal-closed",
    answeredBy: "person",
    clean: true,
    startedAt: 0,
    endedAt: 1_000,
    durationMs: 1_000,
    phaseAtEnd: "closing",
    said: ["Hello."],
    heard: ["Hi."],
    blocked: [],
    disclosureLeftOwed: false,
    timings: [],
    middleReplyMs: null,
    ranUnder: constants,
    trace: [],
    ...overrides,
  };
}

describe("writing a report", () => {
  test("it writes the record and the readable summary beside it (11.4)", async () => {
    const dir = scratch();
    const path = await reports(dir).write(report());
    expect(path.endsWith(".json")).toBe(true);
    const names = await readdir(dir);
    expect(names).toHaveLength(2);
    expect(names.some((n) => n.endsWith(".txt"))).toBe(true);
  });

  test("the name carries the ending time and the digits of the number", async () => {
    const dir = scratch();
    const path = await reports(dir).write(report({ endedAt: Date.UTC(2026, 8, 27, 12, 0, 0) }));
    expect(path).toContain("2026-09-27");
    expect(path).toContain("15551230000");
  });
});

describe("listing them", () => {
  test("newest first", async () => {
    const dir = scratch();
    const store = reports(dir);
    await store.write(report({ endedAt: 1_000, goal: "older" }));
    await store.write(report({ endedAt: 9_000, goal: "newer" }));
    const listed = await store.list();
    expect(listed.map((r) => r.goal)).toEqual(["newer", "older"]);
  });

  test("each carries the file it came from", async () => {
    const dir = scratch();
    const store = reports(dir);
    await store.write(report());
    const [only] = await store.list();
    expect(only?.file.endsWith(".json")).toBe(true);
  });

  test("what was measured survives the round trip, which is the point of 15.16", async () => {
    const dir = scratch();
    const store = reports(dir);
    await store.write(
      report({
        timings: [{ pause: 500, stt: 120, brain: 868, voice: 190, total: 1_678 }],
        middleReplyMs: 1_678,
      }),
    );
    const [only] = await store.list();
    expect(only?.middleReplyMs).toBe(1_678);
    expect(only?.timings[0]?.brain).toBe(868);
    // 17.2: a report has to say which constants produced it.
    expect(only?.ranUnder.minInterruptionWords).toBe(2);
    expect(only?.ranUnder.deadAirMs).toBe(constants.deadAirMs);
  });

  test("a directory that does not exist lists nothing rather than throwing", async () => {
    expect(await reports(join(scratch(), "never-written")).list()).toEqual([]);
  });

  test("a half-written report is skipped and left alone", async () => {
    const dir = scratch();
    const store = reports(dir);
    await store.write(report());
    await Bun.write(join(dir, "9999-half.json"), "{ not json");
    const listed = await store.list();
    expect(listed).toHaveLength(1);
    // A call that is still ending owns that file, so nothing deletes it.
    expect((await readdir(dir)).some((n) => n === "9999-half.json")).toBe(true);
  });
});

describe("the thirty-day expiry (18.6)", () => {
  test("an older report and its summary are both deleted", async () => {
    const dir = scratch();
    const store = reports(dir);
    const path = await store.write(report());
    const old = new Date(Date.now() - (KEEP_DAYS + 1) * 864e5);
    await utimes(path, old, old);
    await utimes(path.replace(/\.json$/, ".txt"), old, old);

    expect(await store.list()).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  });

  test("one just inside the window is kept", async () => {
    const dir = scratch();
    const store = reports(dir);
    const path = await store.write(report());
    const recent = new Date(Date.now() - (KEEP_DAYS - 1) * 864e5);
    await utimes(path, recent, recent);
    expect(await store.list()).toHaveLength(1);
    expect(await stat(path)).toBeDefined();
  });

  test("the cutoff is taken from a given time, so the rule is testable at all", async () => {
    const dir = scratch();
    const store = reports(dir);
    await store.write(report());
    // Far enough in the future that anything on disk is past keeping.
    expect(await store.list(Date.now() + (KEEP_DAYS + 2) * 864e5)).toEqual([]);
  });
});

/**
 * Four reports written before the measured fields existed were on disk when this
 * landed, so the type has to stay true for them. An empty list of timings says
 * no turn was measured, which is what those calls can honestly claim.
 */
describe("a report written before the measured fields existed", () => {
  test("it lists with the fields filled in rather than undefined", async () => {
    const dir = scratch();
    const { timings, middleReplyMs, ranUnder, ...old } = report();
    await Bun.write(join(dir, "2026-09-01-15551230000.json"), JSON.stringify(old));

    const [only] = await reports(dir).list();
    expect(only?.timings).toEqual([]);
    expect(only?.middleReplyMs).toBeNull();
    expect(only?.ranUnder).toEqual(constants);
  });
});
