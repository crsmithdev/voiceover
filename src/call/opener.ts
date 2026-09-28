/**
 * The first sound, before the brain has written anything (spec 3.8, 3.9).
 *
 * An opener is a short kept line — "Sure.", "One moment." — played the instant a
 * turn goes to the brain, so the far end hears something while the sentence is
 * still being written. `kept.ts` makes and checks the clips; this decides when
 * one plays and which.
 *
 * It is off by default, and that is a judgement, not an oversight. The opener
 * comes from sidetone, where it was tuned for Chris in his own car and asked for
 * by name. A stranger on a business line is a different listener: a filler
 * before every reply may read as evasive rather than fast. An empty list turns it
 * off, which is sidetone's own rule (11.6.5), so the first real calls can settle
 * it by ear rather than by argument.
 */
import type { Clips } from "../speech/kept.ts";

/**
 * Where a clip goes. The seam is the room, so a test asserts what played without
 * a call, and 13.6 stays true: the framework still owns every spoken sentence,
 * and this plays only what the framework was never going to say.
 */
export interface ClipRoom {
  play(wav: Uint8Array): Promise<void>;
}

/**
 * The default openers, empty on purpose (see the header).
 *
 * The candidates, when Chris wants them: "Sure.", "Right.", "Okay.",
 * "One moment.", "Let me see.". Each is a full sentence with a falling tone, so
 * it closes rather than trailing into the sentence that follows it.
 */
export const OPENERS: readonly string[] = [];

export interface Opener {
  /** Plays one and returns what played, or null when none did. */
  open(): Promise<string | null>;
  /** Whether anything would play at all, so a caller can skip the attempt. */
  readonly enabled: boolean;
}

export interface OpenerOptions {
  lines?: readonly string[];
  /** Which of the ready lines to use. A test fixes it; a call varies it. */
  choose?(among: string[]): string;
}

export function opener(clips: Clips, room: ClipRoom, options: OpenerOptions = {}): Opener {
  const lines = options.lines ?? OPENERS;
  let last: string | null = null;

  const pick = (among: string[]): string => {
    if (options.choose) return options.choose(among);
    // Never the same opener twice running: a repeated filler is worse than none,
    // because it makes the caller sound like a recording.
    const fresh = among.length > 1 ? among.filter((line) => line !== last) : among;
    return fresh[Math.floor(Math.random() * fresh.length)] as string;
  };

  return {
    get enabled() {
      return lines.length > 0;
    },

    async open() {
      if (lines.length === 0) return null;
      // Only a line with a clean kept take can play. A line that never came out
      // clean plays nothing rather than a synthesis, because a synthesis is the
      // delay the opener exists to hide.
      const available = clips.ready().filter((line) => lines.includes(line));
      if (available.length === 0) return null;

      const chosen = pick(available);
      const wav = clips.clip(chosen);
      if (!wav) return null;

      await room.play(wav);
      last = chosen;
      return chosen;
    },
  };
}
