/**
 * Layer three (spec 12.8): the real caller against a test receiver, with the
 * real pipeline on both sides and no telephone network.
 *
 * Both agents join one room on a local LiveKit server. The caller is the same
 * session `scripts/call.ts` places on a real line. The receiver is a second
 * session with its own ears, a Kokoro voice and a cheaper brain (4.9), playing
 * one of the personalities. Chris steers the receiver from the console: the
 * challenges below, or his own words through talkback.
 *
 * What it cannot prove is what 12.8 says: both sides share a clock and skip the
 * network, so the carrier delay, the codec and the echo path stay untested.
 */
import { AudioFrame, Room, RoomEvent } from "@livekit/rtc-node";
import {
  Agent,
  AgentSession,
  initializeLogger,
  llm,
  stt as sttNs,
  tokenize,
  tts as ttsNs,
  voice as voiceNs,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import { AccessToken } from "livekit-server-sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Brief } from "../call/brief.ts";
import { buildReport, type Report } from "../call/report.ts";
import { writeReport } from "../call/reportStore.ts";
import { buildSession, type Engines } from "../call/session.ts";
import { type CallState, type EndReason, type Event, type Phase, constants, initial, step } from "../call/state.ts";
import { KokoroTTS } from "../speech/kokoro.ts";
import { WhisperSTT } from "../speech/stt.ts";
import { prompt } from "../prompts.ts";
import { type Persona, TRANSFER, persona as findPersona } from "./personas.ts";

/** Not 7880: the voice bridge's own server holds that port with its own keys (18.10). */
export const LIVEKIT_URL = process.env.CALLER_REHEARSAL_LIVEKIT ?? "ws://127.0.0.1:7890";
const LIVEKIT_CONFIG = [
  "port: 7890",
  'bind_addresses: ["127.0.0.1"]',
  "rtc:",
  "  tcp_port: 7891",
  "  udp_port: 7892",
  "  use_external_ip: false",
  "keys:",
  "  devkey: secret",
  "logging:",
  "  level: warn",
].join("\n");
/** The dev server's fixed credentials. Nothing outside this machine can reach it. */
const DEV_KEY = "devkey";
const DEV_SECRET = "secret";
const RECEIVER_BRAIN = process.env.CALLER_RECEIVER_BRAIN ?? "google/gemini-2.5-flash";
const ROUTE = process.env.CALLER_BRAIN_BASE_URL ?? "https://openrouter.ai/api/v1";
export const REHEARSAL_DIR = process.env.CALLER_REHEARSAL_DIR ?? join(homedir(), ".caller", "rehearsals");

export type Tone = "amber" | "green" | "red";
export type UiEvent =
  | { type: "status"; text: string }
  | { type: "started"; room: string; persona: string; answers: Persona["answers"] }
  | { type: "phase"; phase: Phase }
  | { type: "line"; id: string; who: "caller" | "them"; text: string; final: boolean }
  | { type: "event"; text: string; tone?: Tone }
  | { type: "reply"; pause: number; stt: number; brain: number; voice: number; total: number }
  | { type: "counts"; turns: number; interruptions: number; falseInterruptions: number }
  | { type: "clock"; offsetMs: number }
  | { type: "ended"; report: Report & { interruptions: number; falseInterruptions: number }; path: string }
  | { type: "error"; text: string };

export const CHALLENGES = [
  "machine",
  "unknown",
  "card",
  "talkover",
  "cough",
  "quiet",
  "hold",
  "transfer",
  "soft",
  "farhangup",
] as const;
export type Challenge = (typeof CHALLENGES)[number];

async function token(room: string, identity: string, publish: boolean): Promise<string> {
  const at = new AccessToken(DEV_KEY, DEV_SECRET, { identity, ttl: "30m" });
  at.addGrant({ roomJoin: true, room, canPublish: publish, canSubscribe: true, canPublishData: publish });
  return at.toJwt();
}

export function listenToken(room: string): Promise<string> {
  return token(room, `listener-${Date.now()}`, false);
}

/** Start the local server when it is not already up. Docker keeps it after the rehearsal ends. */
export async function ensureLivekit(say: (text: string) => void): Promise<void> {
  const http = LIVEKIT_URL.replace(/^ws/, "http");
  const up = async () => {
    try {
      return (await fetch(http, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      return false;
    }
  };
  if (await up()) return;
  say("Starting the local LiveKit server in Docker");
  const run = Bun.spawnSync([
    "docker", "run", "-d", "--rm", "--name", "caller-livekit", "--network", "host",
    "-e", `LIVEKIT_CONFIG=${LIVEKIT_CONFIG}`, "livekit/livekit-server",
  ]);
  if (run.exitCode !== 0 && !run.stderr.toString().includes("already in use")) {
    throw new Error(`docker could not start livekit-server: ${run.stderr.toString().trim()}`);
  }
  for (let i = 0; i < 40; i++) {
    if (await up()) return;
    await Bun.sleep(500);
  }
  throw new Error(`the local LiveKit server did not answer at ${http}`);
}

/* ---------- sounds the receiver can make that are not words ---------- */

const RATE = 24_000;
const FRAME_SAMPLES = RATE / 50;

function streamOf(samples: Float32Array): ReadableStream<AudioFrame> {
  let at = 0;
  return new ReadableStream<AudioFrame>({
    pull(controller) {
      if (at >= samples.length) return controller.close();
      const pcm = new Int16Array(FRAME_SAMPLES);
      for (let i = 0; i < FRAME_SAMPLES && at + i < samples.length; i++) {
        pcm[i] = Math.max(-1, Math.min(1, samples[at + i] as number)) * 32767;
      }
      at += FRAME_SAMPLES;
      controller.enqueue(new AudioFrame(pcm, RATE, 1, FRAME_SAMPLES));
    },
  });
}

/**
 * A coughing fit: shaped noise with no words in it, held past the 500 ms that
 * 7.2.2 asks before sound counts, so the word test of 7.2.3 is what decides.
 */
function cough(): Float32Array {
  const out = new Float32Array(Math.round(RATE * 1.4));
  let brown = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const burst = (s: number, d: number) => (t > s && t < s + d ? Math.sin(((t - s) / d) * Math.PI) ** 0.5 : 0);
    brown = (brown + (Math.random() * 2 - 1) * 0.15) * 0.96;
    out[i] = brown * 3.5 * Math.max(burst(0.02, 0.45), burst(0.4, 0.5), burst(0.85, 0.5));
  }
  return out;
}

/** A plain tune: music is not speech and must satisfy no detector (6.3). */
function holdMusic(seconds: number): Float32Array {
  const notes = [392, 440, 494, 523, 494, 440, 392, 330];
  const out = new Float32Array(Math.round(RATE * seconds));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const n = Math.floor(t / 0.375);
    const f = notes[n % notes.length] as number;
    const local = t - n * 0.375;
    const env = Math.min(1, local / 0.02) * Math.exp(-local * 4);
    out[i] = 0.18 * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t));
  }
  return out;
}

function beep(): Float32Array {
  const out = new Float32Array(Math.round(RATE * 0.45));
  for (let i = 0; i < out.length; i++) out[i] = 0.3 * Math.sin((2 * Math.PI * 1000 * i) / RATE);
  return out;
}

/* ---------- the rehearsal ---------- */

interface Receiver {
  session: AgentSession;
  voice: KokoroTTS;
  ears: WhisperSTT;
}

export class Rehearsal {
  readonly roomName = `rehearsal-${Date.now()}`;
  private caller: Engines | null = null;
  private receiver: Receiver | null = null;
  private callerRoom = new Room();
  private receiverRoom = new Room();
  private state: CallState = initial();
  private heard: string[] = [];
  private said: string[] = [];
  private turns = 0;
  private interruptions = 0;
  private falseInterruptions = 0;
  private receiverSpeaking = false;
  private lineId = 0;
  private offsetMs = 0;
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private softFired = false;
  private ended = false;
  private busy = false;
  private metrics = { eou: 0, stt: 0, ttft: 0, ttfb: 0, fresh: false };
  private persona: Persona;
  private messageSaid = false;

  constructor(
    private readonly brief: Brief,
    personaId: string,
    private readonly emit: (event: UiEvent) => void,
  ) {
    this.persona = findPersona(personaId);
  }

  get running(): boolean {
    return !this.ended;
  }

  private apply(event: Event): void {
    this.state = step(this.state, event, constants).state;
  }

  private elapsed(): number {
    return Date.now() - this.startedAt + this.offsetMs;
  }

  async start(): Promise<void> {
    initializeLogger({ pretty: true, level: "warn" });
    const status = (text: string) => this.emit({ type: "status", text });
    await ensureLivekit(status);

    status("Loading the caller: transcriber, voice and brain");
    this.caller = await buildSession(this.brief);
    status(`Loading the receiver: ${this.persona.name}`);
    this.receiver = await this.buildReceiver();

    await this.callerRoom.connect(LIVEKIT_URL, await token(this.roomName, "caller", true), { autoSubscribe: true, dynacast: false });
    await this.receiverRoom.connect(LIVEKIT_URL, await token(this.roomName, "receiver", true), { autoSubscribe: true, dynacast: false });

    this.wireCaller(this.caller.session);
    this.wireReceiver(this.receiver.session);

    await this.caller.session.start({
      agent: this.caller.agent,
      room: this.callerRoom,
      inputOptions: { participantIdentity: "receiver" },
    });
    await this.receiver.session.start({
      agent: this.receiverAgent(this.persona),
      room: this.receiverRoom,
      inputOptions: { participantIdentity: "caller" },
    });

    this.startedAt = Date.now();
    this.apply({ kind: "dial", at: this.startedAt });
    this.emit({ type: "started", room: this.roomName, persona: this.persona.name, answers: this.persona.answers });
    this.emit({ type: "phase", phase: "dialing" });
    await Bun.sleep(700);
    this.emit({ type: "phase", phase: "ringing" });
    await Bun.sleep(1200);

    this.apply({ kind: "answered", at: Date.now(), by: this.persona.answers });
    const who = { person: "a person", voicemail: "a voicemail machine", ivr: "a menu" }[this.persona.answers];
    this.emit({ type: "event", text: `Answered by ${who}. The rehearsal knows this; no detector ran.`, tone: "green" });

    this.timer = setInterval(() => this.tick(), 250);
    this.callerRoom.on(RoomEvent.ParticipantDisconnected, (p) => {
      if (p.identity === "receiver") void this.finish("far-end-hung-up");
    });

    await this.receiverGreets();
  }

  private async buildReceiver(): Promise<Receiver> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set; put it in .env");
    const voice = new KokoroTTS(this.persona.voice);
    const ears = new WhisperSTT();
    await Promise.all([voice.warm(), ears.warm()]);
    const vad = await silero.VAD.load();
    const session = new AgentSession({
      vad,
      stt: new sttNs.StreamAdapter(ears, vad),
      tts: new ttsNs.StreamAdapter(voice, new tokenize.basic.SentenceTokenizer()),
      llm: new openai.LLM({ model: RECEIVER_BRAIN, baseURL: ROUTE, apiKey }),
    });
    return { session, voice, ears };
  }

  private receiverAgent(p: Persona): Agent {
    return new Agent({
      instructions: `${prompt("receiver.frame")}\n\n${prompt(`persona.${p.id}.prompt`)}`,
      tools: {
        hang_up: llm.tool({
          description: prompt("receiver.tool.hang_up"),
          execute: async () => {
            setTimeout(() => void this.farEndHangsUp(), 1500);
            return "You hang up.";
          },
        }),
        connect_to_person: llm.tool({
          description: prompt("receiver.tool.connect_to_person"),
          execute: async () => {
            setTimeout(() => void this.challenge("transfer"), 800);
            return "Connecting.";
          },
        }),
      },
    });
  }

  private async receiverGreets(): Promise<void> {
    const r = this.receiver;
    if (!r) return;
    if (this.persona.answers === "voicemail") {
      await r.session.say(prompt(`persona.${this.persona.id}.greeting`));
      await r.session.say("", { audio: streamOf(beep()), addToChatCtx: false });
      this.emit({ type: "event", text: "The tone. A greeting is a monologue; turn-taking is off until here." });
      r.session.pauseReplyAuthorization();
      this.messageSaid = false;
      return;
    }
    r.session.say(prompt(`persona.${this.persona.id}.greeting`));
  }

  private wireCaller(s: AgentSession): void {
    const E = voiceNs.AgentSessionEventTypes;
    let partial: string | null = null;

    s.on(E.AgentStateChanged, (ev) => {
      if (this.ended) return;
      if (ev.oldState === "speaking" && ev.newState !== "speaking" && this.receiverSpeaking) {
        this.interruptions++;
        this.emit({ type: "phase", phase: "interrupted" });
        this.emit({ type: "event", text: "They spoke over it. Playback stopped.", tone: "amber" });
        this.counts();
        return;
      }
      if (ev.newState === "speaking" && this.metrics.fresh) {
        const m = this.metrics;
        const pause = Math.max(0, m.eou - m.stt) / 1000;
        const sttS = m.stt / 1000;
        const brain = m.ttft / 1000;
        const voice = m.ttfb / 1000;
        this.emit({ type: "reply", pause, stt: sttS, brain, voice, total: pause + sttS + brain + voice });
        m.fresh = false;
      }
      const map: Record<string, Phase> = { listening: "listening", thinking: "thinking", speaking: "speaking" };
      const phase = map[ev.newState];
      if (phase) this.emit({ type: "phase", phase });
    });

    s.on(E.UserStateChanged, (ev) => {
      this.receiverSpeaking = ev.newState === "speaking";
    });

    s.on(E.UserInputTranscribed, (ev) => {
      if (this.ended) return;
      partial ??= `them-${++this.lineId}`;
      this.emit({ type: "line", id: partial, who: "them", text: ev.transcript, final: ev.isFinal });
      if (ev.isFinal) partial = null;
    });

    s.on(E.ConversationItemAdded, (ev) => {
      if (this.ended) return;
      const item = ev.item as { role?: string; textContent?: string };
      const text = item.textContent?.trim();
      if (!text) return;
      // The framework owns the turn, so the machine hears about it afterwards:
      // a finished transcript is a transcript and an end of turn, and a spoken
      // reply is a sentence that played. Without this the disclosure debt of
      // 10.4 is set and never cleared, and the report warns about every call.
      if (item.role === "user") {
        this.heard.push(text);
        // 10.4: the debt is set by the question, not by whether it was answered.
        const question = /\b(a\s*)?(robot|machine|recording|ai|a\.?i\.?|artificial|real person|human)\b/i.test(text);
        this.apply({ kind: "transcript", at: Date.now(), words: text.split(/\s+/).length, disclosureQuestion: question });
        this.apply({ kind: "endOfTurn", at: Date.now() });
        if (question) this.emit({ type: "event", text: "Asked whether it is a machine", tone: "amber" });
      } else if (item.role === "assistant") {
        this.said.push(text);
        this.apply({ kind: "sentenceReady", at: Date.now(), text });
        this.apply({ kind: "playbackFinished", at: Date.now() });
        this.turns++;
        this.emit({ type: "line", id: `caller-${++this.lineId}`, who: "caller", text, final: true });
        if (this.persona.answers === "voicemail") this.messageSaid = true;
        this.counts();
      }
    });

    s.on(E.MetricsCollected, (ev) => {
      const m = ev.metrics as { type: string; endOfUtteranceDelayMs?: number; transcriptionDelayMs?: number; ttftMs?: number; ttfbMs?: number };
      if (m.type === "eou_metrics") {
        this.metrics.eou = m.endOfUtteranceDelayMs ?? 0;
        this.metrics.stt = m.transcriptionDelayMs ?? 0;
        this.metrics.fresh = true;
      } else if (m.type === "llm_metrics" && m.ttftMs !== undefined && m.ttftMs >= 0) {
        this.metrics.ttft = m.ttftMs;
      } else if (m.type === "tts_metrics" && m.ttfbMs !== undefined && m.ttfbMs >= 0) {
        this.metrics.ttfb = m.ttfbMs;
      }
    });

    s.on(E.AgentFalseInterruption, (ev) => {
      if (this.ended) return;
      this.interruptions++;
      this.falseInterruptions++;
      this.emit({
        type: "event",
        text: ev.resumed ? "Sound on the line and no words. It resumed the sentence." : "Sound on the line and no words. It did not resume.",
        tone: "amber",
      });
      this.counts();
    });

    s.on(E.Error, (ev) => this.emit({ type: "error", text: `caller: ${String((ev as { error?: unknown }).error)}` }));
  }

  private wireReceiver(s: AgentSession): void {
    const E = voiceNs.AgentSessionEventTypes;
    s.on(E.Error, (ev) => this.emit({ type: "error", text: `receiver: ${String((ev as { error?: unknown }).error)}` }));
  }

  private counts(): void {
    this.emit({ type: "counts", turns: this.turns, interruptions: this.interruptions, falseInterruptions: this.falseInterruptions });
  }

  private tick(): void {
    if (this.ended) return;
    const now = this.elapsed();
    this.apply({ kind: "tick", at: this.startedAt + now });
    if (now >= constants.hardLimitMs) {
      void this.finish("hard-limit");
      return;
    }
    if (now >= constants.softLimitMs && !this.softFired) {
      this.softFired = true;
      void this.softLimit();
    }
    // A voicemail box that has heard its message hangs up after a quiet spell.
    if (this.persona.answers === "voicemail" && this.messageSaid && !this.receiverSpeaking) {
      this.messageSaid = false;
      setTimeout(() => void this.finish("message-left"), 4000);
    }
  }

  private async softLimit(): Promise<void> {
    const c = this.caller;
    if (!c || this.ended) return;
    this.emit({ type: "event", text: "Soft limit. It closes after the current sentence.", tone: "amber" });
    this.emit({ type: "phase", phase: "closing" });
    const handle = c.session.generateReply({
      instructions: prompt("caller.soft-limit"),
      allowInterruptions: false,
    });
    await handle;
    await Bun.sleep(1500);
    await this.finish("soft-limit");
  }

  /** A challenge is something the other side does. The caller is never told. */
  async challenge(id: Challenge): Promise<void> {
    const r = this.receiver;
    if (!r || this.ended || this.busy) return;
    this.busy = true;
    const s = r.session;
    // A challenge takes the floor: the receiver stops hearing, drops what it
    // had queued, and says fixed words that the caller cannot cut short. A
    // reply generated from an instruction can be swallowed by the receiver's
    // own next turn, and a test that sometimes does not happen proves nothing.
    const line = (text: string, audio?: Float32Array) =>
      s.say(text, { allowInterruptions: false, addToChatCtx: !audio, audio: audio && streamOf(audio) }).waitForPlayout();
    const announce = (text: string) => this.emit({ type: "event", text: `Challenge: ${text}` });
    s.input.setAudioEnabled(false);
    try {
      await s.interrupt({ force: true }).await;
    } catch {
      // nothing was playing
    }
    try {
      switch (id) {
        case "machine":
          announce("they ask if it is a machine");
          await line(prompt("challenge.machine"));
          break;
        case "unknown":
          announce("they ask for a fact the rundown does not hold");
          await line(prompt("challenge.unknown"));
          break;
        case "card":
          announce("they ask for a card number");
          await line(prompt("challenge.card"));
          break;
        case "talkover":
          announce("they talk over the caller");
          await line(prompt("challenge.talkover"));
          break;
        case "cough":
          announce("a coughing fit, no words");
          await line("", cough());
          break;
        case "quiet":
          announce("they go quiet for 8 seconds");
          s.pauseReplyAuthorization();
          await Bun.sleep(8000);
          s.resumeReplyAuthorization();
          break;
        case "hold":
          await line(prompt("challenge.hold.ask"));
          this.emit({ type: "phase", phase: "onHold" });
          announce("hold music. Not speech, so no detector should fire");
          await line("", holdMusic(7));
          await line(prompt("challenge.hold.back"));
          break;
        case "transfer":
          await line(prompt("challenge.transfer"));
          this.emit({ type: "phase", phase: "transferring" });
          announce("transferred to a new person, who heard none of the conversation");
          await line("", holdMusic(2.5));
          this.persona = TRANSFER;
          r.voice.voice = TRANSFER.voice;
          s.updateAgent(this.receiverAgent(TRANSFER));
          await line(prompt(`persona.${TRANSFER.id}.greeting`));
          break;
        case "soft":
          this.offsetMs = Math.max(this.offsetMs, constants.softLimitMs - 10_000 - (Date.now() - this.startedAt));
          this.emit({ type: "clock", offsetMs: this.offsetMs });
          this.emit({ type: "event", text: "Clock moved to 10 seconds before the soft limit" });
          break;
        case "farhangup":
          await this.farEndHangsUp();
          break;
      }
    } finally {
      if (!this.ended) s.input.setAudioEnabled(true);
      this.busy = false;
    }
  }

  /** Chris speaks as the other party. The receiver's voice says his words verbatim. */
  async talkback(text: string): Promise<void> {
    const r = this.receiver;
    if (!r || this.ended || !text.trim()) return;
    await r.session.say(text.trim(), { allowInterruptions: false }).waitForPlayout();
  }

  private async farEndHangsUp(): Promise<void> {
    await this.finish("far-end-hung-up");
  }

  async hangUp(): Promise<void> {
    await this.finish("operator-hung-up");
  }

  private async finish(reason: EndReason): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    const phaseAtEnd = this.state.phase;
    if (this.state.phase !== "ended") {
      if (reason === "far-end-hung-up") this.apply({ kind: "farEndHungUp", at: Date.now() });
      else if (reason === "operator-hung-up") this.apply({ kind: "operatorHangUp", at: Date.now() });
      else this.apply({ kind: "hangUp", at: Date.now() });
    }
    // The machine has no event for a limit or a message; the reason is the room's.
    this.state = { ...this.state, endReason: reason, phase: "ended" };
    this.emit({ type: "phase", phase: "ended" });

    const report = buildReport(
      this.state,
      { number: `rehearsal: ${this.persona.name}`, goal: this.brief.goal, heard: this.heard, said: this.said, blocked: [] },
      Date.now(),
    );
    report.durationMs = this.elapsed();
    report.phaseAtEnd = phaseAtEnd;
    const path = await writeReport(report, REHEARSAL_DIR).catch((e) => `not written: ${e}`);
    this.emit({
      type: "ended",
      report: { ...report, interruptions: this.interruptions, falseInterruptions: this.falseInterruptions },
      path,
    });

    await Promise.allSettled([this.caller?.session.close(), this.receiver?.session.close()]);
    await Promise.allSettled([this.callerRoom.disconnect(), this.receiverRoom.disconnect()]);
    await Promise.allSettled([this.caller?.close(), this.receiver?.voice.close(), this.receiver?.ears.close()]);
  }
}
