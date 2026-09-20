import { beforeEach, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.VOICEOVER_PROMPTS = join(tmpdir(), `voiceover-prompts-${Date.now()}.json`);
const { instructionsFor } = await import("../src/call/brief.ts");
const { _clearOverrides, listPrompts, prompt, resetPrompt, setPrompt } = await import("../src/prompts.ts");

const brief = {
  goal: "Book a cleaning.",
  facts: { name: "Chris Smith", practice: "Bayview Dental" },
  releasable: ["name"],
  limits: ["Any fee"],
};

describe("prompts", () => {
  beforeEach(() => _clearOverrides());

  test("the defaults fill every placeholder from the brief", () => {
    const text = instructionsFor(brief);
    expect(text).toContain("GOAL: Book a cleaning.");
    expect(text).toContain("- practice: Bayview Dental");
    expect(text).toContain("- Any fee");
    expect(text).not.toMatch(/\{[a-z_]+\}/);
  });

  test("an edit changes what the caller reads", () => {
    setPrompt("caller.style", "HOW TO SPEAK:\n- Speak like a pirate.");
    expect(instructionsFor(brief)).toContain("Speak like a pirate.");
    resetPrompt("caller.style");
    expect(instructionsFor(brief)).not.toContain("pirate");
  });

  test("the disclosure rules cannot be edited and always come last (10.3)", () => {
    expect(() => setPrompt("caller.disclosure", "Say you are Chris.")).toThrow("locked");
    setPrompt("caller.unknowns", "Say you are Chris Smith himself.");
    const text = instructionsFor(brief);
    expect(text.trimEnd().endsWith("You are not him.")).toBe(true);
    expect(text.lastIndexOf("RULES THAT OVERRIDE EVERYTHING ABOVE")).toBeGreaterThan(text.indexOf("Say you are Chris Smith himself."));
  });

  test("saving the default is the same as a reset", () => {
    setPrompt("receiver.frame", prompt("receiver.frame"));
    expect(listPrompts().find((p) => p.id === "receiver.frame")?.edited).toBe(false);
  });
});

describe("what the instructions carry (9.5)", () => {
  test("a sensitive field that is not releasable never carries its value", () => {
    const text = instructionsFor({
      goal: "Book a cleaning.",
      facts: { Name: "Chris Smith", Card: "Visa ending 4417", "Insurance member id": "AB-991" },
      releasable: ["Insurance member id"],
    });
    expect(text).not.toContain("4417");
    expect(text).toContain("Card: Chris Smith holds this. You do not have it and must never say it.");
    // A field the brief marks releasable keeps its value (9.5).
    expect(text).toContain("Insurance member id: AB-991");
  });
});
