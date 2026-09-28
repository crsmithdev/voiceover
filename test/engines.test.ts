/**
 * The engine registry and the scratch-file round trip (spec 13.2, 18.12.1).
 *
 * Three adapters each assembled their own interpreter path and CUDA library
 * path, and each wrote a temporary wav that nothing ever deleted: there was no
 * `unlink` anywhere in `src/speech`, so every sentence of every call left a file
 * behind. These cases need no GPU and no Python.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { BRIDGE, ENGINES, MODELS, environmentFor, pythonFor, scriptFor } from "../src/speech/engines.ts";
import { Worker } from "../src/speech/worker.ts";

describe("the registry", () => {
  test("every engine names a script under the bridge's speech directory", () => {
    for (const engine of Object.values(ENGINES)) {
      expect(scriptFor(engine)).toBe(`${BRIDGE}/speech/${engine.script}`);
      expect(engine.script.endsWith(".py")).toBe(true);
    }
  });

  /**
   * 18.12.1 is the reason this is worth a test. Kokoro's onnxruntime wants the
   * CUDA 13 wheels and ctranslate2, which carries the transcriber, wants the
   * CUDA 12 ones; both unpack into the same directory. Sharing one environment
   * would take out transcription here and in the bridge at once.
   */
  test("kokoro has an environment of its own, and the other two share the bridge's", () => {
    expect(ENGINES.kokoro.venv).not.toBe(ENGINES.stt.venv);
    expect(ENGINES.stt.venv).toBe(ENGINES.piper.venv);
  });

  test("each environment's own interpreter is used, not the system one", () => {
    expect(pythonFor(ENGINES.stt)).toBe(`${ENGINES.stt.venv}/bin/python3`);
    expect(pythonFor(ENGINES.kokoro)).toBe(`${ENGINES.kokoro.venv}/bin/python`);
  });

  test("kokoro takes the voice it was asked for, and has a default", () => {
    expect(ENGINES.kokoro.args("af_bella")).toContain("af_bella");
    expect(ENGINES.kokoro.args()).toContain("am_michael");
    expect(ENGINES.kokoro.args("af_bella")[0]).toBe(`${MODELS}/kokoro/kokoro-v1.0.onnx`);
  });

  test("the transcriber is given its model and the shared models directory", () => {
    expect(ENGINES.stt.args()).toEqual([process.env.VOICEOVER_STT_MODEL ?? "small.en", MODELS]);
  });

  /** onnxruntime falls back to the processor without failing, so this is the only warning. */
  test("kokoro complains when it is not on the card, and stays quiet when it is", () => {
    expect(ENGINES.kokoro.warn?.({ provider: "CPUExecutionProvider" })).toContain("not the card");
    expect(ENGINES.kokoro.warn?.({ provider: "CUDAExecutionProvider" })).toBeNull();
    // Nothing to say about a worker that did not report a provider at all.
    expect(ENGINES.kokoro.warn?.({})).toBeNull();
  });

  test("an engine with nothing to check has no complaint to make", () => {
    expect(ENGINES.stt.warn).toBeUndefined();
    expect(new Worker("stt").complaint({ provider: "CPUExecutionProvider" })).toBeNull();
  });

  test("the CUDA wheels of the engine's own environment reach the library path", () => {
    const path = environmentFor(ENGINES.kokoro).LD_LIBRARY_PATH;
    // The wheels live under the venv, so the venv has to be in what is built.
    expect(path).toContain(ENGINES.kokoro.venv);
  });
});

describe("the scratch file", () => {
  const scratch = () => readdirSync(tmpdir()).filter((n) => n.startsWith("voiceover-") && n.endsWith(".wav"));

  /**
   * The fix, stated as a test: the file is gone whether the request worked or
   * not. A failing request was the case that leaked in the old adapters, because
   * each one deleted nothing at all.
   */
  test("it is deleted after a request that fails", async () => {
    const before = scratch();
    const worker = new Worker("stt");
    // Never started, so `ask` throws inside `round` and `finally` still runs.
    await expect(worker.round({}, { write: new Uint8Array([1, 2, 3]) })).rejects.toThrow("is not started");
    expect(scratch()).toEqual(before);
  });

  test("a read direction with a failed request leaves nothing either", async () => {
    const before = scratch();
    const worker = new Worker("piper");
    await expect(worker.round({ text: "hello" }, { read: true })).rejects.toThrow("is not started");
    expect(scratch()).toEqual(before);
  });
});
