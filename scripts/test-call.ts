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
import { AudioFrame, AudioSource, LocalAudioTrack, Room, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";
import { AccessToken } from "livekit-server-sdk";
import { FRAME_MS, RTC_RATE, decodeWav, frameAt, resample } from "../src/audio/pcm.ts";
import { clear, dialLimits, livekitCarrier } from "../src/call/dial.ts";
import { recordDial } from "../src/call/rate.ts";
import { buildReport, summarise } from "../src/call/report.ts";
import { reports } from "../src/call/reports.ts";
import { type Event, run } from "../src/call/state.ts";
import { PiperTTS } from "../src/speech/tts.ts";

const LINE =
  "Hello, this is an automated assistant calling on behalf of Chris Smith. " +
  "This is a test call to check the line. Goodbye.";

/** A connectivity test says one sentence, so it needs a minute, not twelve. */
const MAX_CALL_SECONDS = 60;

const need = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; put it in .env`);
  return value;
};

const dial = process.argv.includes("--dial");
const asked = process.argv.find((arg) => /^\+?\d[\d\s()-]+$/.test(arg)) ?? need("VOICEOVER_TEST_NUMBER");

// 10.10 and 16.5, in `dial.ts` so this script and the console cannot disagree
// about the order. The number is one Chris owns, so it passes as "owned" and not
// as a business line; nothing else about this call would pass the gate.
const now = Date.now();
const clearance = await clear({ number: asked, lineType: "mobile" }, { now });
if (!clearance.ok) {
  console.log(`${clearance.refusedBy}: refused, ${clearance.because}`);
  process.exit(1);
}
const target = clearance.target;
console.log(`gate: allowed, ${clearance.because}`);
console.log(`rate: allowed, ${clearance.remaining} left this hour`)

// The same voice a real call speaks with, rather than a second copy of the
// worker protocol: src/speech/voice.ts was that copy and is gone.
const voice = new PiperTTS();
const wav = await voice.say(LINE);
await voice.close();
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

await livekitCarrier({ url, apiKey, apiSecret }, trunkId).ring(target, roomName, dialLimits(MAX_CALL_SECONDS));
console.log(`dialled ${target}`);

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
const path = await reports().write(report);
console.log(`\n${summarise(report)}\n\nreport: ${path}`);

// rtc-node keeps handles open after disconnect, so the process never exits on
// its own. Without this the script hangs until something kills it, and a pipe
// that buffers takes the whole log down with it.
process.exit(0);
