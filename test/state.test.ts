/**
 * The layer one test (spec 12.3): the conversation logic in text, below the
 * audio, with simulated timing. One case per row of the table in 6.3, plus the
 * interruption order of 7.2 and the limits of Section 11.
 */
import { describe, expect, test } from "bun:test";
import {
  type Action,
  type Constants,
  type Event,
  constants,
  initial,
  run,
  step,
} from "../src/call/state.ts";

/** Short limits keep a test readable; the real values are in Section 17. */
const k: Constants = {
  ...constants,
  minInterruptionMs: 500,
  minInterruptionWords: 1,
  falseInterruptionMs: 2000,
  softLimitMs: 10_000,
  hardLimitMs: 20_000,
  // Past the hard limit on purpose, so a case about the limits is never also a
  // case about the watchdog. The watchdog's own cases set their own value.
  deadAirMs: 60_000,
};

const kinds = (actions: Action[]) => actions.map((a) => a.kind);

/** Answered by a person, one reply spoken, back to listening. */
const answered: Event[] = [
  { kind: "dial", at: 0 },
  { kind: "answered", at: 1_000, by: "person" },
  { kind: "sentenceReady", at: 1_500, text: "Hello, I'm calling for Chris." },
  { kind: "playbackFinished", at: 3_000 },
];

describe("the ordinary loop", () => {
  test("a person answers and the brain is asked once", () => {
    const { state, actions } = run(answered, k);
    expect(state.phase).toBe("listening");
    expect(kinds(actions)).toEqual(["sendToBrain", "speak"]);
    expect(state.delivered).toEqual(["Hello, I'm calling for Chris."]);
  });

  test("the end of a turn asks the brain again", () => {
    const { state, actions } = run([...answered, { kind: "endOfTurn", at: 5_000 }], k);
    expect(state.phase).toBe("thinking");
    expect(actions.at(-1)).toEqual({ kind: "sendToBrain", reason: "turn" });
  });

  test("a dead line ends the call and still writes a report", () => {
    const { state, actions } = run([{ kind: "dial", at: 0 }, { kind: "answered", at: 900, by: "dead" }], k);
    expect(state.phase).toBe("ended");
    expect(kinds(actions)).toEqual(["endCall", "writeReport"]);
  });

  test("the caller ending the call is not blamed on the far end", () => {
    const { state, actions } = run([...answered, { kind: "hangUp", at: 6_000 }], k);
    expect(state.endReason).toBe("caller-hung-up");
    expect(kinds(actions).slice(-2)).toEqual(["endCall", "writeReport"]);
  });

  test("Chris hanging up mid-sentence stops playback and ends the call", () => {
    const { state, actions } = run(
      [...answered, { kind: "sentenceReady", at: 5_000, text: "He would like a cleaning." }, { kind: "operatorHangUp", at: 5_500 }],
      k,
    );
    expect(state.endReason).toBe("operator-hung-up");
    expect(kinds(actions).slice(-3)).toEqual(["stopPlayback", "endCall", "writeReport"]);
  });

  test("a clock that changes nothing writes no trace line", () => {
    const ticks: Event[] = Array.from({ length: 40 }, (_, i) => ({ kind: "tick", at: 4_000 + i * 100 }));
    const quiet = run([...answered, ...ticks], k);
    const noisy = run(answered, k);
    expect(quiet.state.trace).toEqual(noisy.state.trace);
    expect(quiet.state.trace.length).toBeLessThan(8);
  });

  test("a clock that does something still writes one", () => {
    const { state } = run([...answered, { kind: "tick", at: 11_000 }], k);
    expect(state.trace.at(-1)).toContain("tick");
    expect(state.trace.at(-1)).toContain("beginClose");
  });

  test("nothing happens after the call ends", () => {
    const ended = run([{ kind: "dial", at: 0 }, { kind: "answered", at: 900, by: "dead" }], k).state;
    const { state, actions } = step(ended, { kind: "endOfTurn", at: 2_000 }, k);
    expect(state.phase).toBe("ended");
    expect(actions).toEqual([]);
    expect(state.trace.at(-1)).toContain("ignored: call ended");
  });
});

describe("interruption, in the order of 7.2", () => {
  const speaking: Event[] = [
    { kind: "dial", at: 0 },
    { kind: "answered", at: 1_000, by: "person" },
    { kind: "sentenceReady", at: 1_500, text: "He would like a cleaning, ideally a weekday morning." },
  ];

  test("speech shorter than the minimum does not interrupt", () => {
    const { state, actions } = run(
      [
        ...speaking,
        { kind: "farEndSpeechStart", at: 2_000 },
        { kind: "tick", at: 2_300 },
        { kind: "farEndSpeechEnd", at: 2_400 },
        { kind: "tick", at: 3_000 },
      ],
      k,
    );
    expect(state.phase).toBe("speaking");
    expect(kinds(actions)).not.toContain("stopPlayback");
  });

  test("the playback stops on the length alone, before any words (7.3)", () => {
    const { state, actions } = run(
      [...speaking, { kind: "farEndSpeechStart", at: 2_000 }, { kind: "tick", at: 2_500 }],
      k,
    );
    expect(state.phase).toBe("interrupted");
    expect(actions.at(-1)).toEqual({ kind: "stopPlayback" });
  });

  test("words confirm the interruption and the rest of the sentence is lost", () => {
    const { state } = run(
      [
        ...speaking,
        { kind: "farEndSpeechStart", at: 2_000 },
        { kind: "tick", at: 2_500 },
        { kind: "transcript", at: 2_600, words: 4 },
      ],
      k,
    );
    expect(state.phase).toBe("listening");
    expect(state.sentenceInFlight).toBeNull();
    expect(state.delivered).toEqual([]);
  });

  test("no words means a false interruption and the sentence resumes (7.2.5)", () => {
    const { state, actions } = run(
      [
        ...speaking,
        { kind: "farEndSpeechStart", at: 2_000 },
        { kind: "tick", at: 2_500 },
        { kind: "tick", at: 4_500 },
      ],
      k,
    );
    expect(state.phase).toBe("speaking");
    expect(actions.at(-1)).toEqual({
      kind: "resumePlayback",
      text: "He would like a cleaning, ideally a weekday morning.",
    });
  });

  test("both sides starting together yields to the far end", () => {
    const { state } = run(
      [...speaking, { kind: "farEndSpeechStart", at: 1_500 }, { kind: "tick", at: 2_000 }],
      k,
    );
    expect(state.phase).toBe("interrupted");
  });
});

describe("the rows of 6.3", () => {
  test("speech over a turn with no text yet supersedes the brain", () => {
    const { state, actions } = run(
      [
        { kind: "dial", at: 0 },
        { kind: "answered", at: 1_000, by: "person" },
        { kind: "farEndSpeechStart", at: 1_200 },
        { kind: "endOfTurn", at: 2_000 },
      ],
      k,
    );
    expect(state.phase).toBe("thinking");
    expect(kinds(actions).slice(-2)).toEqual(["cancelBrain", "sendToBrain"]);
  });

  test("a delivered sentence cannot be recalled", () => {
    const { state } = run(answered, k);
    expect(state.delivered).toHaveLength(1);
  });

  test("the soft limit never cuts a sentence", () => {
    const mid: Event[] = [
      { kind: "dial", at: 0 },
      { kind: "answered", at: 1_000, by: "person" },
      { kind: "sentenceReady", at: 1_500, text: "Let me check that." },
      { kind: "tick", at: 11_000 },
    ];
    const first = run(mid, k);
    expect(first.state.phase).toBe("speaking");
    expect(first.state.pendingClose).toBe(true);
    expect(kinds(first.actions)).not.toContain("stopPlayback");

    const { state, actions } = run([...mid, { kind: "playbackFinished", at: 12_000 }], k);
    expect(state.phase).toBe("closing");
    expect(actions.at(-1)).toEqual({ kind: "beginClose" });
  });

  test("the closing sentence ends the call, and does not restart the close", () => {
    const { state, actions } = run(
      [
        ...answered,
        { kind: "tick", at: 11_000 },
        { kind: "sentenceReady", at: 11_400, text: "Thanks very much, goodbye." },
        { kind: "playbackFinished", at: 13_000 },
      ],
      k,
    );
    expect(state.phase).toBe("ended");
    expect(state.endReason).toBe("goal-closed");
    expect(kinds(actions).filter((a) => a === "beginClose")).toHaveLength(1);
    expect(kinds(actions).slice(-2)).toEqual(["endCall", "writeReport"]);
  });

  test("the soft limit closes at once when nobody is speaking", () => {
    const { state, actions } = run([...answered, { kind: "tick", at: 11_000 }], k);
    expect(state.phase).toBe("closing");
    expect(actions.at(-1)).toEqual({ kind: "beginClose" });
  });

  test("the hard limit cuts the call and writes the report from local state", () => {
    const { state, actions } = run(
      [
        { kind: "dial", at: 0 },
        { kind: "answered", at: 1_000, by: "person" },
        { kind: "sentenceReady", at: 1_500, text: "One moment." },
        { kind: "tick", at: 21_000 },
      ],
      k,
    );
    expect(state.phase).toBe("ended");
    expect(state.endReason).toBe("hard-limit");
    expect(kinds(actions).slice(-3)).toEqual(["stopPlayback", "endCall", "writeReport"]);
    // 11.4 the report must not need the brain.
    const after = kinds(actions).slice(kinds(actions).indexOf("stopPlayback"));
    expect(after).not.toContain("sendToBrain");
  });

  test("a transfer mid-sentence stops the agent and restarts from the brief", () => {
    const { state, actions } = run(
      [
        { kind: "dial", at: 0 },
        { kind: "answered", at: 1_000, by: "person" },
        { kind: "sentenceReady", at: 1_500, text: "Could you check the Tuesday slot?" },
        { kind: "transferDetected", at: 2_000 },
        { kind: "transferComplete", at: 9_000 },
      ],
      k,
    );
    expect(state.phase).toBe("thinking");
    expect(state.delivered).toEqual([]);
    expect(kinds(actions).slice(-2)).toEqual(["stopPlayback", "sendToBrain"]);
    expect(actions.at(-1)).toEqual({ kind: "sendToBrain", reason: "restart-from-brief" });
  });

  test("hold music satisfies no detector", () => {
    const { state, actions } = run(
      [
        { kind: "dial", at: 0 },
        { kind: "answered", at: 1_000, by: "person" },
        { kind: "holdMusicStart", at: 2_000 },
        { kind: "farEndSpeechStart", at: 2_100 },
        { kind: "tick", at: 4_000 },
        { kind: "endOfTurn", at: 4_100 },
      ],
      k,
    );
    expect(state.phase).toBe("onHold");
    expect(state.farEndSpeechStartedAt).toBeNull();
    expect(kinds(actions)).toEqual(["sendToBrain"]);
    expect(state.trace.some((line) => line.includes("suppressed"))).toBe(true);
  });

  test("a voicemail greeting is a monologue until the beep", () => {
    const { state, actions } = run(
      [
        { kind: "dial", at: 0 },
        { kind: "answered", at: 1_000, by: "voicemail" },
        { kind: "farEndSpeechStart", at: 1_100 },
        { kind: "endOfTurn", at: 4_000 },
        { kind: "beep", at: 5_000 },
        { kind: "sentenceReady", at: 5_600, text: "This is a message for the scheduling desk." },
        { kind: "playbackFinished", at: 9_000 },
      ],
      k,
    );
    expect(state.phase).toBe("ended");
    expect(state.endReason).toBe("message-left");
    expect(kinds(actions)).toEqual(["sendToBrain", "speak", "endCall", "writeReport"]);
  });
});

describe("10.4 the disclosure question", () => {
  test("the debt survives a word test that drops the question", () => {
    const events: Event[] = [
      { kind: "dial", at: 0 },
      { kind: "answered", at: 1_000, by: "person" },
      { kind: "sentenceReady", at: 1_500, text: "He is an existing patient." },
      { kind: "farEndSpeechStart", at: 2_000 },
      { kind: "tick", at: 2_500 },
      // The question arrived but produced too few words to count (7.2.3).
      { kind: "transcript", at: 2_600, words: 0, disclosureQuestion: true },
      { kind: "tick", at: 4_500 },
    ];
    const resumed = run(events, k);
    expect(resumed.state.phase).toBe("speaking");
    expect(resumed.state.owedDisclosure).toBe(true);

    // The goal sentence finishing does not clear the debt.
    const next = run([...events, { kind: "playbackFinished", at: 6_000 }, { kind: "endOfTurn", at: 7_000 }], k);
    expect(next.state.owedDisclosure).toBe(true);
    expect(next.actions.at(-1)).toEqual({ kind: "sendToBrain", reason: "disclosure" });
  });

  test("only the answer clears the debt", () => {
    const upTo: Event[] = [
      { kind: "dial", at: 0 },
      { kind: "answered", at: 1_000, by: "person" },
      { kind: "sentenceReady", at: 1_200, text: "He is an existing patient." },
      { kind: "transcript", at: 1_800, words: 5, disclosureQuestion: true },
      { kind: "playbackFinished", at: 2_500 },
      { kind: "endOfTurn", at: 3_000 },
      { kind: "sentenceReady", at: 3_400, text: "Yes, I'm an assistant calling on his behalf." },
      { kind: "playbackFinished", at: 6_000 },
    ];
    const { state } = run(upTo, k);
    expect(state.owedDisclosure).toBe(false);
    expect(state.phase).toBe("listening");
  });
});

/**
 * 16.4.1 the dead-air watchdog. A sleeping host, a dead speech worker and a hung
 * brain all look the same from in here: nothing at all. The carrier's own cap is
 * a backstop, and twelve minutes of silence on a stranger's telephone is a
 * failure, so the call ends from this side with a report.
 */
describe("the dead-air watchdog", () => {
  /** Short enough to fire inside a readable case, well under the soft limit. */
  const w: Constants = { ...k, deadAirMs: 5_000 };

  test("silence past deadAirMs ends the call and still writes a report", () => {
    const { state, actions } = run([...answered, { kind: "tick", at: 8_100 }], w);
    expect(state.phase).toBe("ended");
    expect(state.endReason).toBe("dead-air");
    expect(kinds(actions)).toContain("endCall");
    expect(kinds(actions)).toContain("writeReport");
  });

  test("a tick is not a signal, so ticking cannot keep a dead call alive", () => {
    const ticks: Event[] = [];
    for (let at = 3_100; at <= 8_100; at += 250) ticks.push({ kind: "tick", at });
    const { state } = run([...answered, ...ticks], w);
    expect(state.endReason).toBe("dead-air");
  });

  test("anything heard or said resets it", () => {
    const { state } = run(
      [
        ...answered,
        { kind: "tick", at: 6_000 },
        { kind: "transcript", at: 7_000, words: 4 },
        { kind: "tick", at: 11_000 },
      ],
      w,
    );
    expect(state.phase).not.toBe("ended");
    expect(state.endReason).toBeNull();
  });

  test("it does not fire while the line is still ringing", () => {
    const { state } = run([{ kind: "dial", at: 0 }, { kind: "tick", at: 9_000 }], w);
    expect(state.phase).toBe("ringing");
    expect(state.endReason).toBeNull();
  });

  test("the hard limit is the reason when both are due, because 11.3 is the harder promise", () => {
    const late: Constants = { ...w, deadAirMs: 1_000, hardLimitMs: 4_000 };
    const { state } = run([...answered, { kind: "tick", at: 9_000 }], late);
    expect(state.endReason).toBe("hard-limit");
  });

  test("a sentence in flight is cut when the watchdog fires", () => {
    const speaking: Event[] = [
      { kind: "dial", at: 0 },
      { kind: "answered", at: 1_000, by: "person" },
      { kind: "sentenceReady", at: 1_500, text: "One moment." },
    ];
    const { state, actions } = run([...speaking, { kind: "tick", at: 7_000 }], w);
    expect(state.phase).toBe("ended");
    expect(kinds(actions)).toContain("stopPlayback");
  });
});

/**
 * 16.4.1 against the rehearsal's fictional clock. The `soft` challenge moves the
 * clock most of the way to the soft limit rather than waiting eight minutes, and
 * the whole jump would otherwise read as dead air and end the call first.
 */
describe("a moved clock is not silence", () => {
  const w: Constants = { ...k, deadAirMs: 5_000, softLimitMs: 30_000, hardLimitMs: 60_000 };

  test("without the jump event the watchdog wins, which is the regression", () => {
    const { state } = run([...answered, { kind: "tick", at: 29_000 }], w);
    expect(state.endReason).toBe("dead-air");
  });

  test("with it the call survives to the limit the rehearsal was reaching for", () => {
    const { state, actions } = run(
      [...answered, { kind: "clockJumped", at: 28_000 }, { kind: "tick", at: 28_250 }, { kind: "tick", at: 30_100 }],
      w,
    );
    expect(state.endReason).toBeNull();
    expect(kinds(actions)).toContain("beginClose");
  });
});
