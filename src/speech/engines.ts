/**
 * The speech engines this product can run, declared once (spec 13.2).
 *
 * Before this, `worker.ts` published `BRIDGE`, `MODELS`, `pythonBin` and
 * `cudaLibraryPath` so that every adapter had to assemble its own interpreter
 * path and CUDA library path to construct a worker. Three adapters each knew
 * about virtual environments; now none of them does.
 *
 * Everything here is the voice bridge's, and that is a dependency worth naming:
 * spec 18.10 decided the caller starts its own engine processes so a call never
 * needs the bridge running, but they are still that checkout's scripts, that
 * virtual environment and that models directory. Sidetone's own
 * `docs/operating.md` lists all three as load-bearing outside its repository.
 */
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The bridge's checkout, which holds `speech/*.py` and the main environment. */
export const BRIDGE = process.env.SIDETONE_HOME ?? join(homedir(), "sidetone");
/** The shared models: the Piper voices, the Whisper cache and the Kokoro pack. */
export const MODELS = process.env.SIDETONE_MODELS ?? join(homedir(), ".sidetone", "models");

const MAIN_VENV = join(BRIDGE, ".venv");
/**
 * 18.12.1 Kokoro has an environment of its own, and it is not an accident.
 *
 * Its onnxruntime wants the CUDA 13 wheels and ctranslate2, which carries the
 * transcriber, wants the CUDA 12 ones. Both unpack into the same directory, so
 * installing Kokoro into the main environment would take out transcription in
 * this product and in the bridge at once.
 */
const KOKORO_VENV = process.env.VOICEOVER_KOKORO_VENV ?? join(homedir(), ".sidetone", "kokoro-venv");

const STT_MODEL = process.env.VOICEOVER_STT_MODEL ?? "small.en";
const PIPER_VOICE = process.env.VOICEOVER_VOICE ?? "en_US-lessac-medium";

/**
 * The CUDA wheels inside one virtual environment, for the library path.
 *
 * The only CUDA on the system path belongs to torch and is the wrong major
 * version, so without this a worker starts and then fails on its first request
 * with `libcublas.so.12 is not found`.
 */
function cudaLibraryPath(venv: string): string {
  const root = join(venv, "lib");
  const dirs: string[] = [];
  for (const version of readdirSync(root)) {
    const nvidia = join(root, version, "site-packages", "nvidia");
    try {
      for (const pkg of readdirSync(nvidia)) dirs.push(join(nvidia, pkg, "lib"));
    } catch {
      // no nvidia wheels under this python version
    }
  }
  return [...dirs, process.env.LD_LIBRARY_PATH ?? ""].filter(Boolean).join(":");
}

export interface Engine {
  /** The script under the bridge's `speech/` directory. */
  script: string;
  /** Its own virtual environment, which is not always the main one. */
  venv: string;
  /** The command-line arguments it is started with. */
  args(voice?: string): string[];
  /**
   * What is wrong with a worker that started anyway.
   *
   * onnxruntime falls back to the processor without failing, so an engine that
   * can say it is on the card gets to check, and the caller says so once.
   */
  warn?(ready: Record<string, unknown>): string | null;
}

export type EngineName = "stt" | "piper" | "kokoro";

export const ENGINES: Record<EngineName, Engine> = {
  stt: {
    script: "stt_worker.py",
    venv: MAIN_VENV,
    args: () => [STT_MODEL, MODELS],
  },

  piper: {
    script: "tts_worker.py",
    venv: MAIN_VENV,
    args: () => [join(MODELS, `${PIPER_VOICE}.onnx`)],
  },

  kokoro: {
    script: "kokoro_worker.py",
    venv: KOKORO_VENV,
    args: (voice) => [
      join(MODELS, "kokoro", "kokoro-v1.0.onnx"),
      join(MODELS, "kokoro", "voices-v1.0.bin"),
      voice ?? "am_michael",
    ],
    warn: (ready) =>
      ready.provider && ready.provider !== "CUDAExecutionProvider"
        ? `the voice runs on ${String(ready.provider)}, not the card`
        : null,
  },
};

/** The interpreter of one engine's environment. */
export function pythonFor(engine: Engine): string {
  // Kokoro's environment names it `python`; the bridge's names it `python3`.
  return join(engine.venv, "bin", engine.venv === MAIN_VENV ? "python3" : "python");
}

export function environmentFor(engine: Engine): Record<string, string> {
  return { LD_LIBRARY_PATH: cudaLibraryPath(engine.venv) };
}

export function scriptFor(engine: Engine): string {
  return join(BRIDGE, "speech", engine.script);
}
