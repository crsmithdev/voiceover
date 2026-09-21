<picture>
  <source media="(prefers-color-scheme: dark)" srcset="design/lockup-dark.svg">
  <img src="design/lockup-light.svg" alt="Voiceover" width="264" height="52">
</picture>

Voiceover makes a telephone call for you. You write a rundown: one goal, the
facts it may state, the number. It dials, holds an open conversation toward
the goal, and comes back with a report. It says only what you wrote down.

![The Voiceover console with a rundown open](docs/console.png)

## The rule

An agent that speaks for you can do worse than fail. It can state a wrong
fact with confidence, in your name, to a stranger. Voiceover treats that as
the worst outcome, worse than a call that gets nowhere.

The boundary is mechanical, not a polite request in a prompt. A fact you did
not tick "give out" never reaches the model. A sensitive field (a card
number, a date of birth, an account number) is withheld unless you tick it,
and the model is told only that the field exists and that you hold it. It
cannot read the digits out under pressure, because it was never given them.

The console shows the boundary before, during and after the call: what it
may state, what it will not say, and what it refused when asked.

Three rules never change. It opens by saying it is an assistant calling for
you. It says yes when asked if it is a machine. It never says it is you.
Audio is not recorded.

## A call

1. **Rundown.** One goal. Key-value facts, each with a "give out" tick. A
   background note. The number and what kind of line it is. The rundown is
   not stored; it lives only for the call.
2. **Gate.** Before it dials: the number is one you own or a business line
   the rundown asserts, the hourly rate limit has room, the speech engines
   are warm. Anything else is refused.
3. **On air.** The phase (dialing, listening, thinking, speaking,
   interrupted, on hold, working a menu, transferring, closing), who
   answered (person, voicemail, menu, unknown), the transcript as it
   streams, and the clock against an 8 minute soft limit and a 12 minute
   hard limit. A hang-up key is always in reach.
4. **Report.** Outcome and reason. Who answered. Duration. What was said
   and heard. What was blocked and needs you. Per-turn latency, with the
   end-of-turn pause on its own line, because that pause is a setting, not
   a cost. A call does not end without a report. Reports are kept for 30
   days.

## Rehearsal

No telephone. The caller runs against a test receiver in a local room. Ten
receivers to pick from: receptionist, slow talker, hard of hearing, busy,
irritable, chatty, new employee, fighting the phones, voicemail machine,
menu system. Provoke events while it runs: talk over it, cough, ask if it is
a machine, ask for a fact it does not have, go quiet, transfer it. Take over
as the other party by keyboard. Read the last turn split into end-of-turn
wait, transcriber, brain and voice.

`scripts/rehearse.ts` runs the same rehearsals as a scripted suite and
asserts on the report, so a prompt change is tested without a browser or a
phone.

## Stack

- Bun and TypeScript. `@livekit/agents` 1.8.1 supplies the turn detector,
  the interruption handling, the answering machine detection and the menu
  tones. Voiceover configures these; it does not build them.
- Telephony is a LiveKit Cloud SIP trunk to Telnyx. One concurrent call.
- The brain is Claude Haiku 4.5 over OpenRouter by default. `VOICEOVER_BRAIN`
  and `VOICEOVER_BRAIN_BASE_URL` change it.
- Speech runs on the local GPU through the Sidetone voice bridge workers:
  faster-whisper for transcription, Kokoro for the voice, Piper as the
  fallback (`VOICEOVER_TTS=piper`).
- Rehearsals use a local LiveKit server in Docker on port 7890.
- Nothing but the brain makes a paid network call on the hot path.

## Run

```
bun install
bun scripts/ui.ts          # the console, http://127.0.0.1:3002
bun scripts/setup-trunk.ts # build the LiveKit half of the trunk, once
bun scripts/rehearse.ts    # the scripted rehearsal suite
bun scripts/test-call.ts   # dial, say one sentence, hang up
bun scripts/voices.ts      # render the Kokoro voices to pick one by ear
bun test
bun run typecheck
```

`.env` holds the keys and is not in the repository:

| Key | What it is |
| --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_TRUNK_ID` | The LiveKit Cloud project and its outbound trunk |
| `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`, `TELNYX_NUMBER`, `TELNYX_SIP_USERNAME`, `TELNYX_SIP_PASSWORD` | The Telnyx side of the trunk |
| `OPENROUTER_API_KEY` | The brain |
| `VOICEOVER_OWNED_NUMBERS` | Numbers the gate passes without a line-type check |
| `VOICEOVER_TEST_NUMBER` | Where `test-call.ts` and `call.ts` dial by default |

Reports, rehearsal logs, edited prompts and the dial history live under
`~/.voiceover`.

## Where things are

| Path | Contents |
| --- | --- |
| `docs/spec.md` | The product specification: the rules, the latency model, the measurements, the open points |
| `DESIGN.md` | The design system for the console |
| `design/voiceover.html` | The console, one self-contained page |
| `design/mark.svg`, `design/lockup-*.svg` | The mark, and the lockup with the word as outlines |
| `src/call` | The rundown, the gate, the rate limit, the state machine, the report |
| `src/rehearsal` | The test receivers and the local room |
| `src/speech` | The transcriber and the voices, as framework adapters |
| `scripts` | The console server and the command-line runs |
| `test` | Unit tests, `bun test` |

## Status

Voiceover is built by one person, for one person, one call at a time. It
assumes the author's machine: the voice bridge, the GPU, the local LiveKit
server. Real calls so far are test calls to numbers the author owns. Every
transcript in the console's samples is synthetic and labelled so.
