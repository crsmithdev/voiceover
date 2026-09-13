/** Where a report lands (spec 18.6 has not decided this; the location is provisional). */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReport } from "../src/call/report.ts";
import { writeReport } from "../src/call/reportStore.ts";
import { run } from "../src/call/state.ts";

const dir = await mkdtemp(join(tmpdir(), "caller-reports-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("writeReport", () => {
  test("writes a record and a summary a person can read", async () => {
    const { state } = run([{ kind: "dial", at: 0 }, { kind: "answered", at: 800, by: "dead" }]);
    const report = buildReport(state, { number: "+14155550100", goal: "book a cleaning", heard: [], blocked: [] }, 800);

    const path = await writeReport(report, dir);
    const written = await readdir(dir);
    expect(written).toHaveLength(2);
    expect(path.endsWith(".json")).toBe(true);

    const record = JSON.parse(await readFile(path, "utf8"));
    expect(record.outcome).toBe("dead-line");
    expect(record.number).toBe("+14155550100");

    const summary = await readFile(path.replace(/\.json$/, ".txt"), "utf8");
    expect(summary).toContain("the line was dead");
  });
});
