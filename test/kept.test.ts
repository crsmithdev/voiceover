/**
 * Kept clips and the opener (spec 3.8, 3.9, and sidetone's 11.6.1 and 11.6.5).
 *
 * The check is what these cases are mostly about. A clip is made once and played
 * on every call for months, so a bad take is a bad take for months: sidetone kept
 * a garbled "Muted." for six days because it trusted the first take.
 */
import { describe, expect, test } from "bun:test";
import { encodeWav } from "../src/audio/pcm.ts";
import { OPENERS, opener } from "../src/call/opener.ts";
import { type ClipEars, type ClipVoice, clips, saysIt, wordsOf } from "../src/speech/kept.ts";

/**
 * A voice and ears that agree on which line a clip holds.
 *
 * The voice stamps an id into the first sample and the ears read it back out of
 * the wav, so a clip is identifiable without the engines being real. Identifying
 * a line by its length does not work: "Sure." and "Okay." are both five
 * characters, and the second would be scored against the first one's script.
 */
function rig(script: Record<string, string[]>) {
  const ids = new Map<string, number>();
  const byId = new Map<number, string>();
  for (const [i, line] of Object.keys(script).entries()) {
    ids.set(line, i + 1);
    byId.set(i + 1, line);
  }

  const said: string[] = [];
  const heard: string[] = [];
  const at = new Map<string, number>();

  const voice: ClipVoice = {
    async say(text) {
      said.push(text);
      const samples = new Int16Array(8);
      samples[0] = ids.get(text) ?? 0;
      return { samples, sampleRate: 24_000 };
    },
  };

  const ears: ClipEars = {
    async hear(wav) {
      // Sample data starts at byte 44 of the wav this encoder writes.
      const id = new DataView(wav.buffer, wav.byteOffset, wav.byteLength).getInt16(44, true);
      const line = byId.get(id) ?? "";
      const i = at.get(line) ?? 0;
      at.set(line, i + 1);
      const takes = script[line] ?? [];
      const got = takes[Math.min(i, takes.length - 1)] ?? "";
      heard.push(got);
      return got;
    },
  };

  return { voice, ears, said, heard };
}

const encode = (samples: Int16Array, rate: number) => encodeWav(samples, rate);

describe("comparing a take to its text", () => {
  test("case, punctuation and spacing do not count", () => {
    expect(saysIt("One moment.", "one moment")).toBe(true);
    expect(saysIt("Sure.", " sure! ")).toBe(true);
  });

  test("different words do not pass, however close", () => {
    expect(saysIt("Stopped.", "Stop.")).toBe(false);
    expect(saysIt("Okay.", "Okay then.")).toBe(false);
    expect(saysIt("One moment.", "moment")).toBe(false);
  });

  test("an empty take never passes, which is what silence transcribes to", () => {
    expect(saysIt("Sure.", "")).toBe(false);
  });

  test("an apostrophe is part of a word", () => {
    expect(wordsOf("I'll see.")).toEqual(["i'll", "see"]);
  });
});

describe("warming the clips", () => {
  test("a clean first take is kept and costs one try", async () => {
    const r = rig({ "Sure.": ["sure"] });
    const store = clips(r.voice, r.ears, { encode });

    const takes = await store.warm(["Sure."]);
    expect(takes).toEqual([{ line: "Sure.", kept: true, tries: 1 }]);
    expect(store.clip("Sure.")).not.toBeNull();
    expect(store.ready()).toEqual(["Sure."]);
  });

  test("a garbled take is thrown away and the line is made again", async () => {
    const r = rig({ "Sure.": ["sh", "shore", "sure"] });
    const store = clips(r.voice, r.ears, { encode });

    const takes = await store.warm(["Sure."]);
    expect(takes[0]?.kept).toBe(true);
    expect(takes[0]?.tries).toBe(3);
    expect(r.said).toHaveLength(3);
  });

  /**
   * The rule that matters: nothing plays is better than something garbled. A
   * synthesis would be the delay the opener exists to hide, and a wrong word said
   * to a stranger is the worst failure this product has (9.1).
   */
  test("a line that never comes out clean keeps no clip at all", async () => {
    const r = rig({ "Stopped.": ["stop"] });
    const store = clips(r.voice, r.ears, { encode, tries: 4 });

    const takes = await store.warm(["Stopped."]);
    expect(takes[0]?.kept).toBe(false);
    expect(takes[0]?.tries).toBe(4);
    expect(takes[0]?.heardInstead).toBe("stop");
    expect(store.clip("Stopped.")).toBeNull();
    expect(store.ready()).toEqual([]);
  });

  test("it reports every line, kept or not", async () => {
    const r = rig({ "Sure.": ["sure"], "Right now.": ["write now"] });
    const store = clips(r.voice, r.ears, { encode, tries: 2 });

    const takes = await store.warm(["Sure.", "Right now."]);
    expect(takes.map((t) => t.kept)).toEqual([true, false]);
    expect(store.ready()).toEqual(["Sure."]);
  });
});

describe("the opener", () => {
  async function ready(lines: string[], script: Record<string, string[]>) {
    const r = rig(script);
    const store = clips(r.voice, r.ears, { encode });
    await store.warm(lines);
    const played: number[] = [];
    const room = { play: async (wav: Uint8Array) => void played.push(wav.byteLength) };
    return { store, room, played };
  }

  /**
   * Off by default is the decision, not a gap. The opener was tuned for Chris in
   * his own car; a filler before every reply to a stranger may read as evasive
   * rather than fast, so the first real calls settle it by ear.
   */
  test("no openers are configured, so nothing plays and nothing is attempted", async () => {
    expect(OPENERS).toEqual([]);
    const r = await ready(["Sure."], { "Sure.": ["sure"] });
    const it = opener(r.store, r.room);
    expect(it.enabled).toBe(false);
    expect(await it.open()).toBeNull();
    expect(r.played).toEqual([]);
  });

  test("a configured line with a clean clip plays", async () => {
    const r = await ready(["Sure."], { "Sure.": ["sure"] });
    const it = opener(r.store, r.room, { lines: ["Sure."] });
    expect(it.enabled).toBe(true);
    expect(await it.open()).toBe("Sure.");
    expect(r.played).toHaveLength(1);
  });

  test("a configured line whose takes were all refused plays nothing", async () => {
    const r = await ready(["Stopped."], { "Stopped.": ["stop"] });
    const it = opener(r.store, r.room, { lines: ["Stopped."] });
    // Enabled, because it was asked for; silent, because no take was clean.
    expect(it.enabled).toBe(true);
    expect(await it.open()).toBeNull();
    expect(r.played).toEqual([]);
  });

  test("never the same opener twice running, so it does not sound like a recording", async () => {
    const lines = ["Sure.", "One moment."];
    const r = await ready(lines, { "Sure.": ["sure"], "One moment.": ["one moment"] });
    const it = opener(r.store, r.room, { lines });

    const first = await it.open();
    const second = await it.open();
    const third = await it.open();
    expect(first).not.toBe(second);
    expect(second).not.toBe(third);
    expect(r.played).toHaveLength(3);
  });

  test("with one line it repeats rather than falling silent", async () => {
    const r = await ready(["Sure."], { "Sure.": ["sure"] });
    const it = opener(r.store, r.room, { lines: ["Sure."] });
    expect(await it.open()).toBe("Sure.");
    expect(await it.open()).toBe("Sure.");
  });

  test("a line not in the configured list is never played, even with a clip", async () => {
    const r = await ready(["Sure.", "Okay."], { "Sure.": ["sure"], "Okay.": ["okay"] });
    const it = opener(r.store, r.room, { lines: ["Okay."], choose: (among) => among[0] as string });
    expect(await it.open()).toBe("Okay.");
  });
});
