/**
 * Placing a call: the gate, the rate, the trunk and what rings (spec 10.10, 16.5).
 *
 * This was the most consequential action in the product and it had no module.
 * The `createSipParticipant` arguments lived in three scripts with three
 * different policies, the preflight order was re-decided in each, and the
 * dead-line verdict on a dial failure lived in an HTTP route. A refusal names
 * who refused rather than carrying an HTTP status, so the route stays the only
 * place that knows what a status code is.
 */
import { SipClient } from "livekit-server-sdk";
import type { Brief } from "./brief.ts";
import { type Deployment, dispatchCall, ensureWorker, sendCommand } from "./dispatch.ts";
import { type LineType, gate, normalise, ownedNumbers } from "./numbers.ts";
import { type Dialled, readHistory, recordDial, withinRate } from "./rate.ts";
import { constants } from "./state.ts";

/**
 * How long a line may ring before the carrier gives up.
 *
 * Six rings. Long enough for a person to reach a desk phone, short enough that
 * a number with no answer does not hold the one concurrent call of 13.5.1.
 */
export const RING_SECONDS = 30;

export interface DialLimits {
  ringSeconds: number;
  /**
   * The carrier's own cap, as a backstop under the hard limit of 11.3.
   *
   * It is not offsettable: a rehearsal can move the job's clock, and this number
   * is the real seconds a real trunk will carry. Nothing should ever reach it,
   * because 11.3 and the watchdog of 16.4.1 both end a call sooner.
   */
  maxCallSeconds: number;
}

export function dialLimits(maxCallSeconds = Math.round(constants.hardLimitMs / 1000)): DialLimits {
  return { ringSeconds: RING_SECONDS, maxCallSeconds };
}

/* ---------- the preflight ---------- */

export interface Preflight {
  number: string;
  /** 18.11 what the brief says this line is. The product believes it. */
  lineType: LineType;
}

export type Refused = { ok: false; refusedBy: "gate" | "rate" | "config"; because: string };
export type Cleared = { ok: true; target: string; because: "owned" | "business"; remaining: number };
export type Clearance = Cleared | Refused;

export interface ClearOptions {
  owned?: string[];
  history?: Dialled[];
  now?: number;
}

/**
 * Every check that must pass before a line rings, in one place and one order.
 *
 * The order is load-bearing. The gate refuses a number this product may not
 * call at all (10.10), so it comes before the rate limit, which protects a
 * number it may call from being called too often (16.5). Reversing them would
 * spend the hourly budget on refusals.
 */
export async function clear(request: Preflight, options: ClearOptions = {}): Promise<Clearance> {
  const target = normalise(request.number);
  const verdict = gate({ number: request.number, lineType: request.lineType }, options.owned ?? ownedNumbers());
  if (!target) return { ok: false, refusedBy: "gate", because: "that is not a North American number" };
  if (!verdict.allowed) return { ok: false, refusedBy: "gate", because: verdict.because };

  const history = options.history ?? (await readHistory());
  const rate = withinRate(history, options.now ?? Date.now());
  if (!rate.allowed) return { ok: false, refusedBy: "rate", because: rate.because };

  return { ok: true, target, because: verdict.because, remaining: rate.remaining };
}

/* ---------- what rings ---------- */

export interface Carrier {
  /** Resolves when something picks up, and rejects when nothing does. */
  ring(to: string, room: string, limits: DialLimits): Promise<void>;
}

export function livekitCarrier(deployment: Deployment, trunk: string): Carrier {
  const sip = new SipClient(deployment.url, deployment.apiKey, deployment.apiSecret);
  return {
    async ring(to, room, limits) {
      await sip.createSipParticipant(trunk, to, room, {
        participantIdentity: "far-end",
        participantName: to,
        playDialtone: false,
        ringingTimeout: limits.ringSeconds,
        maxCallDuration: limits.maxCallSeconds,
        waitUntilAnswered: true,
      });
    },
  };
}

/* ---------- the whole placement ---------- */

export interface Placement extends Preflight {
  brief: Brief;
  deployment: Deployment;
  trunk: string;
  reportDir: string;
  /** Where the job posts what happens, so the console can watch it. */
  events?: string;
  limits?: DialLimits;
  say?(text: string): void;
  /** What the job's own room sees. Told when nothing answers, as 6.3 requires. */
  onAnswered?(): void;
  onDeadLine?(because: string): void;
}

export type Placed =
  | {
      ok: true;
      room: string;
      because: "owned" | "business";
      /**
       * Settles when the ring has been answered or handled as a dead line.
       * A caller may ignore it: the console does, because a live call is watched
       * through the job's events. A test awaits it instead of sleeping.
       */
      rang: Promise<void>;
    }
  | Refused;

export interface Dialler {
  place(placement: Placement): Promise<Placed>;
}

/**
 * Everything `place` reaches outside itself. The defaults are the real thing; a
 * test replaces them and no process, trunk or deployment is needed.
 */
export interface DiallerDeps {
  carrier(placement: Placement): Carrier;
  startWorker(deployment: Deployment, say: (text: string) => void): Promise<void>;
  dispatch(deployment: Deployment, room: string, job: Parameters<typeof dispatchCall>[2]): Promise<void>;
  record(entry: Dialled): Promise<void>;
  deadLine(deployment: Deployment, room: string): Promise<void>;
  clearance(request: Preflight): Promise<Clearance>;
  now(): number;
}

const live: DiallerDeps = {
  carrier: (placement) => livekitCarrier(placement.deployment, placement.trunk),
  startWorker: ensureWorker,
  dispatch: dispatchCall,
  record: recordDial,
  deadLine: (deployment, room) => sendCommand(deployment, room, { kind: "end", reason: "dead-line" }),
  clearance: (request) => clear(request),
  now: () => Date.now(),
};

/**
 * One call, placed: clear it, start the worker, dispatch the job, record the
 * dial, then ring. `record` happens before the ring on purpose (rate.ts), so a
 * crash between them still counts against the hour.
 */
export function dialler(deps: Partial<DiallerDeps> = {}): Dialler {
  const d: DiallerDeps = { ...live, ...deps };
  return {
    async place(placement) {
      const clearance = await d.clearance(placement);
      if (!clearance.ok) return clearance;

      const say = placement.say ?? (() => {});
      const room = `caller-${d.now()}`;

      say("Starting the caller's worker");
      await d.startWorker(placement.deployment, say);
      await d.dispatch(placement.deployment, room, {
        mode: "call",
        brief: placement.brief,
        number: clearance.target,
        events: placement.events,
        reportDir: placement.reportDir,
        // 13.6.3 only the agent session can say what answered.
        classify: true,
      });
      await d.record({ at: d.now(), number: clearance.target });

      // The ring is what the far end hears, so it is the last thing to start and
      // the only part that is not awaited: the caller is already in the room.
      const rang = d
        .carrier(placement)
        .ring(clearance.target, room, placement.limits ?? dialLimits())
        .then(() => placement.onAnswered?.())
        .catch((error) => {
          const because = error instanceof Error ? error.message : String(error);
          placement.onDeadLine?.(because);
          // 6.3 a line that never answered is a dead line, and the job has to be
          // told: nothing else in the room will ever speak to it.
          return d.deadLine(placement.deployment, room).catch(() => undefined);
        });

      return { ok: true, room, because: clearance.because, rang };
    },
  };
}
