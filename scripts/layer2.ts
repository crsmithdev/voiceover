/**
 * Layer two (spec 12.4): the audio pipeline against the kept fixtures.
 *
 * `bench/narrowband.py` measures; this asserts. The fixtures and the noise are
 * fixed (15.12), so the figures repeat and a threshold means something. A
 * failure here is the transcriber, the codec or the corpus changing, not noise.
 *
 * Usage:
 *   bun scripts/layer2.ts
 */
const LIMITS = {
  /** 15.10: 9 of 10 lines identical, 1 word adrift, on a telephone band. */
  narrowbandWordsAdrift: 3,
  /** 15.12: the seeded noise gave 2 words adrift over two runs. */
  noisyWordsAdrift: 8,
  /** 15.10: 112 to 124 ms for each transcription. */
  medianMs: 200,
};

const bench = Bun.spawnSync(["python3", "bench/narrowband.py"], { stdout: "pipe", stderr: "pipe" });
const out = bench.stdout.toString();
if (bench.exitCode !== 0) {
  console.log(out);
  console.log(bench.stderr.toString().slice(-2000));
  throw new Error("the bench did not run");
}
console.log(out.split("\n").slice(-9).join("\n"));

const number = (pattern: RegExp): number | null => {
  const found = pattern.exec(out);
  return found ? Number(found[1]) : null;
};
const failures: string[] = [];
const check = (name: string, value: number | null, limit: number) => {
  if (value === null) failures.push(`${name}: the bench printed no figure`);
  else if (value > limit) failures.push(`${name}: ${value}, over the limit of ${limit}`);
  else console.log(`pass  ${name}: ${value} (limit ${limit})`);
};

check("narrowband words adrift", number(/narrowband identical to clean: \d+\/\d+ lines, (\d+) words adrift/), LIMITS.narrowbandWordsAdrift);
check("noisy words adrift", number(/with noise added:\s+\d+\/\d+ lines, (\d+) words adrift/), LIMITS.noisyWordsAdrift);
for (const row of ["clean", "narrow", "noisy"]) {
  check(`${row} transcribe median ms`, number(new RegExp(`${row} transcribe median (\\d+) ms`)), LIMITS.medianMs);
}
const reused = /fixtures: (\d+) reused/.exec(out);
if (reused && Number(reused[1]) === 0) console.log("note  the corpus was built fresh, so these are its first figures");

if (failures.length) {
  for (const line of failures) console.log(`FAIL  ${line}`);
  process.exit(1);
}
console.log("layer two: every figure inside its limit");
