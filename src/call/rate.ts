/**
 * How many calls may happen in an hour (spec 16.5).
 *
 * The carrier caps one call's length and the money each day. Neither of those
 * stops a fault dialling the same person again and again inside a minute, which
 * is the failure that would matter most to the person being dialled.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CALLS_PER_HOUR = 6;
export const WINDOW_MS = 60 * 60_000;

export interface Dialled {
  at: number;
  number: string;
}

export type RateVerdict =
  | { allowed: true; remaining: number }
  | { allowed: false; because: string; nextAllowedAt: number };

export function withinRate(
  history: Dialled[],
  now: number,
  limit = CALLS_PER_HOUR,
  windowMs = WINDOW_MS,
): RateVerdict {
  const recent = history.filter((entry) => now - entry.at < windowMs).sort((a, b) => a.at - b.at);
  if (recent.length < limit) return { allowed: true, remaining: limit - recent.length };
  const oldest = recent[recent.length - limit] as Dialled;
  return {
    allowed: false,
    because: `${recent.length} calls in the last hour, and the limit is ${limit}`,
    nextAllowedAt: oldest.at + windowMs,
  };
}

export function historyPath(): string {
  return process.env.VOICEOVER_HISTORY ?? join(homedir(), ".voiceover", "dialled.json");
}

export async function readHistory(path = historyPath()): Promise<Dialled[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Records the attempt. Called before the dial, so a crash still counts it. */
export async function recordDial(entry: Dialled, path = historyPath()): Promise<void> {
  const history = await readHistory(path);
  const kept = history.filter((item) => entry.at - item.at < WINDOW_MS * 24);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify([...kept, entry], null, 2));
}
