/**
 * The caller's voice, to pick by ear (spec 18.12).
 *
 * Kokoro holds 54 voices in one pack, so the choice is a name. A voice that is
 * pleasant at 24 kHz can lose what makes it pleasant at 8, so each candidate is
 * rendered twice: as it comes, and through the telephone band of 12.5.
 *
 * Usage:
 *   bun scripts/voices.ts                 the shortlist
 *   bun scripts/voices.ts af_bella bm_george   named voices
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KokoroTTS } from "../src/speech/kokoro.ts";

const SHORTLIST = ["am_michael", "am_adam", "am_puck", "af_heart", "af_sarah", "bm_george", "bf_emma"];
const LINE =
  "Hi, I'm an assistant calling on behalf of Chris Smith. I'm checking whether you have a morning appointment free next week.";

const voices = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const chosen = voices.length ? voices : SHORTLIST;
const out = join(tmpdir(), "caller-voices");
await mkdir(out, { recursive: true });

const engine = new KokoroTTS(chosen[0] as string);
await engine.warm();

for (const voice of chosen) {
  engine.voice = voice;
  const wide = join(out, `${voice}-wide.wav`);
  const narrow = join(out, `${voice}-telephone.wav`);
  const started = performance.now();
  const { samples, sampleRate } = await engine.say(LINE);
  const ms = Math.round(performance.now() - started);
  // Write the wide version through the worker's own file, then band-limit it.
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length * 2, 40);
  await Bun.write(wide, new Blob([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]));
  const band = Bun.spawnSync([
    "sox", wide, "-r", "8000", "-c", "1", "-e", "u-law", narrow, "sinc", "300-3400",
  ]);
  const banded = band.exitCode === 0 ? narrow : `sox failed: ${band.stderr.toString().trim()}`;
  console.log(`${voice.padEnd(12)} ${String(ms).padStart(4)} ms   ${wide}   ${banded}`);
}

await engine.close();
console.log(`\nPlay them from ${out}. Set the one you want as CALLER_KOKORO_VOICE in .env.`);
process.exit(0);
