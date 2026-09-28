/**
 * The Effects seam: what the reducer decides actually happens.
 *
 * `bridge.ts` kept `step(…).state` and dropped `.actions`, so the limits of
 * Section 11 were decided in the reducer and again, imperatively, in the job.
 * Only the job's copy acted, and nothing tested it. These cases cross the seam
 * the two now share, with no framework session and no call.
 */
import { describe, expect, test } from "bun:test";
import type { AgentSession } from "@livekit/agents";
import { SessionBridge } from "../src/call/bridge.ts";
import { type FrameworkEnds, framework, recorded } from "../src/call/effects.ts";
import { type Action, type Constants, type EndReason, type Event, type Phase, constants } from "../src/call/state.ts";

const k: Constants = { ...constants, softLimitMs: 10_000, hardLimitMs: 20_000, deadAirMs: 5_000 };

const answered: Event[] = [
  { kind: "dial", at: 0 },
  { kind: "answered", at: 1_000, by: "person" },
];

describe("the bridge performs what the reducer decided", () => {
  test("a tick past the hard limit reaches the effects (11.3)", () => {
    const done: Action[] = [];
    const bridge = new SessionBridge({}, recorded(done), k);
    for (const event of [...answered, { kind: "transcript", at: 19_000, words: 3 } as Event]) bridge.apply(event);
    bridge.apply({ kind: "tick", at: 20_100 });
    expect(done.map((a) => a.kind)).toContain("endCall");
    expect(done).toContainEqual({ kind: "endCall", reason: "hard-limit" });
  });

  test("dead air reaches the effects, which is what 16.4.1 asked for", () => {
    const done: Action[] = [];
    const bridge = new SessionBridge({}, recorded(done), k);
    for (const event of answered) bridge.apply(event);
    bridge.apply({ kind: "tick", at: 6_500 });
    expect(done).toContainEqual({ kind: "endCall", reason: "dead-air" });
    expect(done).toContainEqual({ kind: "writeReport", reason: "dead-air" });
  });

  test("nothing is performed after the call has ended", () => {
    const done: Action[] = [];
    const bridge = new SessionBridge({}, recorded(done), k);
    for (const event of answered) bridge.apply(event);
    bridge.apply({ kind: "tick", at: 6_500 });
    const after = done.length;
    bridge.apply({ kind: "tick", at: 7_000 });
    bridge.apply({ kind: "transcript", at: 7_100, words: 2 });
    expect(done.length).toBe(after);
  });

  test("the default is inert, so a caller that has not moved across still works", () => {
    const bridge = new SessionBridge({}, undefined, k);
    for (const event of answered) bridge.apply(event);
    expect(() => bridge.apply({ kind: "tick", at: 6_500 })).not.toThrow();
    expect(bridge.state.endReason).toBe("dead-air");
  });
});

/** A session that records the two calls the live adapter is allowed to make. */
function fakeSession() {
  const calls: string[] = [];
  let playout = () => {};
  const session = {
    generateReply(options: { instructions: string; allowInterruptions?: boolean }) {
      calls.push(`generateReply allowInterruptions=${options.allowInterruptions} ${options.instructions}`);
      return {
        waitForPlayout: () =>
          new Promise<void>((resolve) => {
            playout = resolve;
          }),
      };
    },
    interrupt(options?: { force?: boolean }) {
      calls.push(`interrupt force=${options?.force}`);
      return { await: Promise.resolve() };
    },
  };
  return { calls, session: session as unknown as AgentSession, finishPlayout: () => playout() };
}

function ends(session: AgentSession) {
  const ended: EndReason[] = [];
  const notes: string[] = [];
  const phases: Phase[] = [];
  const it: FrameworkEnds = {
    session,
    closingLine: "Say a closing line.",
    end: (reason) => void ended.push(reason),
    note: (text) => void notes.push(text),
    phase: (phase) => void phases.push(phase),
  };
  return { it, ended, notes, phases };
}

describe("the live adapter", () => {
  test("beginClose speaks one uninterruptible line and ends on its playout (11.2)", async () => {
    const f = fakeSession();
    const e = ends(f.session);
    framework(e.it).perform({ kind: "beginClose" });

    expect(f.calls[0]).toContain("allowInterruptions=false");
    expect(f.calls[0]).toContain("Say a closing line.");
    expect(e.phases).toEqual(["closing"]);
    // The limit waits for the sentence and never cuts it: nothing has ended yet.
    expect(e.ended).toEqual([]);

    f.finishPlayout();
    await Promise.resolve();
    await Promise.resolve();
    expect(e.ended).toEqual(["soft-limit"]);
  });

  test("stopPlayback forces the cut, because the close is uninterruptible (11.3)", () => {
    const f = fakeSession();
    framework(ends(f.session).it).perform({ kind: "stopPlayback" });
    expect(f.calls).toEqual(["interrupt force=true"]);
  });

  test("endCall ends with the reason it was given", () => {
    const f = fakeSession();
    const e = ends(f.session);
    framework(e.it).perform({ kind: "endCall", reason: "dead-air" });
    expect(e.ended).toEqual(["dead-air"]);
    expect(f.calls).toEqual([]);
  });

  test("the speaking actions are not wired, because 13.6 gives that path to the framework", () => {
    const f = fakeSession();
    const e = ends(f.session);
    const effects = framework(e.it);
    for (const action of [
      { kind: "speak", text: "hello" },
      { kind: "resumePlayback", text: "hello" },
      { kind: "sendToBrain", reason: "turn" },
      { kind: "cancelBrain" },
      { kind: "writeReport", reason: "goal-closed" },
    ] satisfies Action[]) {
      effects.perform(action);
    }
    expect(f.calls).toEqual([]);
    expect(e.ended).toEqual([]);
  });
});
