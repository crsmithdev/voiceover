/**
 * The local voice (spec 13.2). Reuses the voice bridge's Piper worker rather
 * than installing a second one, so both products speak with the same voice.
 *
 * The worker is one long-lived process: loading the voice costs about a second
 * and each sentence costs about 80 milliseconds (spec 15.5).
 */
import { homedir } from "node:os";
import { join } from "node:path";

const BRIDGE = process.env.VOICE_BRIDGE_HOME ?? join(homedir(), "voice-bridge-mcp");
const MODELS = process.env.VOICE_BRIDGE_MODELS ?? join(homedir(), ".voice-bridge", "models");
const VOICE = process.env.CALLER_VOICE ?? "en_US-lessac-medium";

type Worker = Bun.Subprocess<"pipe", "pipe", "inherit">;

export class Voice {
  private child: Worker | null = null;
  private lines: AsyncIterableIterator<string> | null = null;

  async start(): Promise<void> {
    this.child = Bun.spawn(
      [join(BRIDGE, ".venv", "bin", "python3"), join(BRIDGE, "speech", "tts_worker.py"), join(MODELS, `${VOICE}.onnx`)],
      { stdin: "pipe", stdout: "pipe", stderr: "inherit" },
    ) as Worker;
    this.lines = readLines(this.child.stdout);
    const ready = await this.next();
    if (ready.ready !== true) throw new Error(`the voice did not start: ${JSON.stringify(ready)}`);
  }

  async say(text: string, wavPath: string): Promise<string> {
    if (!this.child) throw new Error("the voice is not started");
    this.child.stdin.write(`${JSON.stringify({ text, wav: wavPath })}\n`);
    this.child.stdin.flush();
    const reply = await this.next();
    if (reply.error) throw new Error(`the voice failed: ${reply.error}`);
    return reply.wav as string;
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
  }

  private async next(): Promise<Record<string, unknown>> {
    const line = await this.lines?.next();
    if (!line || line.done) throw new Error("the voice worker closed");
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
