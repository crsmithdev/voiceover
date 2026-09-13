/**
 * Which numbers the caller may dial (spec 10.10).
 *
 * The gate fails closed: a number passes only when it is one Chris owns, or
 * when the brief says it is a published business line. Nothing else dials.
 *
 * The product cannot tell a business line from a home line on its own. A
 * carrier lookup could check the brief's claim; until then the brief is taken
 * at its word and the allowlist is the only thing the product knows for itself.
 */

export type LineType = "business" | "mobile" | "home" | "unknown";

export interface DialRequest {
  number: string;
  /** What the call brief says this number is. */
  lineType: LineType;
}

export type Verdict = { allowed: true; because: "owned" | "business" } | { allowed: false; because: string };

/** E.164 for a North American number, or null when it is not one. */
export function normalise(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  const bare = digits.startsWith("+") ? digits.slice(1) : digits;
  if (!/^\d+$/.test(bare)) return null;
  if (bare.length === 10) return `+1${bare}`;
  if (bare.length === 11 && bare.startsWith("1")) return `+${bare}`;
  // Anything else may be valid abroad, but this product only calls North America.
  return null;
}

export function ownedNumbers(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.CALLER_OWNED_NUMBERS ?? "";
  return raw
    .split(",")
    .map((entry) => normalise(entry.trim()))
    .filter((entry): entry is string => entry !== null);
}

export function gate(request: DialRequest, owned: string[]): Verdict {
  const number = normalise(request.number);
  if (!number) return { allowed: false, because: `not a North American number: ${request.number}` };
  if (owned.includes(number)) return { allowed: true, because: "owned" };
  if (request.lineType === "business") return { allowed: true, because: "business" };
  return {
    allowed: false,
    because:
      request.lineType === "unknown"
        ? "the brief does not say what kind of line this is"
        : `a ${request.lineType} line needs the legal check in 18.5`,
  };
}
