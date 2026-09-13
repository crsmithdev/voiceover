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
