/**
 * The caller as a framework worker (spec 18.14).
 *
 * 8.5 is the finding this file answers: a session started by a plain script
 * never loads the local end-of-turn model, and commits turns on a clock
 * instead. The worker model is what registers the model's runner and builds the
 * executor it calls, so the caller runs as a job inside it.
 *
 * A job carries its whole call in its metadata: the brief, where to post what
 * happens, and where the report goes. The job writes the report itself, from
 * local state, because 11.4 says the report must not depend on the brain.
 *
 * Usage (the user interface starts this itself):
 *   bun src/call/agent.ts dev
 */
import { fileURLToPath } from "node:url";
import { RoomEvent } from "@livekit/rtc-node";
import { type JobContext, ServerOptions, cli, defineAgent, voice as voiceNs } from "@livekit/agents";
import type { Brief } from "./brief.ts";
import { SessionBridge } from "./bridge.ts";
import { writeReport } from "./reportStore.ts";
import { buildSession } from "./session.ts";
import { type AnsweredBy, type EndReason, constants } from "./state.ts";
import { prompt } from "../prompts.ts";

export const AGENT_NAME = "caller";
/** What the user interface puts in the dispatch, and this file reads back. */
export interface JobBrief {
  mode: "call" | "rehearsal";
  brief: Brief;
  /** The telephone number, or the personality's name in a rehearsal. */
  number: string;
  /** Where to POST what happens, so the console can show it. */
  events?: string;
  /** Where the report goes. */
  reportDir?: string;
  /** Whose audio the caller listens to. A rehearsal names the receiver. */
  farEnd?: string;
  /** What a rehearsal already knows answered. A real call learns it (13.6.2). */
  answered?: AnsweredBy;
  /** True to classify what answered with the framework's own detector. */
  classify?: boolean;
}

const COMMAND_TOPIC = "caller.command";
type Command = { kind: "hangup" } | { kind: "jump"; ms: number } | { kind: "end"; reason: EndReason };

const AMD_ANSWER: Record<voiceNs.AMDCategory, AnsweredBy> = {
  [voiceNs.AMDCategory.HUMAN]: "person",
  [voiceNs.AMDCategory.MACHINE_VM]: "voicemail",
  [voiceNs.AMDCategory.MACHINE_IVR]: "ivr",
  [voiceNs.AMDCategory.MACHINE_UNAVAILABLE]: "dead",
  [voiceNs.AMDCategory.UNCERTAIN]: "unknown",
};

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const job = JSON.parse(ctx.job.metadata || "{}") as JobBrief;
    if (!job.brief?.goal) throw new Error("the job carries no brief");

    const post = (event: Record<string, unknown>) => {
      if (!job.events) return;
      void fetch(job.events, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      }).catch(() => undefined);
    };

    const bridge = new SessionBridge({
      onPhase: (phase) => post({ type: "phase", phase }),
      onLine: (who, text, final, id) => post({ type: "line", who, text, final, id }),
      onEvent: (text, tone) => post({ type: "event", text, tone }),
      onTiming: (t) => post({ type: "reply", ...t }),
      onCounts: (counts) => post({ type: "counts", ...counts }),
    });

    post({ type: "status", text: "Loading the caller: transcriber, voice and brain" });
    const engines = await buildSession(job.brief, { onDeferred: (detail) => bridge.noteDeferred(detail) });
    bridge.attach(engines.session);

    let offsetMs = 0;
    let ending: EndReason | null = null;
    const end = (reason: EndReason) => {
      ending ??= reason;
    };

    ctx.room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
      if (topic !== COMMAND_TOPIC) return;
      const command = JSON.parse(new TextDecoder().decode(payload)) as Command;
      if (command.kind === "hangup") end("operator-hung-up");
      if (command.kind === "end") end(command.reason);
      if (command.kind === "jump") offsetMs += command.ms;
    });
    ctx.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      if (!job.farEnd || participant.identity === job.farEnd) end("far-end-hung-up");
    });

    post({ type: "status", text: "Joining the room" });
    await ctx.connect();
    post({ type: "status", text: "Starting the session" });
    await engines.session.start({
      agent: engines.agent,
      room: ctx.room,
      ...(job.farEnd ? { inputOptions: { participantIdentity: job.farEnd } } : {}),
    });

    post({ type: "status", text: "The caller is on the line" });
    const startedAt = Date.now();
    bridge.apply({ kind: "dial", at: startedAt });
    bridge.apply({ kind: "answered", at: startedAt, by: job.answered ?? "unknown" });
    post({ type: "started", room: ctx.room.name ?? "", answered: job.answered ?? "unknown" });

    // 13.6: the framework can say what answered, and 13.6.2 says only the agent
    // session can. A real call asks; a rehearsal already knows.
    if (job.classify) {
      void new voiceNs.AMD(engines.session, { interruptOnMachine: false, waitUntilFinished: true })
        .execute()
        .then((verdict) => {
          const answered = AMD_ANSWER[verdict.category] ?? "unknown";
          bridge.setAnsweredBy(answered);
          post({ type: "answered", answered, because: verdict.reason });
          post({ type: "event", text: `Answered by ${answered}, by the framework's detector`, tone: "green" });
        })
        .catch((error) => post({ type: "event", text: `The answer detector failed: ${error}`, tone: "red" }));
    }

    // 8.4: the audio end-of-turn model predicts per turn. A prediction is the
    // proof it is loaded at all, which 8.5 says a standalone session never gets.
    let predictions = 0;
    engines.session.on(voiceNs.AgentSessionEventTypes.EotPrediction, (ev) => {
      predictions++;
      const probability = (ev as { probability?: number }).probability;
      if (predictions === 1) {
        post({
          type: "event",
          text: `The local end-of-turn model is running: first prediction ${probability?.toFixed(2) ?? "?"}`,
          tone: "green",
        });
      }
    });

    engines.session.once(voiceNs.AgentSessionEventTypes.Close, () => end("goal-closed"));

    let softFired = false;
    const elapsed = () => Date.now() - startedAt + offsetMs;
    while (!ending) {
      bridge.apply({ kind: "tick", at: startedAt + elapsed() });
      if (elapsed() >= constants.hardLimitMs) {
        end("hard-limit");
        break;
      }
      if (elapsed() >= constants.softLimitMs && !softFired) {
        softFired = true;
        post({ type: "event", text: "Soft limit. It closes after the current sentence.", tone: "amber" });
        post({ type: "phase", phase: "closing" });
        // 11.2: the limit starts the close and never cuts a sentence.
        engines.session
          .generateReply({ instructions: prompt("caller.soft-limit"), allowInterruptions: false })
          .waitForPlayout()
          .then(() => end("soft-limit"))
          .catch(() => end("soft-limit"));
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const reason: EndReason = ending ?? "caller-hung-up";
    const report = bridge.report(reason, { number: job.number, goal: job.brief.goal }, Date.now(), elapsed());
    const path = await writeReport(report, job.reportDir).catch((error) => `not written: ${error}`);
    post({ type: "ended", report: { ...report, interruptions: bridge.interruptions, falseInterruptions: bridge.falseInterruptions }, path });

    await engines.session.close().catch(() => undefined);
    await engines.close().catch(() => undefined);
  },
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      // An explicit name, so a dispatch reaches this worker and nothing else.
      agentName: AGENT_NAME,
      numIdleProcesses: 1,
    }),
  );
}
