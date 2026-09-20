# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static clickable HTML prototype: one self-contained HTML/CSS/JS file in `design/`. Spec 18.2 puts mockups before any real UI. The real UI runs locally on the desktop that hosts the caller.

## Users

One user: Chris, who builds and owns the product (spec 1.6). He uses it at his own desktop when he wants a telephone call made but does not want to make it himself. During a real call he watches the call live and is ready to hang up.

## Product Purpose

The caller makes an outbound telephone call for Chris. It holds an open conversation toward one goal and reports the result. A call does not end without a report (1.5). A call succeeds when the goal is reached, or when the caller learns that it cannot be reached and says why (1.8).

## Positioning

A personal agent that speaks for one person and may state only what that person wrote in the brief. A wrong fact said with confidence is the worst failure, worse than a failed call (9.1). The interface exists to make that boundary visible before, during and after the call.

## Operating Context

Four jobs, in this order of use:

1. **Compose.** Write the brief: one goal, key-value facts, an optional background note, the fields that are releasable, the number and what kind of line it is. The brief is not stored; it lives only for the call (18.3).
2. **Gate.** Before dial: the number gate (owned, or a business line the brief asserts; everything else refused, 10.10), the hourly rate limit (16.5), the speech engines warm. The UI shows back what the caller will not say and the rules that are always true.
3. **Call.** Live: phase (dialing, waiting, listening, thinking, speaking, interrupted, on hold, leaving a message, working a menu, transferring, closing, ended), who answered (person, voicemail, menu, unknown), the transcript as it streams, interruptions and false interruptions, elapsed time against the soft limit (8 min) and hard limit (12 min), and hang up.
4. **Report.** Outcome and reason, answered by, clean or not, duration, what was said and heard, blocked items that need Chris, a warning when a machine question went unanswered, per-turn latency. Reports live in `~/.voiceover/reports` for 30 days and the UI lists them (18.6).
5. **Rehearsal.** No telephone. Pick a test personality (slow talker, receptionist, hard of hearing, busy, irritable, chatty, new employee, voicemail machine, menu system), provoke events (talk over it, cough, ask if it is a machine, ask for an unknown fact, go quiet, transfer), take over as the other party by keyboard, and read the last turn split into end-of-turn wait, transcriber, brain to a sentence, voice to audio.

## Capabilities and Constraints

- Terms from the spec: brief, goal, facts, background, releasable, line type, gate, rate limit, soft limit, hard limit, blocked, disclosure, report, personality, rehearsal, barge-in, false interruption.
- Absolute rules the UI shows and never offers to change: the opening line says it is an assistant calling for Chris; it says yes when asked if it is a machine; it never says it is Chris (10.1-10.3). Audio recording is off (10.6).
- Latency truth: the end-of-turn pause is a setting, not a cost, and is reported on its own line (15.15.5).
- North American numbers only. The product believes the line type the brief states (18.11).

## Evidence on Hand

- `docs/spec.md`: product truth, measured latencies (Haiku 4.5 first sentence 868 ms middle), constants.
- `src/call/brief.ts`, `report.ts`, `numbers.ts`, `state.ts`: the real data shapes.
- Real calls so far are test calls to a number Chris owns. No real transcripts of business calls exist; any shown transcript is synthetic and must be labelled so.

## Product Principles

- The boundary of what it may say is always visible.
- Say what happened; never infer it. A report that cannot know says unknown.
- The person on the other end matters more than speed.
- One user, one call at a time, no configuration beyond the brief.
