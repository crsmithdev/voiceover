/**
 * The bridge from the framework's session to the state machine (spec 6, 11.4).
 *
 * The framework owns the turn, so the machine only hears about it afterwards:
 * a finished transcript is a transcript and an end of turn, and a spoken reply
 * is a sentence that played. Without this the disclosure debt of 10.4 is set
 * and never cleared, and every report warns that a question went unanswered.
 *
 * It also collects what the report needs: what was said and heard, the details
 * the caller deferred (9.8), the per-turn timings, and the interruptions.
 */
import { voice as voiceNs } from "@livekit/agents";
import type { AgentSession } from "@livekit/agents";
import { type CallContext, type Report, buildReport } from "./report.ts";
import { type CallState, type EndReason, type Event, type Phase, constants, initial, step } from "./state.ts";

export interface TurnTiming {
  /** End of speech to the turn being committed, the transcriber's time inside it. */
  pause: number;
  stt: number;
  /** The brain, to its first token. */
  brain: number;
  /** The voice, to its first audio. */
  voice: number;
  total: number;
}

export interface BridgeHooks {
  onPhase?(phase: Phase): void;
  onLine?(who: "caller" | "them", text: string, final: boolean, id: string): void;
  onEvent?(text: string, tone?: "amber" | "green" | "red"): void;
  onTiming?(timing: TurnTiming): void;
  onCounts?(counts: { turns: number; interruptions: number; falseInterruptions: number }): void;
}

const DISCLOSURE_QUESTION = /\b(a\s*)?(robot|machine|recording|ai|a\.?i\.?|artificial|real person|human)\b/i;

export class SessionBridge {
  state: CallState = initial();
  readonly heard: string[] = [];
  readonly said: string[] = [];
  readonly blocked: string[] = [];
  readonly timings: TurnTiming[] = [];
  turns = 0;
  interruptions = 0;
  falseInterruptions = 0;
  /** The phase the call was in before it ended, for the report. */
  private lastPhase: Phase = "dialing";
  /** True while the other party is speaking, by the voice detector. */
  farEndSpeaking = false;
  private lineId = 0;
  private partial: string | null = null;
  private metrics = { eou: 0, stt: 0, ttft: 0, ttfb: 0, fresh: false };
  private readonly deferredKeys = new Set<string>();

  constructor(private readonly hooks: BridgeHooks = {}) {}

  apply(event: Event): void {
    this.state = step(this.state, event, constants).state;
    if (this.state.phase !== "ended") this.lastPhase = this.state.phase;
  }

  /** 9.8: a detail the caller could not give, named by the caller itself. */
  noteDeferred(detail: string): void {
    const line = detail.trim();
    if (!line) return;
    // The caller names the same detail again on each turn it comes up, so the
    // first few words decide whether the report already holds it.
    const key = line.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 3).join(" ");
    if (this.deferredKeys.has(key)) return;
    this.deferredKeys.add(key);
    this.blocked.push(line);
    this.hooks.onEvent?.(`Deferred to Chris: ${line}`, "amber");
  }

  attach(session: AgentSession): void {
    const E = voiceNs.AgentSessionEventTypes;

    session.on(E.AgentStateChanged, (ev) => {
      if (ev.oldState === "speaking" && ev.newState !== "speaking" && this.farEndSpeaking) {
        this.interruptions++;
        this.hooks.onPhase?.("interrupted");
        this.hooks.onEvent?.("They spoke over it. Playback stopped.", "amber");
        this.counts();
        return;
      }
      if (ev.newState === "speaking" && this.metrics.fresh) {
        const m = this.metrics;
        const pause = Math.max(0, m.eou - m.stt) / 1000;
        const timing: TurnTiming = {
          pause,
          stt: m.stt / 1000,
          brain: m.ttft / 1000,
          voice: m.ttfb / 1000,
          total: pause + (m.stt + m.ttft + m.ttfb) / 1000,
        };
        this.timings.push(timing);
        this.hooks.onTiming?.(timing);
        m.fresh = false;
      }
      const phase: Partial<Record<string, Phase>> = { listening: "listening", thinking: "thinking", speaking: "speaking" };
      const next = phase[ev.newState];
      if (next) this.hooks.onPhase?.(next);
    });

    session.on(E.UserStateChanged, (ev) => {
      this.farEndSpeaking = ev.newState === "speaking";
    });

    session.on(E.UserInputTranscribed, (ev) => {
      this.partial ??= `them-${++this.lineId}`;
      this.hooks.onLine?.("them", ev.transcript, ev.isFinal, this.partial);
      if (ev.isFinal) this.partial = null;
    });

    session.on(E.ConversationItemAdded, (ev) => {
      const item = ev.item as { role?: string; textContent?: string };
      const text = item.textContent?.trim();
      if (!text) return;
      if (item.role === "user") {
        this.heard.push(text);
        // 10.4: the debt is set by the question, not by whether it was answered.
        const question = DISCLOSURE_QUESTION.test(text);
        this.apply({ kind: "transcript", at: Date.now(), words: text.split(/\s+/).length, disclosureQuestion: question });
        this.apply({ kind: "endOfTurn", at: Date.now() });
        if (question) this.hooks.onEvent?.("Asked whether it is a machine", "amber");
      } else if (item.role === "assistant") {
        this.said.push(text);
        this.turns++;
        this.apply({ kind: "sentenceReady", at: Date.now(), text });
        this.apply({ kind: "playbackFinished", at: Date.now() });
        this.hooks.onLine?.("caller", text, true, `caller-${++this.lineId}`);
        this.counts();
      }
    });

    session.on(E.MetricsCollected, (ev) => {
      const m = ev.metrics as {
        type: string;
        endOfUtteranceDelayMs?: number;
        transcriptionDelayMs?: number;
        ttftMs?: number;
        ttfbMs?: number;
      };
      if (m.type === "eou_metrics") {
        this.metrics.eou = m.endOfUtteranceDelayMs ?? 0;
        this.metrics.stt = m.transcriptionDelayMs ?? 0;
        this.metrics.fresh = true;
      } else if (m.type === "llm_metrics" && (m.ttftMs ?? -1) >= 0) {
        this.metrics.ttft = m.ttftMs as number;
      } else if (m.type === "tts_metrics" && (m.ttfbMs ?? -1) >= 0) {
        this.metrics.ttfb = m.ttfbMs as number;
      }
    });

    session.on(E.AgentFalseInterruption, (ev) => {
      this.interruptions++;
      this.falseInterruptions++;
      this.hooks.onEvent?.(
        ev.resumed
          ? "Sound on the line and no words. It resumed the sentence."
          : "Sound on the line and no words. It did not resume.",
        "amber",
      );
      this.counts();
    });

    session.on(E.Error, (ev) => {
      this.hooks.onEvent?.(`The session reported an error: ${String((ev as { error?: unknown }).error)}`, "red");
    });
  }

  private counts(): void {
    this.hooks.onCounts?.({
      turns: this.turns,
      interruptions: this.interruptions,
      falseInterruptions: this.falseInterruptions,
    });
  }

  middleReply(): number | null {
    if (!this.timings.length) return null;
    const sorted = this.timings.map((t) => t.total).sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) / 2)] as number;
  }

  /**
   * The report, from local state only (11.4). The reason is the caller's own,
   * because the machine has no event for a limit or a message left.
   */
  report(reason: EndReason, where: { number: string; goal: string }, endedAt = Date.now(), durationMs?: number): Report {
    const phaseAtEnd = this.lastPhase;
    if (this.state.phase !== "ended") {
      if (reason === "far-end-hung-up") this.apply({ kind: "farEndHungUp", at: endedAt });
      else if (reason === "operator-hung-up") this.apply({ kind: "operatorHangUp", at: endedAt });
      else this.apply({ kind: "hangUp", at: endedAt });
    }
    this.state = { ...this.state, endReason: reason, phase: "ended" };
    const context: CallContext = {
      number: where.number,
      goal: where.goal,
      heard: this.heard,
      said: this.said,
      blocked: this.blocked,
    };
    const report = buildReport(this.state, context, endedAt);
    report.phaseAtEnd = phaseAtEnd;
    if (durationMs !== undefined) report.durationMs = durationMs;
    return report;
  }
}
