/**
 * Clips made once, offline, and checked (spec 3.8, 3.9).
 *
 * 3.6 measures the brain at 868 ms to a first sentence and 941 at the high end,
 * and 3.8 says the target holds at the fast end and fails at the slow one, with
 * 3.9 naming the brain as the risk. A clip made in advance removes the brain and
 * the voice from the path to the first sound: what the other party waits for
 * becomes the end-of-turn detection and the transport.
 *
 * The check is the part that is easy to skip and expensive to skip. A clip is
 * made once and then played on every call for months, so a bad take is a bad
 * take for months. Sidetone kept a garbled "Muted." from 18 to 24 September for
 * exactly that reason, and the fix was to transcribe each take and refuse one
 * whose words do not match its text.
 */

/** What a voice has to do to make a clip. Both local engines already do. */
export interface ClipVoice {
  say(text: string): Promise<{ samples: Int16Array; sampleRate: number }>;
}

/** What has to read a take back to judge it. */
export interface ClipEars {
  hear(wav: Uint8Array): Promise<string>;
}

export interface Take {
  line: string;
  kept: boolean;
  /** How many takes it cost. A line that is never clean reports its attempts. */
  tries: number;
  /** What the last refused take was heard as, for a person deciding what to do. */
  heardInstead?: string;
}

export interface Clips {
  /**
   * Makes every line, keeps the clean takes and reports on all of them.
   *
   * Nothing calls this during a call: 3.1 allows a slow start before the dial and
   * never inside the conversation.
   */
  warm(lines: string[]): Promise<Take[]>;
  /** The clip for a line, or null when no clean take was ever kept. */
  clip(line: string): Uint8Array | null;
  /** Which lines have a clip, in the order they were given. */
  ready(): string[];
}

/** Words as the comparison sees them: case, punctuation and spacing do not count. */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Whether a take says what it was asked to say. */
export function saysIt(text: string, heard: string): boolean {
  const want = wordsOf(text);
  const got = wordsOf(heard);
  return want.length === got.length && want.every((word, i) => word === got[i]);
}

export interface ClipOptions {
  /**
   * How many takes one line may cost before it is given up on.
   *
   * A take is about a fifth of a second of the card, offline, so this is cheap
   * to raise. Sidetone needs 100 for a cloning voice; Kokoro is steadier, and a
   * line that fails ten takes is more likely to be a line the transcriber cannot
   * spell than a line the voice cannot say.
   */
  tries?: number;
  encode(samples: Int16Array, sampleRate: number): Uint8Array;
}

export function clips(voice: ClipVoice, ears: ClipEars, options: ClipOptions): Clips {
  const held = new Map<string, Uint8Array>();
  const order: string[] = [];
  const tries = options.tries ?? 10;

  return {
    async warm(lines) {
      const takes: Take[] = [];
      for (const line of lines) {
        if (!order.includes(line)) order.push(line);
        let heardInstead: string | undefined;
        let kept = false;
        let used = 0;

        for (let attempt = 1; attempt <= tries; attempt++) {
          used = attempt;
          const made = await voice.say(line);
          const wav = options.encode(made.samples, made.sampleRate);
          const heard = await ears.hear(wav);
          if (saysIt(line, heard)) {
            held.set(line, wav);
            kept = true;
            break;
          }
          heardInstead = heard;
        }

        // A line that never came out clean keeps no clip at all. Nothing plays is
        // the right answer: a garbled opener is worse than no opener.
        if (!kept) held.delete(line);
        takes.push(kept ? { line, kept, tries: used } : { line, kept, tries: used, heardInstead });
      }
      return takes;
    },

    clip: (line) => held.get(line) ?? null,
    ready: () => order.filter((line) => held.has(line)),
  };
}
