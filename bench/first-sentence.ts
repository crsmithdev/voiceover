/**
 * Measures the time to the first complete sentence (spec 15.8, first item).
 *
 * Spec 3.4: the budget targets the first sound the far end hears, and the
 * voice does not start until a sentence ends. So the first token is the wrong
 * event and the first sentence is the right one. This prints both.
 *
 * Spec 15.2 records why the earlier numbers were weak. Two fixes here: one
 * connection is reused for every sample, and each model is warmed before any
 * sample is timed.
 *
 * Usage: OPENROUTER_API_KEY=... bun bench/first-sentence.ts [samples]
 */
import { SentenceCollector } from "../src/speech/sentences.ts";

const SYSTEM = `You make a telephone call on behalf of Chris Smith. You speak as his assistant, not as him.
GOAL: book a dentist appointment for a cleaning, any weekday morning in the next three weeks, and confirm the time.
BACKGROUND: Chris is an existing patient. Date of birth withheld unless asked. He prefers Tuesday or Thursday. He can be reached by text.
STYLE: You are on a live phone call. Speak in short, natural sentences. One idea per sentence. Never read out a list of more than three things.
Do not state a fact you were not given. If you do not know, say you will check and come back.
Do not spell out punctuation. Do not use markdown. Never say you are an AI unless asked directly.
If you reach a voicemail machine, leave a short message with the goal and a callback request, then hang up.
If you reach a menu, listen for the option that reaches a person or the scheduling desk.`;

const HISTORY = [
  { role: "assistant", content: "Hi, good morning. I'm calling on behalf of Chris Smith to book a cleaning." },
  { role: "user", content: "Okay, sure. Let me pull him up. Can you spell the last name for me?" },
  { role: "assistant", content: "Of course. S, M, I, T, H." },
  { role: "user", content: "Got it. And is he due for a cleaning? Looks like the last one was, uh, hang on... looks like March." },
  { role: "assistant", content: "That sounds right. He's after a cleaning, ideally a weekday morning in the next three weeks." },
  { role: "user", content: "Alright. I have a Tuesday the twenty-second at nine fifteen, or a Thursday at, um, eight thirty. Which one do you want?" },
];

/** Matches the bridge's default, which is the only value this rule has run at. */
const SENTENCE_MAX_CHARS = 240;

const URL = "https://openrouter.ai/api/v1/chat/completions";
const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) throw new Error("OPENROUTER_API_KEY is not set");

const MODELS = [
  "anthropic/claude-haiku-4.5",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "anthropic/claude-sonnet-5",
];

interface Sample {
  firstToken: number;
  firstSentence: number;
  sentence: string;
}

async function once(model: string): Promise<Sample | null> {
  const started = performance.now();
  const response = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM }, ...HISTORY],
      stream: true,
      max_tokens: 120,
      temperature: 0.6,
    }),
  });
  if (!response.ok || !response.body) {
    console.error(`  ${model}: HTTP ${response.status} ${(await response.text()).slice(0, 120)}`);
    return null;
  }

  const collector = new SentenceCollector(SENTENCE_MAX_CHARS);
  const decoder = new TextDecoder();
  let firstToken = 0;
  let buffer = "";

  let result: Sample | null = null;
  outer: for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      let delta: string | undefined;
      try {
        delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
      } catch {
        continue;
      }
      if (!delta) continue;
      if (!firstToken) firstToken = performance.now() - started;
      const sentences = collector.push(delta);
      if (sentences.length) {
        result = { firstToken, firstSentence: performance.now() - started, sentence: sentences[0] as string };
        break outer;
      }
    }
  }
  if (result) return result;
  // The reply ended without a boundary, so the flush is the first sentence.
  const rest = collector.flush();
  return rest ? { firstToken, firstSentence: performance.now() - started, sentence: rest } : null;
}

const quantile = (sorted: number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] as number;

const samples = Number(process.argv[2] ?? 15);

console.log(`${samples} timed samples per model, one reused connection, two warm-ups discarded.\n`);
console.log(
  ["model".padEnd(30), "tok p50", "tok p90", "sent p50", "sent p90", "delta p50", "chars"].join("  "),
);

for (const model of MODELS) {
  for (let i = 0; i < 2; i++) await once(model);

  const got: Sample[] = [];
  for (let i = 0; i < samples; i++) {
    const sample = await once(model);
    if (sample) got.push(sample);
    await Bun.sleep(300);
  }
  if (!got.length) {
    console.log(`${model.padEnd(30)}  no samples`);
    continue;
  }

  const tok = got.map((s) => s.firstToken).sort((a, b) => a - b);
  const sent = got.map((s) => s.firstSentence).sort((a, b) => a - b);
  const chars = Math.round(got.reduce((n, s) => n + s.sentence.length, 0) / got.length);
  const row = [
    model.padEnd(30),
    String(Math.round(quantile(tok, 0.5))).padStart(7),
    String(Math.round(quantile(tok, 0.9))).padStart(7),
    String(Math.round(quantile(sent, 0.5))).padStart(8),
    String(Math.round(quantile(sent, 0.9))).padStart(8),
    String(Math.round(quantile(sent, 0.5) - quantile(tok, 0.5))).padStart(9),
    String(chars).padStart(5),
  ];
  console.log(row.join("  "));
  console.log(`${" ".repeat(32)}e.g. "${got[0]?.sentence.slice(0, 90)}"`);
}
