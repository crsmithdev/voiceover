/**
 * Where reports live, and how long (spec 18.6).
 *
 * This replaces `reportStore.ts`, which owned only the write. The reading, the
 * listing, the thirty-day expiry and the `.txt` naming convention lived in the
 * console's HTTP handler, and a second report directory lived in the rehearsal
 * module, with the route choosing between them by query string. So the rule that
 * the other party's words do not accumulate on a desktop forever was enforced by
 * whether anyone happened to open the log.
 *
 * The shape is `rate.ts`'s: policy and store in one module, with its own expiry.
 */
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Report, summarise } from "./report.ts";
import { constants } from "./state.ts";

/** 18.6 a report older than this is deleted when the list is read. */
export const KEEP_DAYS = 30;
/** The console shows a page of them; a longer list is not useful to read. */
export const LIST_LIMIT = 50;

export function reportDir(): string {
  return process.env.VOICEOVER_REPORT_DIR ?? join(homedir(), ".voiceover", "reports");
}

export function rehearsalDir(): string {
  return process.env.VOICEOVER_REHEARSAL_DIR ?? join(homedir(), ".voiceover", "rehearsals");
}

export interface Stored extends Report {
  /** The `.json` file this was read from, so the console can name it. */
  file: string;
}

export interface Reports {
  readonly dir: string;
  write(report: Report): Promise<string>;
  /** Newest first, expiring anything past `KEEP_DAYS` as it reads. */
  list(now?: number): Promise<Stored[]>;
}

/**
 * One JSON file per call plus the readable summary beside it (11.4).
 *
 * The pair is the unit: a `.json` with no `.txt` is half a report, so the expiry
 * removes both and only this module knows that they are a pair.
 */
export function reports(dir = reportDir()): Reports {
  const summaryOf = (jsonPath: string) => jsonPath.replace(/\.json$/, ".txt");

  return {
    dir,

    async write(report) {
      await mkdir(dir, { recursive: true });
      const stamp = new Date(report.endedAt).toISOString().replace(/[:.]/g, "-");
      const base = join(dir, `${stamp}-${report.number.replace(/\D/g, "")}`);
      await writeFile(`${base}.json`, JSON.stringify(report, null, 2));
      await writeFile(`${base}.txt`, `${summarise(report)}\n`);
      return `${base}.json`;
    },

    async list(now = Date.now()) {
      let names: string[];
      try {
        names = (await readdir(dir)).filter((name) => name.endsWith(".json"));
      } catch {
        return [];
      }

      const cutoff = now - KEEP_DAYS * 864e5;
      const out: Stored[] = [];
      for (const name of names) {
        const path = join(dir, name);
        try {
          if ((await stat(path)).mtimeMs < cutoff) {
            await unlink(path).catch(() => undefined);
            await unlink(summaryOf(path)).catch(() => undefined);
            continue;
          }
          // A report written before the measured fields existed has none of
          // them, so the type would be a lie for anything already on disk.
          // Filling them here keeps every reader honest: an empty list of
          // timings says no turn was measured, which is true of those calls.
          const stored = JSON.parse(await readFile(path, "utf8")) as Partial<Report>;
          out.push({
            ...(stored as Report),
            timings: stored.timings ?? [],
            middleReplyMs: stored.middleReplyMs ?? null,
            ranUnder: stored.ranUnder ?? constants,
            file: name,
          });
        } catch {
          // A half-written report is not a report. It is left alone: a call that
          // is still ending owns that file.
        }
      }
      return out.sort((a, b) => b.endedAt - a.endedAt).slice(0, LIST_LIMIT);
    },
  };
}
