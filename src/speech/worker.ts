/**
 * The long-lived Python speech workers (spec 13.2).
 *
 * Every engine comes from the voice bridge and speaks the same protocol: one
 * JSON request per line on stdin, one JSON reply per line on stdout. They cost
 * seconds to load and a fraction of a second to run, so they start once.
 *
 * The protocol passes audio as a file path, which is why `round` exists. Each
 * adapter used to build its own temporary name, write or read it, and leave it
 * there: no `unlink` existed anywhere in this directory, so every sentence of
 * every call left a wav in the temporary directory for the machine to collect.
 * The file's whole life now belongs to one method.
 */
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Engine, type EngineName, ENGINES, environmentFor, pythonFor, scriptFor } from "./engines.ts";

type Child = Bun.Subprocess<"pipe", "pipe", "inherit">;

/** Where the scratch wav for one request goes. Nothing outside this file names it. */
function scratchPath(kind: string): string {
  return join(tmpdir(), `voiceover-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
}

export class Worker {
  private child: Child | null = null;
  private lines: AsyncIterableIterator<string> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly engine: Engine;

  /**
   * An engine by name, and a voice for the engines that take one. A caller needs
   * to know nothing about interpreters, environments or CUDA wheels.
   */
  constructor(
    private readonly name: EngineName,
    private readonly voice?: string,
  ) {
    this.engine = ENGINES[name];
  }

  async start(): Promise<Record<string, unknown>> {
    this.child = Bun.spawn([pythonFor(this.engine), scriptFor(this.engine), ...this.engine.args(this.voice)], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
      env: { ...process.env, ...environmentFor(this.engine) },
    }) as Child;
    this.lines = readLines(this.child.stdout);
    const ready = await this.read();
    if (ready.ready !== true) throw new Error(`${this.engine.script} did not start: ${JSON.stringify(ready)}`);
    return ready;
  }

  /** What is wrong with a worker that started anyway, or null (see `Engine.warn`). */
  complaint(ready: Record<string, unknown>): string | null {
    return this.engine.warn?.(ready) ?? null;
  }

  /** One request at a time: the worker answers in order on one pipe. */
  ask(request: unknown): Promise<Record<string, unknown>> {
    const next = this.queue.then(async () => {
      if (!this.child) throw new Error(`${this.engine.script} is not started`);
      this.child.stdin.write(`${JSON.stringify(request)}\n`);
      this.child.stdin.flush();
      const reply = await this.read();
      if (reply.error) throw new Error(`${this.engine.script} failed: ${reply.error}`);
      return reply;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /**
   * One request that passes audio through a scratch file, deleted afterwards
   * whether the request worked or not.
   *
   * `write` hands the worker bytes to read: the caller's audio goes in and the
   * reply is the answer. `read` hands it a path to fill: the reply is ignored and
   * the bytes it wrote come back. Either way the file is gone on return.
   */
  async round(
    request: Record<string, unknown>,
    direction: { write: Uint8Array } | { read: true },
  ): Promise<{ reply: Record<string, unknown>; bytes: Uint8Array | null }> {
    const path = scratchPath(this.name);
    try {
      if ("write" in direction) await Bun.write(path, direction.write);
      const reply = await this.ask({ ...request, wav: path });
      const bytes = "read" in direction ? new Uint8Array(await Bun.file(path).arrayBuffer()) : null;
      return { reply, bytes };
    } finally {
      await unlink(path).catch(() => undefined);
    }
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
  }

  private async read(): Promise<Record<string, unknown>> {
    const line = await this.lines?.next();
    if (!line || line.done) throw new Error(`${this.engine.script} closed`);
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
