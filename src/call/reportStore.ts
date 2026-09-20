/**
 * Where a report lives. Provisional: spec 18.6 has not decided this yet.
 * One JSON file per call under ~/.voiceover/reports, plus the summary beside it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Report, summarise } from "./report.ts";

export function reportDir(): string {
  return process.env.VOICEOVER_REPORT_DIR ?? join(homedir(), ".voiceover", "reports");
}

export async function writeReport(report: Report, dir = reportDir()): Promise<string> {
  await mkdir(dir, { recursive: true });
  const stamp = new Date(report.endedAt).toISOString().replace(/[:.]/g, "-");
  const base = join(dir, `${stamp}-${report.number.replace(/\D/g, "")}`);
  await writeFile(`${base}.json`, JSON.stringify(report, null, 2));
  await writeFile(`${base}.txt`, `${summarise(report)}\n`);
  return `${base}.json`;
}
