/** The call rate limit (spec 16.5). */
import { describe, expect, test } from "bun:test";
import { withinRate } from "../src/call/rate.ts";

const at = (...times: number[]) => times.map((time) => ({ at: time, number: "+14155550100" }));

describe("withinRate", () => {
  test("an empty history allows a call", () => {
    expect(withinRate([], 1_000, 3)).toEqual({ allowed: true, remaining: 3 });
  });

  test("calls outside the window do not count", () => {
    const now = 10 * 60 * 60_000;
    expect(withinRate(at(0, 1_000, 2_000), now, 3).allowed).toBe(true);
  });

  test("the limit refuses and says when the next call may go", () => {
    const now = 60_000;
    const verdict = withinRate(at(1_000, 2_000, 3_000), now, 3);
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) throw new Error("unreachable");
    expect(verdict.because).toContain("the limit is 3");
    expect(verdict.nextAllowedAt).toBe(1_000 + 60 * 60_000);
  });

  test("a burst inside a minute is what this is for", () => {
    const history = at(0, 100, 200, 300, 400, 500);
    expect(withinRate(history, 600).allowed).toBe(false);
  });

  test("the window slides rather than resetting", () => {
    const hour = 60 * 60_000;
    const history = at(0, 1_000, 2_000);
    expect(withinRate(history, hour + 500, 3).allowed).toBe(true);
    expect(withinRate(history, hour - 500, 3).allowed).toBe(false);
  });
});
