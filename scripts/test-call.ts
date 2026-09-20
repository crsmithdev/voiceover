/**
 * The first real call (spec 14.4), cut down to what it can prove.
 *
 * This is the connectivity test, not the caller: it dials, says one sentence
 * and hangs up. It proves the trunk, the codec, the audio path and the caller
 * identification. It proves nothing about a conversation.
 *
 * Every gate the spec asks for runs first: the dialing gate of 10.10, the rate
 * limit of 16.5, and the opening line of 10.1. The state machine of Section 6
 * drives the call, and the report of 11.4 is written from its state.
 *
 * Usage:
 *   bun scripts/test-call.ts            a dry run: every check, no dial
 *   bun scripts/test-call.ts --dial     places the call
 */
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AudioFrame, AudioSource, LocalAudioTrack, Room, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";
import { AccessToken, SipClient } from "livekit-server-sdk";
import { FRAME_MS, RTC_RATE, decodeWav, frameAt, resample } from "../src/audio/pcm.ts";
import { gate, normalise, ownedNumbers } from "../src/call/numbers.ts";
import { readHistory, recordDial, withinRate } from "../src/call/rate.ts";
import { buildReport, summarise } from "../src/call/report.ts";
import { writeReport } from "../src/call/reportStore.ts";
import { type Event, run } from "../src/call/state.ts";
import { Voice } from "../src/speech/voice.ts";

const LINE =
  "Hello, this is an automated assistant calling on behalf of Chris Smith. " +
  "This is a test call to check the line. Goodbye.";

const RING_SECONDS = 30;
const MAX_CALL_SECONDS = 60;

const need = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; put it in .env`);
  return value;
};

const dial = process.argv.includes("--dial");
const target = normalise(process.argv.find((arg) => /^\+?\d[\d\s()-]+$/.test(arg)) ?? need("VOICEOVER_TEST_NUMBER"));
if (!target) throw new Error("the target is not a North American number");

// 10.10. The number is one Chris owns, so it passes as "owned" and not as a
// business line. Nothing else about this call would pass the gate.
const verdict = gate({ number: target, lineType: "mobile" }, ownedNumbers());
console.log(`gate: ${verdict.allowed ? `allowed, ${verdict.because}` : `refused, ${verdict.because}`}`);
if (!verdict.allowed) process.exit(1);

// 16.5.
const now = Date.now();
const rate = withinRate(await readHistory(), now);
console.log(
  rate.allowed
    ? `rate: allowed, ${rate.remaining} left this hour`
    : `rate: refused, ${rate.because}, next at ${new Date(rate.nextAllowedAt).toLocaleTimeString()}`,
);
if (!rate.allowed) process.exit(1);

const voice = new Voice();
await voice.start();
const wavPath = join(tmpdir(), `voiceover-test-${now}.wav`);
await voice.say(LINE, wavPath);
voice.stop();
const wav = decodeWav(new Uint8Array(await readFile(wavPath)));
const samples = resample(wav.samples, wav.sampleRate, RTC_RATE);
const seconds = (samples.length / RTC_RATE).toFixed(1);
console.log(`voice: ${wav.samples.length} samples at ${wav.sampleRate} Hz, ${seconds} s of speech`);

if (!dial) {
  console.log("\ndry run: every check passed. Add --dial to place the call.");
  process.exit(0);
}

const url = need("LIVEKIT_URL");
const apiKey = need("LIVEKIT_API_KEY");
const apiSecret = need("LIVEKIT_API_SECRET");
const trunkId = need("LIVEKIT_TRUNK_ID");
const roomName = `voiceover-test-${now}`;

const token = new AccessToken(apiKey, apiSecret, { identity: "caller", ttl: "10m" });
token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

const room = new Room();
await room.connect(url, await token.toJwt(), { autoSubscribe: true, dynacast: false });
const source = new AudioSource(RTC_RATE, 1);
const track = LocalAudioTrack.createAudioTrack("agent", source);
await room.localParticipant?.publishTrack(
  track,
  new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
);
console.log(`room: joined ${roomName}`);

let events: Event[] = [{ kind: "dial", at: Date.now() }];
await recordDial({ at: now, number: target });

const sip = new SipClient(url, apiKey, apiSecret);
const participant = await sip.createSipParticipant(trunkId, target, roomName, {
  participantIdentity: "far-end",
  participantName: target,
  playDialtone: false,
  ringingTimeout: RING_SECONDS,
  maxCallDuration: MAX_CALL_SECONDS,
  waitUntilAnswered: true,
});
console.log(`dialled ${target} as ${participant.participantIdentity}`);

// `waitUntilAnswered` returns once something picks up, so reaching here is the
// answer. What picked up is another matter: the answering machine detection
// belongs to the agent session, and this script has none. A voicemail greeting
// and a person are indistinguishable from here, so the call says "unknown"
// rather than claiming a person. The first run of this script claimed a person
// and left its sentence on a voicemail.
const answered = true;
console.log("answer: something picked up; this script cannot tell what");

if (answered) {
  events.push({ kind: "answered", at: Date.now(), by: "unknown" });
  // Let the media path settle before the first word, or the opening syllable
  // is clipped on a leg that has only just come up.
  await Bun.sleep(1_000);
  events.push({ kind: "sentenceReady", at: Date.now(), text: LINE });
  const size = (RTC_RATE * FRAME_MS) / 1000;
  for (let at = 0; at < samples.length; at += size) {
    await source.captureFrame(new AudioFrame(frameAt(samples, at, size), RTC_RATE, 1, size));
  }
  events.push({ kind: "playbackFinished", at: Date.now() });
  await Bun.sleep(500);
  events.push({ kind: "hangUp", at: Date.now() });
} else {
  events.push({ kind: "answered", at: Date.now(), by: "dead" });
}

await room.disconnect();

const { state } = run(events);
const report = buildReport(state, { number: target, goal: "check the line", heard: [], said: [LINE], blocked: [] }, Date.now());
const path = await writeReport(report);
console.log(`\n${summarise(report)}\n\nreport: ${path}`);

// rtc-node keeps handles open after disconnect, so the process never exits on
// its own. Without this the script hangs until something kills it, and a pipe
// that buffers takes the whole log down with it.
process.exit(0);
