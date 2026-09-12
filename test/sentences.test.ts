/**
 * The sentence rule decides the time to the first audio (spec 3.4), so its
 * edges are worth pinning: a decimal number is not a sentence end, and a long
 * run with no punctuation must not hold the audio back.
 */
import { describe, expect, test } from "bun:test";
import { SentenceCollector } from "../src/speech/sentences.ts";

const collect = (chunks: string[], maxChars = 240) => {
  const collector = new SentenceCollector(maxChars);
  const out: string[] = [];
  for (const chunk of chunks) out.push(...collector.push(chunk));
  return { out, rest: collector.flush() };
};

describe("SentenceCollector", () => {
  test("a period and a space end a sentence", () => {
    const { out } = collect(["Tuesday works. ", "I'll take it."]);
    expect(out).toEqual(["Tuesday works."]);
  });

  test("punctuation at the very end waits for more text", () => {
    const { out, rest } = collect(["Tuesday works."]);
    expect(out).toEqual([]);
    expect(rest).toBe("Tuesday works.");
  });

  test("a decimal number is not the end of a sentence", () => {
    const { out, rest } = collect(["The fee is 3.50 for that. ", "x"]);
    expect(out).toEqual(["The fee is 3.50 for that."]);
    expect(rest).toBe("x");
  });

  test("a newline ends a sentence without punctuation", () => {
    const { out } = collect(["Nine fifteen\n"]);
    expect(out).toEqual(["Nine fifteen"]);
  });

  test("a long run with no punctuation splits at a space", () => {
    const words = "one two three four five six seven eight nine ten";
    const { out } = collect([words], 20);
    expect(out.length).toBeGreaterThan(1);
    for (const sentence of out) expect(sentence.length).toBeLessThanOrEqual(20);
  });

  test("streaming one character at a time gives the same first sentence", () => {
    const text = "Tuesday the twenty-second at nine fifteen works great. And then?";
    const { out } = collect([...text]);
    expect(out[0]).toBe("Tuesday the twenty-second at nine fifteen works great.");
  });
});
