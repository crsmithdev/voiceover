/**
 * Placing a call (spec 10.10, 16.5), with no trunk and no worker.
 *
 * The three scripts that dialled each re-decided the preflight and each carried
 * its own copy of the `createSipParticipant` arguments, one of them with a
 * different carrier cap. None of it was testable, because the decision lived in
 * an HTTP route beside the SDK call.
 */
import { describe, expect, test } from "bun:test";
import type { Deployment } from "../src/call/dispatch.ts";
import {
  type Carrier,
  type DialLimits,
  type DiallerDeps,
  type Placement,
  RING_SECONDS,
  clear,
  dialLimits,
  dialler,
} from "../src/call/dial.ts";
import { CALLS_PER_HOUR, type Dialled } from "../src/call/rate.ts";
import { constants } from "../src/call/state.ts";

const OWNED = ["+15551230000"];
const BUSINESS = "+15559990000";
const deployment: Deployment = { url: "ws://test", apiKey: "k", apiSecret: "s" };

describe("the preflight, in one order", () => {
  test("an owned number clears and says why", async () => {
    const got = await clear({ number: "555-123-0000", lineType: "mobile" }, { owned: OWNED, history: [], now: 0 });
    expect(got).toEqual({
      ok: true,
      target: "+15551230000",
      because: "owned",
      // An empty hour leaves the whole allowance of 16.5.
      remaining: CALLS_PER_HOUR,
    });
  });

  test("a number that is not North American is refused by the gate", async () => {
    const got = await clear({ number: "+44 20 7946 0000", lineType: "business" }, { owned: OWNED, history: [], now: 0 });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.refusedBy).toBe("gate");
  });

  test("an unknown line type is refused, because the gate fails closed (10.10)", async () => {
    const got = await clear({ number: BUSINESS, lineType: "unknown" }, { owned: OWNED, history: [], now: 0 });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.refusedBy).toBe("gate");
  });

  test("a business line the brief asserts clears (18.11)", async () => {
    const got = await clear({ number: BUSINESS, lineType: "business" }, { owned: OWNED, history: [], now: 0 });
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.because).toBe("business");
  });

  /**
   * The order is the point. A number this product may never call must be refused
   * by the gate, not counted against the hour it was never allowed to use.
   */
  test("the gate runs before the rate limit, so a refusal spends no budget", async () => {
    const full: Dialled[] = Array.from({ length: 6 }, (_, i) => ({ at: i, number: OWNED[0] as string }));
    const refused = await clear({ number: BUSINESS, lineType: "unknown" }, { owned: OWNED, history: full, now: 100 });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.refusedBy).toBe("gate");
  });

  test("a cleared number still meets the hourly limit (16.5)", async () => {
    const full: Dialled[] = Array.from({ length: 6 }, (_, i) => ({ at: i, number: OWNED[0] as string }));
    const got = await clear({ number: OWNED[0] as string, lineType: "mobile" }, { owned: OWNED, history: full, now: 100 });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.refusedBy).toBe("rate");
  });
});

describe("the carrier limits", () => {
  test("the default cap is the hard limit, so the carrier is only a backstop (11.3)", () => {
    expect(dialLimits()).toEqual({ ringSeconds: RING_SECONDS, maxCallSeconds: constants.hardLimitMs / 1000 });
  });

  test("a connectivity test asks for its own, shorter cap", () => {
    expect(dialLimits(60).maxCallSeconds).toBe(60);
    expect(dialLimits(60).ringSeconds).toBe(RING_SECONDS);
  });
});

function rig(overrides: Partial<DiallerDeps> = {}) {
  const order: string[] = [];
  let rung: { to: string; room: string; limits: DialLimits } | null = null;
  let answer: () => void = () => {};
  let fail: (error: Error) => void = () => {};

  const carrier: Carrier = {
    ring: (to, room, limits) =>
      new Promise<void>((resolve, reject) => {
        rung = { to, room, limits };
        order.push("ring");
        answer = resolve;
        fail = reject;
      }),
  };

  const deps: Partial<DiallerDeps> = {
    carrier: () => carrier,
    startWorker: async () => void order.push("startWorker"),
    dispatch: async () => void order.push("dispatch"),
    record: async () => void order.push("record"),
    deadLine: async () => void order.push("deadLine"),
    clearance: async () => ({ ok: true, target: "+15551230000", because: "owned", remaining: 5 }),
    now: () => 1_000,
    ...overrides,
  };

  const placement: Placement = {
    brief: { goal: "check the line", facts: {} },
    number: "555-123-0000",
    lineType: "mobile",
    deployment,
    trunk: "trunk-1",
    reportDir: "/tmp/nowhere",
  };

  return { order, deps, placement, answer: () => answer(), fail: (e: Error) => fail(e), rung: () => rung };
}

describe("a placement", () => {
  test("it starts the worker and dispatches before anything rings", async () => {
    const r = rig();
    const placed = await dialler(r.deps).place(r.placement);
    expect(placed.ok).toBe(true);
    // record before ring, so a crash between them still counts (rate.ts).
    expect(r.order).toEqual(["startWorker", "dispatch", "record", "ring"]);
    r.answer();
  });

  test("it rings the cleared number with the shared limits", async () => {
    const r = rig();
    const placed = await dialler(r.deps).place(r.placement);
    expect(r.rung()?.to).toBe("+15551230000");
    expect(r.rung()?.limits).toEqual(dialLimits());
    if (placed.ok) expect(r.rung()?.room).toBe(placed.room);
    r.answer();
  });

  test("a refusal rings nothing and names who refused", async () => {
    const r = rig({
      clearance: async () => ({ ok: false, refusedBy: "rate", because: "six this hour already" }),
    });
    const placed = await dialler(r.deps).place(r.placement);
    expect(placed.ok).toBe(false);
    if (!placed.ok) {
      expect(placed.refusedBy).toBe("rate");
      expect(placed.because).toBe("six this hour already");
    }
    expect(r.order).toEqual([]);
  });

  test("an answer tells the caller and ends nothing", async () => {
    const r = rig();
    const answered: string[] = [];
    const placed = await dialler(r.deps).place({ ...r.placement, onAnswered: () => answered.push("answered") });
    r.answer();
    if (placed.ok) await placed.rang;
    expect(answered).toEqual(["answered"]);
    expect(r.order).not.toContain("deadLine");
  });

  /**
   * 6.3: a line that never answered is a dead line, and the job must be told —
   * nothing else in the room will ever speak to it, so it would sit until the
   * watchdog of 16.4.1 or the hard limit.
   */
  test("a line that does not answer is reported and the job is ended", async () => {
    const r = rig();
    const said: string[] = [];
    const placed = await dialler(r.deps).place({ ...r.placement, onDeadLine: (because) => said.push(because) });
    r.fail(new Error("no answer"));
    if (placed.ok) await placed.rang;
    expect(said).toEqual(["no answer"]);
    expect(r.order).toContain("deadLine");
  });
});
