/**
 * Starting the caller's worker and handing it a call (spec 18.14).
 *
 * A worker belongs to one LiveKit deployment, so there is one per deployment:
 * the local server a rehearsal runs on, and the cloud project a real call runs
 * on. Each is started once, on demand, and kept for the next call.
 *
 * A dispatch is how a job reaches it, and the job's metadata is the call. A
 * command reaches a running job as a data message on the room, which is how
 * the console hangs up.
 */
import { join } from "node:path";
import { DataPacket_Kind } from "@livekit/protocol";
import { AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { AGENT_NAME, type JobBrief } from "./agent.ts";
import type { EndReason } from "./state.ts";

export interface Deployment {
  url: string;
  apiKey: string;
  apiSecret: string;
}

const AGENT_FILE = join(import.meta.dir, "agent.ts");
const COMMAND_TOPIC = "caller.command";
export type Command =
  | { kind: "hangup" }
  | { kind: "jump"; ms: number }
  | { kind: "end"; reason: EndReason };

interface Running {
  process: Bun.Subprocess;
  ready: Promise<void>;
}
const workers = new Map<string, Running>();

/** The worker registers with LiveKit and says so; that line is the signal. */
export async function ensureWorker(deployment: Deployment, say: (text: string) => void = () => {}): Promise<void> {
  const existing = workers.get(deployment.url);
  if (existing && existing.process.exitCode === null) return existing.ready;
  say("Starting the caller's worker");

  const child = Bun.spawn(["bun", AGENT_FILE, "dev", "--log-level", "info"], {
    env: {
      ...process.env,
      LIVEKIT_URL: deployment.url,
      LIVEKIT_API_KEY: deployment.apiKey,
      LIVEKIT_API_SECRET: deployment.apiSecret,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  // Keep draining both streams: the worker's log is where a failing job says
  // so, and an unread pipe eventually blocks the child.
  let sawRegistration = false;
  const seen = new Promise<void>((resolve) => {
    const decoder = new TextDecoder();
    const drain = async (stream: ReadableStream<Uint8Array>) => {
      for await (const chunk of stream) {
        for (const line of decoder.decode(chunk as Uint8Array).split("\n")) {
          if (!line.trim()) continue;
          if (/registered worker/i.test(line)) {
            sawRegistration = true;
            resolve();
          }
          if (process.env.CALLER_WORKER_LOG !== "off") console.log(`worker: ${line.trim().slice(0, 400)}`);
        }
      }
    };
    void drain(child.stdout as ReadableStream<Uint8Array>);
    void drain(child.stderr as ReadableStream<Uint8Array>);
    void child.exited.then(() => resolve());
  });
  const registered = seen.then(() => {
    if (!sawRegistration) throw new Error("the caller's worker stopped before it registered");
  });

  const ready = Promise.race([
    registered,
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error("the caller's worker did not register in 60 s")), 60_000)),
  ]).then(() => {
    say("The caller's worker is registered");
  });

  workers.set(deployment.url, { process: child, ready });
  return ready;
}

export function stopWorkers(): void {
  for (const { process } of workers.values()) process.kill();
  workers.clear();
}

export async function dispatchCall(deployment: Deployment, room: string, job: JobBrief): Promise<void> {
  const client = new AgentDispatchClient(deployment.url.replace(/^ws/, "http"), deployment.apiKey, deployment.apiSecret);
  await client.createDispatch(room, AGENT_NAME, { metadata: JSON.stringify(job) });
}

export async function sendCommand(deployment: Deployment, room: string, command: Command): Promise<void> {
  const client = new RoomServiceClient(deployment.url.replace(/^ws/, "http"), deployment.apiKey, deployment.apiSecret);
  await client.sendData(room, new TextEncoder().encode(JSON.stringify(command)), DataPacket_Kind.RELIABLE, {
    topic: COMMAND_TOPIC,
  });
}
