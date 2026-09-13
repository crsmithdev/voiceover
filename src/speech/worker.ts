/**
 * The long-lived Python speech workers (spec 13.2).
 *
 * Both engines come from the voice bridge and speak the same protocol: one
 * JSON request per line on stdin, one JSON reply per line on stdout. Both cost
 * seconds to load and a fraction of a second to run, so they start once.
 *
 * faster-whisper needs the CUDA wheels inside the virtual environment on the
 * library path. The only CUDA on the system path belongs to torch and is the
 * wrong major version, so without this the worker starts and then fails on the
 * first transcription with `libcublas.so.12 is not found`.
 */
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const BRIDGE = process.env.VOICE_BRIDGE_HOME ?? join(homedir(), "voice-bridge-mcp");
export const MODELS = process.env.VOICE_BRIDGE_MODELS ?? join(homedir(), ".voice-bridge", "models");

export function pythonBin(): string {
  return join(BRIDGE, ".venv", "bin", "python3");
}

export function cudaLibraryPath(): string {
  const root = join(BRIDGE, ".venv", "lib");
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

type Child = Bun.Subprocess<"pipe", "pipe", "inherit">;

export class Worker {
  private child: Child | null = null;
  private lines: AsyncIterableIterator<string> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly script: string,
    private readonly args: string[],
    private readonly env: Record<string, string> = {},
  ) {}

  async start(): Promise<Record<string, unknown>> {
    this.child = Bun.spawn([pythonBin(), join(BRIDGE, "speech", this.script), ...this.args], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
      env: { ...process.env, ...this.env },
    }) as Child;
    this.lines = readLines(this.child.stdout);
    const ready = await this.read();
    if (ready.ready !== true) throw new Error(`${this.script} did not start: ${JSON.stringify(ready)}`);
    return ready;
  }

  /** One request at a time: the worker answers in order on one pipe. */
  ask(request: unknown): Promise<Record<string, unknown>> {
    const next = this.queue.then(async () => {
      if (!this.child) throw new Error(`${this.script} is not started`);
      this.child.stdin.write(`${JSON.stringify(request)}\n`);
      this.child.stdin.flush();
      const reply = await this.read();
      if (reply.error) throw new Error(`${this.script} failed: ${reply.error}`);
      return reply;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
  }

  private async read(): Promise<Record<string, unknown>> {
    const line = await this.lines?.next();
    if (!line || line.done) throw new Error(`${this.script} closed`);
    return JSON.parse(line.value);
  }
}

async function* readLines(stream: ReadableStream<Uint8Array>): AsyncIterableIterator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) if (part.trim()) yield part;
  }
}
