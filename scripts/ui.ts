/**
 * The local user interface (spec 18.2), served with a live rehearsal behind it.
 *
 * Rehearsal is real: the caller against a test receiver in a local room
 * (spec 12.8). On air stays a simulation in the page until it is wired to
 * `scripts/call.ts`.
 *
 * Usage:
 *   bun scripts/ui.ts            serves http://127.0.0.1:3002
 */
import { join } from "node:path";
import type { Brief } from "../src/call/brief.ts";
import { PERSONAS } from "../src/rehearsal/personas.ts";
import { CHALLENGES, type Challenge, LIVEKIT_URL, Rehearsal, type UiEvent, listenToken } from "../src/rehearsal/room.ts";

const PORT = Number(process.env.CALLER_UI_PORT ?? 3002);
const PAGE = join(import.meta.dir, "..", "design", "caller.html");

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

    if (route === "GET /" || route === "GET /caller.html") {
      return new Response(Bun.file(PAGE), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (route === "GET /api/health") {
      return json({ rehearsal: "live", livekit: LIVEKIT_URL, running: current?.running ?? false });
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
      const rehearsal = new Rehearsal(brief, persona, emit);
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
    return new Response("not found", { status: 404 });
  },
});

console.log(`caller ui: http://127.0.0.1:${PORT}`);
