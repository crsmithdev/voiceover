/** The dialing gate (spec 10.10). It fails closed. */
import { describe, expect, test } from "bun:test";
import { gate, normalise, ownedNumbers } from "../src/call/numbers.ts";

const OWNED = ["+14155550100"];

describe("normalise", () => {
  test("accepts the shapes a person writes", () => {
    for (const written of ["4155550100", "415-555-0100", "(415) 555 0100", "+1 415 555 0100", "14155550100"]) {
      expect(normalise(written)).toBe("+14155550100");
    }
  });

  test("refuses anything that is not a North American number", () => {
    for (const bad of ["", "12345", "+442071234567", "not a number", "415555010012"]) {
      expect(normalise(bad)).toBeNull();
    }
  });
});

describe("gate", () => {
  test("a number Chris owns passes whatever the brief says", () => {
    expect(gate({ number: "415-555-0100", lineType: "mobile" }, OWNED)).toEqual({ allowed: true, because: "owned" });
  });

  test("a business line passes", () => {
    expect(gate({ number: "+14155550123", lineType: "business" }, OWNED)).toEqual({
      allowed: true,
      because: "business",
    });
  });

  test("a mobile that is not owned is refused", () => {
    const verdict = gate({ number: "+14155550123", lineType: "mobile" }, OWNED);
    expect(verdict.allowed).toBe(false);
    expect(verdict.because).toContain("18.5");
  });

  test("an unstated line type is refused, so silence is not permission", () => {
    const verdict = gate({ number: "+14155550123", lineType: "unknown" }, OWNED);
    expect(verdict.allowed).toBe(false);
    expect(verdict.because).toContain("does not say");
  });

  test("a malformed number is refused before anything else is considered", () => {
    const verdict = gate({ number: "banana", lineType: "business" }, OWNED);
    expect(verdict.allowed).toBe(false);
  });

  test("an empty allowlist refuses every mobile", () => {
    expect(gate({ number: "415-555-0100", lineType: "mobile" }, []).allowed).toBe(false);
  });
});

describe("ownedNumbers", () => {
  test("reads a comma separated list and drops what it cannot parse", () => {
    expect(ownedNumbers({ CALLER_OWNED_NUMBERS: "415-555-0100, banana, +14155550101" })).toEqual([
      "+14155550100",
      "+14155550101",
    ]);
  });

  test("is empty when nothing is set", () => {
    expect(ownedNumbers({})).toEqual([]);
  });
});
