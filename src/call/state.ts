/**
 * The conversation state machine (spec Section 6).
 *
 * A pure reducer over events with the time carried on each event, so the layer
 * one test drives it with simulated timing and no audio (spec 12.3). No I/O
 * lives here: the reducer returns actions and the caller performs them.
 */

export type Phase =
  | "dialing"
  | "ringing"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "onHold"
  | "leavingMessage"
  | "workingMenu"
  | "transferring"
  | "closing"
  | "ended";

export type AnsweredBy = "person" | "voicemail" | "ivr" | "dead";

export type EndReason =
  | "goal-closed"
  | "soft-limit"
  | "hard-limit"
  | "message-left"
  | "far-end-hung-up"
  | "dead-line";

export type Event =
  | { kind: "dial"; at: number }
  | { kind: "answered"; at: number; by: AnsweredBy }
  | { kind: "farEndSpeechStart"; at: number }
  | { kind: "farEndSpeechEnd"; at: number }
  | { kind: "transcript"; at: number; words: number; disclosureQuestion?: boolean }
  | { kind: "endOfTurn"; at: number }
  | { kind: "sentenceReady"; at: number; text: string }
  | { kind: "playbackFinished"; at: number }
  | { kind: "beep"; at: number }
  | { kind: "holdMusicStart"; at: number }
  | { kind: "holdMusicEnd"; at: number }
  | { kind: "transferDetected"; at: number }
  | { kind: "transferComplete"; at: number }
  | { kind: "menuCleared"; at: number }
  | { kind: "farEndHungUp"; at: number }
  | { kind: "tick"; at: number };

export type SendReason = "turn" | "superseded" | "disclosure" | "voicemail-beep" | "restart-from-brief";

export type Action =
  | { kind: "speak"; text: string }
  | { kind: "stopPlayback" }
  | { kind: "resumePlayback"; text: string }
  | { kind: "sendToBrain"; reason: SendReason }
  | { kind: "cancelBrain" }
  | { kind: "beginClose" }
  | { kind: "endCall"; reason: EndReason }
  /** 11.4 the report is written from local state, never through the brain. */
  | { kind: "writeReport"; reason: EndReason };

/**
 * Spec Section 17. Every value is a constant, not a setting. The four marked
 * provisional must be replaced with the framework's own defaults, and written
 * down when they are read (17.2).
 */
export interface Constants {
  /** 7.2.2 provisional */
  minInterruptionMs: number;
  /** 7.2.3 provisional */
  minInterruptionWords: number;
  /** 7.2.4 provisional */
  falseInterruptionMs: number;
  /** 11.2 */
  softLimitMs: number;
  /** 11.3 */
  hardLimitMs: number;
}

export const constants: Constants = {
  minInterruptionMs: 500,
  minInterruptionWords: 1,
  falseInterruptionMs: 2000,
  softLimitMs: 8 * 60_000,
  hardLimitMs: 12 * 60_000,
};

export interface CallState {
  phase: Phase;
  startedAt: number | null;
  /** Set while the far end is speaking and the interruption has not counted yet. */
  farEndSpeechStartedAt: number | null;
  interruptedAt: number | null;
  interruptionWords: number;
  /** The sentence the agent is speaking. Kept so a false interruption can resume it. */
  sentenceInFlight: string | null;
  /** Sentences the far end has already heard. Audio cannot be recalled (6.3). */
  delivered: string[];
  /** 10.4 a disclosure question is owed until the caller answers it. */
  owedDisclosure: boolean;
  /** Why the brain was last asked, and why the sentence now in flight exists. */
  pendingSendReason: SendReason | null;
  sentenceReason: SendReason | null;
  /** 11.2 the soft limit fired and the close waits for the sentence to finish. */
  pendingClose: boolean;
  /** 6.3 hold music must not satisfy any detector. */
  holdMusic: boolean;
  /** 6.3 a voicemail greeting is a monologue: turn-taking is off until the beep. */
  turnTakingOff: boolean;
  endReason: EndReason | null;
  trace: string[];
}

export function initial(): CallState {
  return {
    phase: "dialing",
    startedAt: null,
    farEndSpeechStartedAt: null,
    interruptedAt: null,
    interruptionWords: 0,
    sentenceInFlight: null,
    delivered: [],
    owedDisclosure: false,
    pendingSendReason: null,
    sentenceReason: null,
    pendingClose: false,
    holdMusic: false,
    turnTakingOff: false,
    endReason: null,
    trace: [],
  };
}

export interface StepResult {
  state: CallState;
  actions: Action[];
}

export function step(prev: CallState, event: Event, k: Constants = constants): StepResult {
  const state: CallState = { ...prev, delivered: [...prev.delivered], trace: [...prev.trace] };
  const actions: Action[] = [];
  const to = (phase: Phase) => {
    state.phase = phase;
  };

  if (prev.phase === "ended") {
    state.trace.push(`${event.at} ${event.kind} ignored: call ended`);
    return { state, actions };
  }

  switch (event.kind) {
    case "dial":
      state.startedAt = event.at;
      to("ringing");
      break;

    case "answered":
      if (event.by === "dead") {
        state.endReason = "dead-line";
        actions.push({ kind: "endCall", reason: "dead-line" }, { kind: "writeReport", reason: "dead-line" });
        to("ended");
        break;
      }
      if (event.by === "voicemail") {
        state.turnTakingOff = true;
        to("leavingMessage");
        break;
      }
      if (event.by === "ivr") {
        to("workingMenu");
        break;
      }
      to("thinking");
      actions.push({ kind: "sendToBrain", reason: "turn" });
      break;

    case "menuCleared":
      to("listening");
      break;

    case "beep":
      // The greeting is over. One monologue, then the call ends (6.3).
      actions.push({ kind: "sendToBrain", reason: "voicemail-beep" });
      break;

    case "holdMusicStart":
      state.holdMusic = true;
      state.farEndSpeechStartedAt = null;
      to("onHold");
      break;

    case "holdMusicEnd":
      state.holdMusic = false;
      if (prev.phase === "onHold") to("listening");
      break;

    case "farEndSpeechStart":
      // Hold music and a voicemail greeting reach no detector (6.3).
      if (state.holdMusic || state.turnTakingOff) {
        state.trace.push(`${event.at} farEndSpeechStart suppressed`);
        break;
      }
      state.farEndSpeechStartedAt = event.at;
      break;

    case "farEndSpeechEnd":
      // Too short to count as an interruption, so the agent keeps speaking (7.2.2).
      state.farEndSpeechStartedAt = null;
      break;

    case "transcript":
      if (event.disclosureQuestion) state.owedDisclosure = true;
      if (prev.phase === "interrupted") {
        state.interruptionWords = prev.interruptionWords + event.words;
        if (state.interruptionWords >= k.minInterruptionWords) {
          // A real interruption. The rest of the sentence is lost (7.2.3).
          state.sentenceInFlight = null;
          state.interruptedAt = null;
          state.interruptionWords = 0;
          to("listening");
        }
      }
      break;

    case "endOfTurn":
      if (state.turnTakingOff || state.holdMusic) break;
      if (prev.phase === "thinking") {
        // The far end spoke over a turn that had produced no text yet (6.3).
        actions.push({ kind: "cancelBrain" }, { kind: "sendToBrain", reason: "superseded" });
        break;
      }
      if (prev.phase !== "listening") break;
      if (state.pendingClose) {
        actions.push({ kind: "beginClose" });
        to("closing");
        break;
      }
      to("thinking");
      actions.push({ kind: "sendToBrain", reason: state.owedDisclosure ? "disclosure" : "turn" });
      break;

    case "sentenceReady":
      state.sentenceInFlight = event.text;
      state.sentenceReason = prev.pendingSendReason;
      state.pendingSendReason = null;
      actions.push({ kind: "speak", text: event.text });
      to("speaking");
      break;

    case "playbackFinished":
      if (prev.sentenceInFlight) state.delivered.push(prev.sentenceInFlight);
      state.sentenceInFlight = null;
      // Only the answer clears the debt, not any sentence that happens to end.
      if (prev.sentenceReason === "disclosure") state.owedDisclosure = false;
      state.sentenceReason = null;
      if (prev.phase === "leavingMessage" || prev.sentenceReason === "voicemail-beep") {
        state.endReason = "message-left";
        actions.push({ kind: "endCall", reason: "message-left" }, { kind: "writeReport", reason: "message-left" });
        to("ended");
        break;
      }
      if (state.pendingClose) {
        // 11.2 the soft limit waited for the sentence rather than cutting it.
        actions.push({ kind: "beginClose" });
        to("closing");
        break;
      }
      if (prev.phase === "closing") {
        state.endReason = "goal-closed";
        actions.push({ kind: "endCall", reason: "goal-closed" }, { kind: "writeReport", reason: "goal-closed" });
        to("ended");
        break;
      }
      to("listening");
      break;

    case "transferDetected":
      if (prev.phase === "speaking") actions.push({ kind: "stopPlayback" });
      state.sentenceInFlight = null;
      state.farEndSpeechStartedAt = null;
      to("transferring");
      break;

    case "transferComplete":
      // A new person, with none of the conversation (15.7).
      state.delivered = [];
      to("thinking");
      actions.push({ kind: "sendToBrain", reason: "restart-from-brief" });
      break;

    case "farEndHungUp":
      state.endReason = "far-end-hung-up";
      if (prev.phase === "speaking") actions.push({ kind: "stopPlayback" });
      actions.push(
        { kind: "endCall", reason: "far-end-hung-up" },
        { kind: "writeReport", reason: "far-end-hung-up" },
      );
      to("ended");
      break;

    case "tick": {
      const elapsed = state.startedAt === null ? 0 : event.at - state.startedAt;

      if (elapsed >= k.hardLimitMs) {
        state.endReason = "hard-limit";
        if (prev.phase === "speaking") actions.push({ kind: "stopPlayback" });
        actions.push({ kind: "endCall", reason: "hard-limit" }, { kind: "writeReport", reason: "hard-limit" });
        to("ended");
        break;
      }

      if (elapsed >= k.softLimitMs && !state.pendingClose) {
        state.pendingClose = true;
        if (prev.phase === "listening" || prev.phase === "thinking") {
          actions.push({ kind: "beginClose" });
          to("closing");
        }
      }

      if (prev.phase === "speaking" && state.farEndSpeechStartedAt !== null) {
        if (event.at - state.farEndSpeechStartedAt >= k.minInterruptionMs) {
          // 7.3 the playback stops on the length alone, before any words arrive.
          actions.push({ kind: "stopPlayback" });
          state.interruptedAt = event.at;
          state.interruptionWords = 0;
          state.farEndSpeechStartedAt = null;
          to("interrupted");
        }
        break;
      }

      if (prev.phase === "interrupted" && state.interruptedAt !== null) {
        if (event.at - state.interruptedAt >= k.falseInterruptionMs) {
          // 7.2.4 no words arrived, so the interruption was false (7.2.5).
          const text = state.sentenceInFlight;
          state.interruptedAt = null;
          state.interruptionWords = 0;
          if (text) actions.push({ kind: "resumePlayback", text });
          to("speaking");
        }
      }
      break;
    }
  }

  const sent = actions.find((a) => a.kind === "sendToBrain");
  if (sent && sent.kind === "sendToBrain") state.pendingSendReason = sent.reason;

  state.trace.push(
    `${event.at} ${event.kind} ${prev.phase}->${state.phase}` +
      (actions.length ? ` [${actions.map((a) => a.kind).join(",")}]` : ""),
  );
  return { state, actions };
}

/** Threads a list of events through the reducer. Used by the layer one test. */
export function run(events: Event[], k: Constants = constants) {
  let state = initial();
  const actions: Action[] = [];
  for (const event of events) {
    const result = step(state, event, k);
    state = result.state;
    actions.push(...result.actions);
  }
  return { state, actions };
}
