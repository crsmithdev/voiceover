/**
 * The local user interface (spec 18.2), and everything behind it.
 *
 * Both kinds of call are real. A rehearsal runs the caller against a test
 * receiver in a local room (12.8); On air dials a telephone through the trunk
 * of 13.5, behind the gate of 10.10 and the rate limit of 16.5. The caller
 * itself always runs as a job in its own worker (18.14), and posts what happens
 * back to this server, which passes it to the page.
 *
 * Usage:
 *   bun scripts/ui.ts            serves http://127.0.0.1:3002
 */
import { join } from "node:path";
import { type Brief, instructionsFor } from "../src/call/brief.ts";
import { dialler } from "../src/call/dial.ts";
import { type Deployment, sendCommand } from "../src/call/dispatch.ts";
import { type LineType, ownedNumbers } from "../src/call/numbers.ts";
import { CALLS_PER_HOUR, readHistory, withinRate } from "../src/call/rate.ts";
import type { Report } from "../src/call/report.ts";
import { rehearsalDir, reportDir, reports } from "../src/call/reports.ts";
import { constants } from "../src/call/state.ts";
import { PROMPTS_FILE, listPrompts, resetPrompt, setPrompt } from "../src/prompts.ts";
import { PERSONAS } from "../src/rehearsal/personas.ts";
import {
  CHALLENGES,
  type Challenge,
  LIVEKIT_URL,
  Rehearsal,
  type UiEvent,
  listenToken,
} from "../src/rehearsal/room.ts";

const PORT = Number(process.env.VOICEOVER_UI_PORT ?? 3002);
const PAGE = join(import.meta.dir, "..", "design", "voiceover.html");
const EVENTS_URL = `http://127.0.0.1:${PORT}/api/internal/events`;
const place = dialler();

/** A real call needs the cloud project and the trunk; a rehearsal does not. */
function cloud(): Deployment {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) throw new Error("LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set");
  return { url, apiKey, apiSecret };
}

interface LiveCall {
  room: string;
  number: string;
  deployment: Deployment;
  ended: boolean;
}
let call: LiveCall | null = null;

const clients = new Set<ReadableStreamDefaultController<string>>();
const history: UiEvent[] = [];
let current: Rehearsal | null = null;

function emit(event: UiEvent): void {
  if (event.type === "started") history.length = 0;
  history.push(event);
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of clients) {
    try {
      c.enqueue(data);
    } catch {
      clients.delete(c);
    }
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const route = `${req.method} ${url.pathname}`;

    if (route === "GET /" || route === "GET /voiceover.html") {
      return new Response(Bun.file(PAGE), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (route === "GET /api/health") {
      let dialling: string | null = null;
      try {
        cloud();
        if (!process.env.LIVEKIT_TRUNK_ID) dialling = "LIVEKIT_TRUNK_ID is not set";
      } catch (error) {
        dialling = error instanceof Error ? error.message : String(error);
      }
      return json({
        rehearsal: "live",
        onAir: dialling === null ? "live" : "unavailable",
        why: dialling,
        livekit: LIVEKIT_URL,
        running: current?.running ?? (call !== null && !call.ended),
      });
    }
    if (route === "GET /api/preflight") {
      const owned = ownedNumbers();
      const rate = withinRate(await readHistory(), Date.now());
      return json({
        owned,
        limit: CALLS_PER_HOUR,
        remaining: rate.allowed ? rate.remaining : 0,
        because: rate.allowed ? null : rate.because,
        softLimitMs: constants.softLimitMs,
        hardLimitMs: constants.hardLimitMs,
      });
    }
    // The caller's job posts here. Everything it says reaches the page, and a
    // rehearsal also watches it so it knows when to close the receiver down.
    if (route === "POST /api/internal/events") {
      const event = (await req.json()) as UiEvent;
      if (current?.running) current.onCallerEvent(event);
      else emit(event);
      if (event.type === "ended" && call) call.ended = true;
      return json({ ok: true });
    }
    if (route === "POST /api/call/start") {
      if (current?.running || (call && !call.ended)) return json({ error: "a call is already running" }, 409);
      const { brief, number, lineType } = (await req.json()) as { brief: Brief; number: string; lineType: LineType };
      if (!brief?.goal?.trim()) return json({ error: "the rundown needs a goal" }, 400);

      let deployment: Deployment;
      try {
        deployment = cloud();
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
      const trunk = process.env.LIVEKIT_TRUNK_ID;
      if (!trunk) return json({ error: "LIVEKIT_TRUNK_ID is not set; run scripts/setup-trunk.ts" }, 400);

      // Every decision about placing a call is `dial.ts`'s. This route's job is
      // to turn a refusal into a status code, which is the one thing it knows
      // that the module does not.
      const placed = await place.place({
        brief,
        number: number ?? "",
        lineType: lineType ?? "unknown",
        deployment,
        trunk,
        events: EVENTS_URL,
        reportDir: reportDir(),
        say: (text) => emit({ type: "status", text }),
        onAnswered: () => emit({ type: "event", text: "Something picked up", tone: "green" }),
        onDeadLine: (because) => emit({ type: "event", text: `The line did not answer: ${because}`, tone: "red" }),
      });

      if (!placed.ok) {
        const status = placed.refusedBy === "rate" ? 429 : 400;
        return json({ error: `the ${placed.refusedBy} refused it: ${placed.because}` }, status);
      }

      call = { room: placed.room, number: number ?? "", deployment, ended: false };
      emit({ type: "started", room: placed.room, answers: "unknown" });
      emit({ type: "phase", phase: "dialing" });
      emit({ type: "event", text: `Dialing. The gate allowed it: ${placed.because}` });
      emit({ type: "phase", phase: "ringing" });
      return json({ room: placed.room });
    }
    if (route === "POST /api/call/hangup") {
      if (!call || call.ended) return json({ error: "no call is running" }, 409);
      await sendCommand(call.deployment, call.room, { kind: "hangup" });
      return json({ ok: true });
    }
    if (route === "GET /api/reports") {
      // 18.6's expiry happens inside `list()`, so it runs whether or not this
      // route is the thing that reads them.
      const store = reports(url.searchParams.get("dir") === "rehearsals" ? rehearsalDir() : reportDir());
      return json({ dir: store.dir, reports: await store.list() });
    }
    if (route === "GET /api/personas") {
      return json(PERSONAS.map(({ id, name, answers }) => ({ id, name, answers })));
    }
    if (route === "GET /api/events") {
      let self: ReadableStreamDefaultController<string>;
      const stream = new ReadableStream<string>({
        start(controller) {
          self = controller;
          clients.add(controller);
          controller.enqueue(": connected\n\n");
        },
        cancel() {
          clients.delete(self);
        },
      });
      return new Response(stream, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
      });
    }
    if (route === "POST /api/rehearsal/start") {
      if (current?.running) return json({ error: "a rehearsal is already running" }, 409);
      const { brief, persona } = (await req.json()) as { brief: Brief; persona: string };
      if (!brief?.goal?.trim()) return json({ error: "the rundown needs a goal" }, 400);
      if (!PERSONAS.some((p) => p.id === persona)) return json({ error: `no personality called ${persona}` }, 400);
      const rehearsal = new Rehearsal(brief, persona, emit, EVENTS_URL);
      current = rehearsal;
      rehearsal.start().catch((error) => {
        emit({ type: "error", text: String(error instanceof Error ? error.message : error) });
        void rehearsal.hangUp();
      });
      return json({ room: rehearsal.roomName });
    }
    if (route === "POST /api/rehearsal/challenge") {
      const { id } = (await req.json()) as { id: Challenge };
      if (!CHALLENGES.includes(id)) return json({ error: `no challenge called ${id}` }, 400);
      if (!current?.running) return json({ error: "no rehearsal is running" }, 409);
      void current.challenge(id);
      return json({ ok: true });
    }
    if (route === "POST /api/rehearsal/talkback") {
      const { text } = (await req.json()) as { text: string };
      if (!current?.running) return json({ error: "no rehearsal is running" }, 409);
      void current.talkback(text);
      return json({ ok: true });
    }
    if (route === "POST /api/rehearsal/hangup") {
      if (!current?.running) return json({ error: "no rehearsal is running" }, 409);
      await current.hangUp();
      return json({ ok: true });
    }
    if (route === "GET /api/rehearsal/listen") {
      if (!current?.running) return json({ error: "no rehearsal is running" }, 409);
      return json({ url: LIVEKIT_URL, token: await listenToken(current.roomName) });
    }
    if (route === "GET /api/prompts") {
      return json({ file: PROMPTS_FILE, prompts: listPrompts() });
    }
    if (route === "POST /api/prompts/preview") {
      const { brief } = (await req.json()) as { brief: Brief };
      return json({ text: instructionsFor(brief) });
    }
    const edit = url.pathname.match(/^\/api\/prompts\/([\w.-]+)$/);
    if (edit && (req.method === "PUT" || req.method === "DELETE")) {
      const id = edit[1] as string;
      try {
        if (req.method === "PUT") setPrompt(id, ((await req.json()) as { value: string }).value);
        else resetPrompt(id);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
      return json(listPrompts().find((p) => p.id === id));
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`caller ui: http://127.0.0.1:${PORT}`);
