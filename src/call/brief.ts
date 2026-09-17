/**
 * The call brief, and the instructions it becomes (spec 9, 10).
 *
 * Everything the caller may say comes from here. The wording of each section
 * is a prompt the user interface can edit (`src/prompts.ts`); the disclosure
 * rules of 10.1 and 10.2 are not, and they come last.
 */
import { fill, prompt } from "../prompts.ts";

export interface Brief {
  /** What the call is for, in one sentence. */
  goal: string;
  /** Facts the caller may state. Anything absent is unknown (9.2). */
  facts: Record<string, string>;
  /** Nuance with no field shape (18.3.1). The caller may state it; 9.5 still governs numbers. */
  background?: string;
  /** Fields the caller may give out even though 9.5 would withhold them. */
  releasable?: string[];
  /** What the caller must not agree to, beyond 9.6. */
  limits?: string[];
}

export function instructionsFor(brief: Brief, callerName = "Chris Smith"): string {
  const facts = Object.entries(brief.facts)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");
  const releasable = brief.releasable?.length
    ? brief.releasable.map((field) => `- ${field}`).join("\n")
    : "- nothing";
  const values = {
    caller_name: callerName,
    goal: brief.goal,
    facts,
    background: brief.background?.trim() ? `\nBACKGROUND YOU MAY STATE: ${brief.background.trim()}` : "",
    releasable,
    limits: (brief.limits ?? []).map((limit) => `- ${limit}`).join("\n"),
  };
  const section = (id: string) => fill(prompt(id), values).replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");

  return [
    section("caller.brief"),
    section("caller.unknowns").replace(/\n\n/g, "\n"),
    section("caller.style"),
    // 10.1 to 10.3: last, so no edit above can outrank it.
    section("caller.disclosure"),
  ].join("\n\n");
}
