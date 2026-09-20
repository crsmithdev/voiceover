/**
 * A call that can hold a turn (spec 14.4, the second half).
 *
 * The framework runs the conversation. This script runs the call: the gate of
 * 10.10, the rate limit of 16.5, the limits of Section 11, and the report of
 * 11.4 built from the state machine of Section 6.
 *
 * Usage:
 *   bun scripts/call.ts             a dry run: every check, warm the engines, no dial
 *   bun scripts/call.ts --dial      places the call
 */
import { Room } from "@livekit/rtc-node";
import { initializeLogger, voice as voiceNs } from "@livekit/agents";
import { SessionBridge } from "../src/call/bridge.ts";
import { AccessToken, SipClient } from "livekit-server-sdk";
import type { Brief } from "../src/call/brief.ts";
import { gate, normalise, ownedNumbers } from "../src/call/numbers.ts";
import { readHistory, recordDial, withinRate } from "../src/call/rate.ts";
import { summarise } from "../src/call/report.ts";
import { writeReport } from "../src/call/reportStore.ts";
import { buildSession } from "../src/call/session.ts";
import { prompt } from "../src/prompts.ts";
import { constants } from "../src/call/state.ts";

const need = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; put it in .env`);
  return value;
};

const brief: Brief = {
  goal:
    "Check that this telephone line works. Ask the person how the audio sounds to them, " +
    "and whether there is any delay before you answer. Then thank them and end the call.",
  facts: {
    "who is calling": "Chris Smith's assistant",
    "why": "a test of a new calling system",
    "what Chris wants to know": "whether the voice is clear and whether the replies feel slow",
  },
};

const dial = process.argv.includes("--dial");
const target = normalise(process.argv.find((arg) => /^\+?\d[\d\s()-]+$/.test(arg)) ?? need("VOICEOVER_TEST_NUMBER"));
if (!target) throw new Error("the target is not a North American number");

const verdict = gate({ number: target, lineType: "mobile" }, ownedNumbers());
console.log(`gate: ${verdict.allowed ? `allowed, ${verdict.because}` : `refused, ${verdict.because}`}`);
if (!verdict.allowed) process.exit(1);

const startedAt = Date.now();
const rate = withinRate(await readHistory(), startedAt);
console.log(rate.allowed ? `rate: allowed, ${rate.remaining} left this hour` : `rate: refused, ${rate.because}`);
if (!rate.allowed) process.exit(1);

initializeLogger({ pretty: true, level: "warn" });
console.log("warming the speech engines...");
// The bridge collects what the report needs, and the caller's own tool tells it
// which details were deferred (9.8).
const bridge = new SessionBridge({
  onEvent: (text) => console.log(`event: ${text}`),
});
const engines = await buildSession(brief, { onDeferred: (detail) => bridge.noteDeferred(detail) });
console.log("engines: ready");

if (!dial) {
  console.log("\ndry run: every check passed and the engines load. Add --dial to place the call.");
  await engines.close();
  process.exit(0);
}

const url = need("LIVEKIT_URL");
const apiKey = need("LIVEKIT_API_KEY");
const apiSecret = need("LIVEKIT_API_SECRET");
const roomName = `caller-${startedAt}`;

const token = new AccessToken(apiKey, apiSecret, { identity: "caller", ttl: "20m" });
token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

const room = new Room();
await room.connect(url, await token.toJwt(), { autoSubscribe: true, dynacast: false });
await engines.session.start({ agent: engines.agent, room });
console.log(`room: joined ${roomName}`);

bridge.attach(engines.session);
bridge.apply({ kind: "dial", at: Date.now() });
await recordDial({ at: startedAt, number: target });

const sip = new SipClient(url, apiKey, apiSecret);
await sip.createSipParticipant(need("LIVEKIT_TRUNK_ID"), target, roomName, {
  participantIdentity: "far-end",
  participantName: target,
  playDialtone: false,
  ringingTimeout: 30,
  maxCallDuration: Math.round(constants.hardLimitMs / 1000),
  waitUntilAnswered: true,
});
// 13.6.2: nothing here classifies the answer, so it is recorded as unknown.
bridge.apply({ kind: "answered", at: Date.now(), by: "unknown" });
console.log("answer: something picked up");

/** Section 11. The soft limit closes, the hard limit cuts. */
const softAt = Date.now() + constants.softLimitMs;
const hardAt = Date.now() + constants.hardLimitMs;
let closed = false;
engines.session.once(voiceNs.AgentSessionEventTypes.Close, () => {
  closed = true;
});

let reason: "goal-closed" | "soft-limit" | "hard-limit" | "far-end-hung-up" | "caller-hung-up" = "caller-hung-up";
let softAnnounced = false;
while (!closed && Date.now() < hardAt) {
  bridge.apply({ kind: "tick", at: Date.now() });
  if (Date.now() > softAt && !softAnnounced) {
    softAnnounced = true;
    reason = "soft-limit";
    console.log("soft limit: closing");
    // 11.2. The limit starts the close; it never cuts a sentence.
    engines.session.generateReply({ instructions: prompt("caller.soft-limit"), allowInterruptions: false });
  }
  if (room.remoteParticipants.size === 0 && Date.now() > startedAt + 5_000) {
    reason = "far-end-hung-up";
    break;
  }
  await Bun.sleep(500);
}
if (!closed && Date.now() >= hardAt) reason = "hard-limit";

await engines.session.close?.();
await room.disconnect();
await engines.close();

const report = bridge.report(reason, { number: target, goal: brief.goal }, Date.now(), Date.now() - startedAt);
const path = await writeReport(report);
console.log(`\n${summarise(report)}`);
const middle = bridge.middleReply();
console.log(`\nheard ${bridge.heard.length}, said ${bridge.said.length}, replies middle ${middle === null ? "none" : `${middle.toFixed(2)} s`}`);
for (const line of bridge.heard) console.log(`  them: ${line}`);
for (const line of bridge.said) console.log(`  us:   ${line}`);
console.log(`\nreport: ${path}`);

// rtc-node keeps handles open after disconnect (see scripts/test-call.ts).
process.exit(0);
