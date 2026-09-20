# Outbound Call Agent — Product Specification

Written in ASD-STE100 Simplified Technical English.
Feature level only. No code.
Date: 13 September 2026. Sixth revision.

Source of the first revision: Google Doc
`Outbound Call Agent — Product Specification (ASD-STE100)`,
<https://docs.google.com/document/d/1kym06wi7s1LWctCGsDNDk2x_KlwuDdhItl_FL1qfPps/edit>.
This file is the live copy. The Google Doc is the history.
The review that caused this revision: `Outbound Call Agent — Red Team Review of
Revision 3`,
<https://docs.google.com/document/d/1bMFjZJyjiKp-FtrTh7k9I6tdhI0tvdQbytxm3AYFows/edit>.

This document is the specification for a personal outbound call agent. It gives
the purpose, the background, the settled design decisions, the conversation
model, the test plan, the technology choices, the build order, the measurements,
and the risks.

**What changed in the fourth revision.** Four reviewers read revision 3 in
parallel. Five changes follow from what they found.

1. The rule for interruption in revision 3 was not possible to build. Section 7
   replaces it with the mechanism that the framework has.
2. The time budget measured the first token of text. The target is the first
   sound. Section 3 now separates the two, and the choice of model in 4.6 is
   provisional until the correct quantity is measured.
3. The build order put the first real call last. Section 14 puts it fourth.
4. The running summary is cut. The call limit already does its work.
5. The knobs are constants at the framework default, not settings. Section 17
   replaces the settings table.

Section 6 is new and gives the conversation states, because revision 3 named the
mechanics and never named the states between them.

**What changed in the fifth revision.** The two unknown parts of the latency
budget are measured, so 3.6 now holds three measurements and one estimate. The
choice of brain in 4.6 is confirmed. The speech engines exist and are reused
rather than chosen, because the voice bridge installed them since revision 4.

## 1. Purpose

1.1 The outbound call agent makes telephone calls for Chris.
1.2 Chris uses the agent when he wants to make a call but does not want to make it himself.
1.3 The agent holds a real, open conversation. The agent does not read a fixed script.
1.4 The agent has a goal for each call. The agent works toward that goal.
1.5 The agent reports the result of the call back to Chris. A call does not end without a report.
1.6 The product is for one user. Other users are not in this revision (see Section 18.7).
1.7 Chris builds this product himself. Chris does not use an off-the-shelf product.

1.8 A call is a success when the goal is reached, or when the caller learns that
the goal cannot be reached and says why. A fast call that gets neither is a
failure. Speed is a constraint, not the measure.

## 2. Background and reasoning

2.1 An earlier version of this product did not work well in practice.
2.2 The earlier version used a hosted brain with separate speech-to-text and speech-to-speech services in a chain. The chain gave bad latency.
2.3 The earlier version handled interruptions poorly. It ran on the same agent framework, with plain sound detection for the turn and interruption turned on. So the fault was the method, not a missing feature.
2.4 The earlier version was hard to test. The test used receiving agents that were an afterthought. The receiving agents stepped on each other. The system gave poor visibility into what happened.
2.5 The earlier version was costly to test. The test used a paid speech service, a paid telephone service, and the brain, all at the same time, on every test.
2.6 The industry has moved away from the chain that gives bad latency. The industry streams every stage and does not wait for a complete output before the next stage starts. Done this way, the same chain gives low latency.

2.7 **Twice corrected.** The first revision said the speech engines already ran
locally, which was false when revision 2 was written. It is true now. The voice
bridge installed both since revision 4: faster-whisper `small.en` on the card, and
Piper with the `en_US-lessac-medium` voice, each a long-lived Python worker behind
an interface. This product reuses them rather than choosing its own.

2.8 The card is an NVIDIA RTX 5070 with 12 gigabytes of video memory. The machine
has 30 gigabytes of system memory. Whether a speech-to-text model and a neural
voice fit together is not known until the models are chosen (see Section 18.1).
Do not treat the card as sized.

2.9 Nothing carries over from the earlier version by account. The telephone
account is closed. The model account is disabled. Both were checked on 9
September 2026 and both refuse authentication.

2.10 Code does carry over, and the build must decide about it. The earlier
version holds a test orchestrator, a test receiver, and a set of test
personalities. Keep and repair them, or delete them (see Section 18.8).

## 3. Latency model

3.1 Startup latency is acceptable. Chris can wait 15 to 20 seconds to start the agent before a call.
3.2 Per-turn latency is the real target. The person on the other end must not hear a gap that sounds like a dropped call.
3.3 The target for per-turn latency is under about one and a half seconds to the
first sound the other person hears, after that person stops speaking.

3.4 **The first token is the wrong event.** The brain sends text word by word,
and the voice does not start until a sentence ends. So the quantity that decides
3.3 is the time to the first complete *sentence*. Revisions 1 to 4 measured the
first token. Section 15.3 now measures the first sentence.

3.5 The system reaches the target by streaming. The speech-to-text streams partial
words. The brain streams the first tokens. The voice starts to speak the first
sentence while the rest is made.

3.6 The budget for one turn has four parts. Three are measured. One is an
estimate, and one is set by a constant.

| Part | Time | Status |
|---|---|---|
| End-of-turn detection, after the last speech | 300 to 600 ms | Set by a constant |
| Brain, to the first complete sentence | 868 ms middle, 941 ms high | Measured (15.3) |
| Voice, to a finished wav | 79 ms middle, 178 ms for a long sentence | Measured (15.5) |
| Transport, both ways | 50 to 150 ms | Estimate. To measure |

3.7 The parts do not simply add. The stages overlap by design. Do not sum this
table and report the total as a finding. Measure the whole path end to end
instead (see Section 15.16).

3.8 Added together, the fast end of the detector gives about 1.3 seconds and the
slow end gives about 1.9 seconds. So the target in 3.3 holds at the fast end and
fails at the slow end. Both figures are upper bounds, because 3.7 holds.

3.9 The main latency risk is the brain, and a weak network. This risk gives an
occasional slow turn, not a constant delay.

## 4. Architecture decision

4.1 The product uses a three-stage pipeline. The stages are speech-to-text, then the brain, then speech-to-speech.
4.2 The product does not use a single speech-to-speech model. The reason is control. The agent speaks for Chris and must be steerable and must support tool use. Control matters more than the lowest possible latency. This trade was not measured.
4.3 The local card does the speech-to-text and the speech-to-speech.
4.4 The brain is a hosted model over a streaming interface.
4.5 The brain does not run on the local card.

4.6 **The brain is Claude Haiku 4.5.** Measured against the right event, it
reaches the first complete sentence in 868 milliseconds at the middle value and
941 at the high value, which fits the budget in 3.6. Sonnet 5 reaches 1996 and
2280, so it breaks the target on its own. The choice is confirmed.

4.7 A model that writes a longer first sentence pays twice, because the first
sentence is what the voice waits for. Sonnet 5 spends 727 milliseconds between
its first token and its first sentence; Haiku 4.5 spends 186. So the style
instruction that asks for short sentences is part of the latency design, not only
the manner of the caller.

4.8 The route to the brain is OpenRouter, because that key works today. Measure a
direct route before you decide the budget is tight.

4.9 The test receivers use a cheaper and faster model. Gemini 2.5 Flash reaches a
first sentence in 666 milliseconds, and Flash Lite reaches 558 but with a high
value of 1282, so it is the less steady of the two. A test receiver does not
speak for Chris.

## 5. The shared conversation core

5.1 The caller and the receiver share the same internals for the mechanics of conversation.
5.2 Most of these mechanics belong to the agent framework, not to this product. This product configures them. Section 13.6 says which.
5.3 The caller and the receiver are not identical. Each is a thin layer on top of the shared core.
5.4 The caller layer holds the goal of the call, the background information, and what the caller *says* in a special case: what to leave on a voicemail machine, what to do when a menu answers, and how to start again after a transfer. The transport detects each of these cases (see Section 13.6). The caller layer does not detect them.
5.5 The receiver layer holds the behavior of the person who answers. In a test, the receiver layer holds a test personality.
5.6 The purpose is reuse of the hard conversation mechanics. The purpose is not to make the two agents the same.

## 6. Conversation states

6.1 A call is a state machine. Revision 3 named the mechanics and never named the
states, so the transitions between them were undefined. This section names them.

6.2 The states are: dialing, waiting for an answer, listening, thinking, speaking,
interrupted, on hold, leaving a message, working a menu, transferring, closing,
and ended.

6.3 The transitions below must each have a defined behavior. Revision 3 defined
none of them.

| Event | Question the product must answer |
|---|---|
| The far end speaks while the agent runs a tool and has no text yet | What plays, and does the speech count as a turn |
| Both sides start to speak together | Who yields |
| An interruption arrives and no words follow | Resume the sentence, restart it, or drop it (see 7.6) |
| A sentence is already playing when the model corrects itself | The audio cannot be recalled. What the caller says next |
| The soft limit fires while a party is mid-sentence | The limit waits for the sentence, never cuts it |
| The hard limit fires | The call ends. The report is still written (see 11.4) |
| A transfer arrives mid-sentence | The agent stops, waits, and starts again from the brief |
| Hold music plays | It is not speech and must not satisfy any detector |
| A voicemail greeting plays | It is a monologue. Turn-taking is off until the beep |

6.4 The state machine is the first thing to build, and the layer one test drives
it directly (see Section 12.3).

## 7. Turn-taking and interruption

7.1 **Correction.** Revision 3 said that an interruption must come from the
end-of-turn model, and never from the sound level. This was wrong and not possible
to build. The two are different mechanisms that answer different questions. The
end-of-turn model answers "has the far end finished". Interruption asks "has the
far end started, while the agent speaks".

7.2 Interruption uses the mechanism of the framework, in this order.

7.2.1 The voice detector reports speech while the agent speaks.
7.2.2 The speech must last at least a minimum time before it counts as an interruption.
7.2.3 The speech must produce at least a minimum number of words from the speech-to-text.
7.2.4 If no words arrive within a set time, the interruption was false.
7.2.5 After a false interruption, the agent continues the sentence it was speaking.

7.3 The agent stops its own playback as soon as 7.2.2 is satisfied. It does not wait for 7.2.3.

7.4 The word test in 7.2.3 is what protects against the echo path of a telephone
line (see Section 16.6) and against a cough or a noise. Sound alone is not enough
on a telephone leg.

7.5 The end-of-turn model is a separate thing, and Section 8 covers it. It runs
after the far end stops. It does not gate an interruption.

7.6 A false interruption must not lose the turn. The agent resumes. This behavior
has an open fault in the framework (see Section 16.8), so a layer one test must
prove it in this product.

7.7 The product does not need to separate the voices of more than one person.

## 8. End of turn detection

8.1 End of turn detection decides when the other party has finished speaking.
8.2 A simple method waits for a fixed length of silence. It cuts in on a slow talker, or it waits too long.
8.3 The product uses a method that also looks at the content of the speech, not only the silence.

8.4 **The method is the LiveKit Turn Detector, audio model v1-mini.** The model
reads the audio directly, so it removes the transcription delay from the hot path.
It runs on the local processor, it has no per-use cost, and it is part of the agent
framework.

8.5 **The local model needs the framework's worker model to exist at all.** The
runner that serves it is registered inside the framework's `worker.js`, and the
executor that calls it is built by the worker. A session started by a plain
script gets neither, and the detector does not fail: it pins every prediction to
1.0 and turns commit on a fixed delay, which is the method 8.2 rejects. The
native binding is present and loadable; it is the executor that is missing.
Measured on 13 September 2026 against `@livekit/agents` 1.8.1. So the caller
either runs as a framework worker or gives up 8.4 (see 18.14).

8.5.1 **Answered on 17 September 2026.** The caller runs as a worker job
(18.14), and the model runs with it: six rehearsals reported first predictions
of 0.34, 0.51, 0.67, 0.70, 0.74 and 0.81. A prediction that is not 1.0 is the
proof, because 8.5 is exactly the case where every prediction is pinned to 1.0.
A standalone session still behaves as 8.5 says, and `buildSession` warns only
there.

8.6 The memory footprint of the audio v1-mini model is not published. Revision 2
gave a figure that belongs to the older text model. Measure it.

8.7 **Correction. One detector cannot answer two questions.** Revision 5 said
there was one detector and it should be tuned as one thing. A road test of the
voice bridge disproved that. Opening a recording must be quick and forgiving, or
the first syllable of the reply is lost. Stopping the agent mid-sentence must be
slow and sure, or a passing lorry costs a sentence. So there are two: a low level
with a short onset starts the recording, and a higher level held for longer stops
the playback. The bridge uses 0.02 with a 50 millisecond onset against 0.05 held
for 400.

8.7.1 The barge-in detector tolerates a dip. Natural speech falls below the level
between syllables, so a detector that wants unbroken sound never fires on a short
sentence and fires only on long ones. The bridge allows a gap of 200
milliseconds inside the count.

8.7.2 On a telephone leg the lorry is the echo path and the line noise. The word
test of 7.2.3 and the two thresholds here do the same job from two sides.

8.8 The published false-cutoff rates of 9.9 percent at 300 milliseconds and 4.5
percent at 600 milliseconds belong to the full v1 model, which runs only on the
vendor cloud. They are not a promise for v1-mini. Measure v1-mini on
telephone-grade audio.

8.9 The code is Apache-2.0. The weights are under the vendor model licence.

## 9. Safe behavior on an unknown

9.1 The caller speaks for Chris. A wrong fact said with confidence is the worst failure of this product. It is worse than a failed call.
9.2 The caller may state only the facts in the call brief. Every other fact is unknown.
9.3 The caller does not guess. The caller never invents a date, a number, a spelling, an address, or a name.
9.4 On an unknown, the caller says one short line: it does not have that detail, and it will check and come back. The caller then returns to the goal.
9.5 The caller does not give a payment detail, a card number, a date of birth, an account number, or a government number, unless the call brief marks that field as releasable.
9.6 The caller does not agree to a price, a fee, or a commitment that the call brief does not permit.
9.7 If the other party needs an unknown fact to continue, the caller ends the call politely and offers a callback or a text message.
9.8 The caller reports every blocked item to Chris with the call result.

9.5.1 **Decided. A withheld value never enters the prompt.** A sensitive field
that the brief does not mark releasable is listed to the caller by name only,
with the note that Chris holds it and the caller does not have it. So "I do not
have that detail" is true rather than obedient. A rehearsal on 17 September 2026
had the caller read a card number out under pressure, with the rule of 9.5 in
its instructions; the rule is kept, and the value is now out of reach.

9.8.1 **Decided. The caller reports its own blocked items.** It has one tool,
`note_deferred_detail`, and the rules tell it to call the tool before it answers
whenever it withholds or defers anything. Nothing else can know what was asked,
so a report built without it always said "blocked: none". The tool's description
and that rule are both editable (18.16).

9.9 This section holds the only logic in the product that the framework does not
supply. It gets the test weight to match. The layer one test drives it directly
with adversarial briefs, and more than one test personality probes for facts the
brief does not hold (see Section 12.9).

## 10. Disclosure and recording

10.1 The caller opens with a line that says it is an assistant that calls for Chris. This opening line is a constant, and it is on.
10.2 Two rules are absolute. First, the caller answers the direct question truthfully and at once: if a person asks whether it is a machine or an artificial intelligence, the caller says yes. Second, the caller never says that it is Chris.
10.3 A setting that turns off 10.2 is an instruction to lie. The product does not hold such a setting.
10.4 The question in 10.2 can arrive while the agent speaks. It is an interruption, and the word test in 7.2.3 can drop a short question. So the caller also treats the question as answerable at the next turn, and it does not continue the goal until it answers.
10.5 A wrong transcription can hide the question. The caller answers any near form of the question the same way. When in doubt, it answers yes.
10.6 Audio recording is off. The product keeps the text transcript that the speech-to-text makes. The product does not keep the audio.
10.7 If recording is turned on, the caller says in its first sentence that it records the call. The two always move together.
10.8 The reason for 10.6 and 10.7 is the law of California, which asks every party to a private conversation to agree before it is recorded. The exact statute is not cited here and this document is not legal advice (see Section 18.5).
10.9 The transcript holds what the other party said, which can include their own personal data. Decide how long a transcript lives before the first real call (see Section 18.6).
10.10 The dialing path decides what may be dialled, before it dials. It fails
closed, in this order: a number Chris owns passes; a number the brief calls a
published business line passes; everything else is refused until the check in
18.5 is done. A brief that does not say what kind of line it is gets a refusal,
so silence is not permission.

10.11 This rule is a choice, not a law. It comes from the reading in Section 9 of
the red team review, where an artificial voice on a residential or wireless line
carries obligations that a business line does not. The sources were secondary.
Revisit it when 18.5 is answered.

10.12 The product cannot tell a business line from a home line on its own. The
brief asserts it and the product believes it. A carrier lookup could check that
claim for a fraction of a cent for each call; it is not built (see 18.11).

## 11. Call limits

11.1 A call has two limits, and both are constants (see Section 17).
11.2 The soft limit starts the close. The caller stops working toward the goal, states where things stand, offers a callback, and ends the call politely. The soft limit never cuts a sentence.
11.3 The hard limit cuts the call. It is the protection against a fault that will not end.
11.4 The report is always written, at either limit, and a report from the hard limit says the call was cut. Writing the report must not depend on the brain, because the fault that reached the hard limit can be the brain. A report written from local state is enough.

11.4.1 What the caller said comes from the session, not from the state machine.
The framework owns playback, so the machine never sees a sentence finish in a
real call, and a report built from what it saw claims the caller said nothing.
The first conversation did exactly that: four sentences spoken, zero in the
report.
11.5 The caller carries the whole conversation to the brain. The hard limit bounds it: a call of twelve minutes stays well inside the size where the brain stays fast (see Section 15.9).
11.6 Revision 3 held a running summary that trimmed the conversation. It is cut. It solved a problem the hard limit already prevents, and it changed the part of the prompt that 11.7 wants to stay fixed.
11.7 The call brief does not change during a call, so it is marked as a prefix that the model provider can cache. Measure the effect on the cost and on the time to the first token.

## 12. Test plan

12.1 The test plan has separable layers, so a failure points to one layer.
12.2 The layers are not equal. Layer one and layer four carry the weight. Layer three is narrow, and this revision moves it later.

12.3 **Layer one: conversation logic.** Tested in text, below the audio, with
simulated timing. The test injects events and asserts what the agent does. It
drives the state machine of Section 6, the interruption rules of Section 7, and
the unknown-answer rules of Section 9. It is repeatable and gives readable traces.
This is the largest test surface in the product.

12.4 **Layer two: the audio pipeline.** The speech-to-text, the voice, and the
barge-in, tested with recorded audio.

12.5 The fixtures are telephone-grade. Record at 16 kilohertz, then pass the
recording through 8 kilohertz μ-law and back. A test on clean microphone audio
gives a good result that the telephone line does not repeat.

12.6 Choose the speech-to-text model by measuring it on those fixtures, not from a
public leaderboard, because the leaderboards use wide-band audio.

12.7 **Layer four: the real call.** The telephone service and a real call. It is
the only layer that can find the echo path, the carrier delay, the caller
identification, and the behavior of a real person. It comes early in the build
(see Section 14).

12.8 **Layer three: two agents on one machine.** Two agents talk to each other
with the real pipeline and no telephone network. Its yield is narrow: both sides
share a clock, skip the network, and are built from the same code, so they agree
by construction. It finds problems between two local processes and little else.
Build it after the first real call, and only if layer one and layer four leave a
gap.

12.4.1 **The layer two runner.** `bun scripts/layer2.ts` runs the bench of
15.10 over the kept fixtures and asserts on the figures: at most 3 words adrift
on the telephone band, at most 8 with the seeded noise, and a median
transcription under 200 milliseconds. It passes because 15.12 made the corpus
stable.

12.8.1 **The runner.** `bun scripts/rehearse.ts` drives scripted rehearsals
without a browser: a personality, a brief, a list of challenges, and assertions
on the report. It checks the outcome, that no question about being a machine is
left owed, that a deferred detail reached the report, that the caller said what
the case expects, and that no withheld value was ever spoken. Run it after a
change to a prompt, the caller or the pipeline. Six cases as of 17 September
2026: the disclosure question with a withheld card, a fact the rundown does not
hold, a menu that transfers to a person, hold music and talking over, the soft
limit, and a voicemail machine. All six passed on the worker path.

12.9 Test personalities include: a slow talker, an old-sounding person, a quiet
person, a rambler, a person who trails off, a person who says "uh-huh" in the
middle and does not mean they are done, a voicemail machine, a menu system, and
more than one person who asks for facts the brief does not hold.

12.10 A test personality gets its character from behavior and timing, not from a premium voice.

12.11 **How to pay for layer four.** The test calls a second number that Chris
owns. No other person answers. The cost is $1.00 each month for the number, plus
$0.005 for each outbound minute. Twenty test calls of three minutes cost about 30
cents in minutes. Money is not a reason to run it less often.

12.12 Layer four runs before the first real call, after a change to the audio
pipeline, after a change to the transport, and when the telephone account or the
number changes.

## 13. Technology choices

13.1 The transport for real-time audio uses LiveKit over WebRTC. Do not build the transport by hand.
13.2 The speech-to-text and the voice are the voice bridge's: faster-whisper `small.en` and Piper `en_US-lessac-medium`, reused as they stand (see 2.7).
13.3 The brain is Claude Haiku 4.5 over a streaming interface, provisionally (see 4.6).
13.4 The end-of-turn model is the LiveKit Turn Detector v1-mini, on the local processor.
13.5 **The telephone service is Telnyx, and the SIP host is LiveKit Cloud.** The
outbound rate is $0.005 each minute and the number is $1.00 each month. The
self-hosted LiveKit that the voice bridge uses sits behind Tailscale, which a
carrier cannot reach, and opening a home desktop's SIP port and a ten-thousand
port media range to the internet is worse than one media hop. So the caller uses
a LiveKit Cloud project and the bridge keeps its own deployment.

13.5.1 The trunk exists as of 12 September 2026. On Telnyx: the Default outbound
voice profile, capped at one concurrent call and $2.00 each day; an FQDN
connection over TCP with digest credentials, anchorsite Latency; an FQDN record
pointing at the project's SIP host on port 5060; and the number attached to that
connection. On LiveKit: one outbound trunk to `sip.telnyx.com` carrying that
number. `scripts/setup-trunk.ts` rebuilds the LiveKit half and does nothing if it
already exists.

13.5.2 The INVITE carries an `X-Telnyx-Username` header, because Telnyx otherwise
matches a call by source address and can choose the wrong connection. It belongs
in the trunk's `headers`, not in `headersToAttributes`, which maps headers off an
inbound call and would do nothing here. The vendor guide shows the latter.

13.6 **The framework owns more than this product builds.** It sends the tones of a
menu, it detects a menu and works through it, it says whether a person, a
voicemail machine, a menu, or a dead line answered, and it supplies the
interruption mechanism of Section 7 and the detector of Section 8. This product
configures these. It does not build them.

13.6.1 Both local engines reach the framework through its own `StreamAdapter`.
Each worker takes a file and returns a result, so each adapter declares itself
non-streaming, and the framework puts a voice detector in front of the
speech-to-text and a sentence rule in front of the voice. This is the supported
way to use an engine that cannot stream, and it means neither adapter carries
timing logic of its own.

13.6.3 **The session now asks.** A real call runs the framework's answering
machine detection, so the report can say a person, a voicemail box, a menu or a
dead line instead of "unknown". It is wired and untried: no real call has been
placed since. A rehearsal does not run it, because the rehearsal already knows
what answered.

13.6.2 One qualifier, learned on the first call. The classification of who
answered belongs to the *agent session*, not to the act of dialling. A script
that only creates a SIP participant gets "something picked up" and nothing more.
So any code path that dials without an agent session must record the answer as
unknown. It must not assume a person. What this product builds is Section 6,
Section 9, the caller layer, and the report.

13.7 The agent framework is `@livekit/agents` for Node, version 1.8.1. It carries
everything Sections 7 and 8 assume: the audio end-of-turn detector as
`turn-detector-v1-mini` with a local transport, the interruption order of 7.2
including the false interruption and the resume, the tones of a menu, and the
classification of what answered. So this product stays in TypeScript and adds no
second language beyond the two Python speech workers it reuses.

13.8 Nothing but the brain makes a paid network call on the hot path, except the
media hop through LiveKit Cloud that 13.5 accepts. Measure that hop as part of the
end-to-end time (15.16).

## 14. Build order

14.1 Build the conversation state machine of Section 6 first.
14.2 Build the layer one test second, with simulated timing. It covers Section 6, Section 7 and Section 9.
14.3 Reuse the bridge's speech engines third. Done: the first sentence, the voice and the speech-to-text on a telephone band are measured (15.3, 15.5, 15.10). What remains needs a real line.

14.4 **Make one real call fourth.** Done on 12 September 2026 for the
connectivity half (15.14): the trunk carries audio to a real telephone.
`scripts/test-call.ts` dials, speaks one sentence and hangs up, behind the gate of
10.10 and the rate limit of 16.5. What it does not do is hold a turn, so the idea
of the product, that streaming makes the delay acceptable, is still untested.
That needs the speech-to-text and the brain wired into the same call.

14.5 Build the audio fixtures and the layer two test fifth, with the numbers the real call gave.
14.6 Add the test personalities sixth.
14.7 Consider layer three last, and only if a gap remains (see 12.8). Built on
17 September 2026 at Chris's request, ahead of that gap (see 18.15).

## 15. Measurements

15.1 The time to the first complete sentence was measured on 12 September 2026,
through OpenRouter, from this machine and this network. Fifteen samples for each
model, one connection reused for all of them, and two warm-up calls discarded
before any sample was timed. The sentence rule is the one the product uses.

15.2 The gap between the first token and the first sentence is the part that
revisions 1 to 4 missed. It is not a constant. A model that writes a longer or
more considered first sentence pays a larger gap, so the gap belongs to the model
and not to the pipeline.

15.3 The first sentence, and the first token beside it for comparison:

| Model | Token, middle | Sentence, middle | Sentence, high | Gap | Sentence length |
|---|---|---|---|---|---|
| Gemini 2.5 Flash Lite | 426 ms | 558 ms | 1282 ms | 132 ms | 32 chars |
| Gemini 2.5 Flash | 482 ms | 666 ms | 807 ms | 183 ms | 40 chars |
| **Claude Haiku 4.5** | **681 ms** | **868 ms** | **941 ms** | **186 ms** | 57 chars |
| Claude Sonnet 5 | 1269 ms | 1996 ms | 2280 ms | 727 ms | 49 chars |

15.4 Reusing one connection moved the first token for Haiku 4.5 from 740
milliseconds to 681. Revision 4 blamed the missing reuse for much of the error in
the earlier numbers. The criticism was right in principle and worth about 60
milliseconds, which is inside the noise in 15.7.

15.5 The voice was measured on 12 September 2026, through the bridge's own worker,
on the sentences the models above produced. Six samples for each sentence, two
warm-ups discarded.

| Sentence length | To a finished wav | Audio produced | Times real time |
|---|---|---|---|
| 26 chars | 46 ms | 1498 ms | 32.5 |
| 40 chars | 70 ms | 2577 ms | 37.1 |
| 44 chars | 79 ms | 2624 ms | 33.1 |
| 54 chars | 178 ms | 2949 ms | 16.5 |
| 65 chars | 102 ms | 3471 ms | 34.2 |

15.6 The voice loads in about 0.93 seconds, once, and then runs at about 33 times
real time. So the voice is not a latency problem at this sentence length, and the
estimate of 100 to 250 milliseconds in revision 4 was pessimistic. The 54
character row is slower than the 65 character row, which says the variance
between runs is larger than the effect of length over this range.

15.7 Repeated measurements of the same case differ by up to about 80
milliseconds, and earlier runs used a different script. Treat anything under
about 100 milliseconds as not meaningful.

15.8 The earlier measurement, of the first token only, on 9 and 10 September
2026, kept because it covers models the new run does not:

| Model | Middle value | High value |
|---|---|---|
| Gemini 2.5 Flash Lite | 415 ms | 487 ms |
| Gemini 2.5 Flash | 529 ms | 609 ms |
| GPT-4.1 mini | 597 ms | 846 ms |
| Claude Haiku 4.5 | 740 ms | 798 ms |
| Gemini 3 Flash preview | 933 ms | 1023 ms |
| Claude Sonnet 5 | 1254 ms | 1305 ms |
| Claude Opus 5 | 3583 ms | 3620 ms |

Those rows came from six or eight samples with a new connection each time, so
trust the order of the models and not the values.

15.9 The effect of the length of the call, with Claude Haiku 4.5:

| Exchanges | Prompt tokens | Middle value | High value |
|---|---|---|---|
| 6 | 349 | 819 ms | 836 ms |
| 40 | 1083 | 795 ms | 812 ms |
| 160 | 3693 | 866 ms | 892 ms |
| 400 | 8913 | 1282 ms | 1328 ms |

That test built its history by repeating four sentences, so the map from
exchanges to tokens is rough. The shape holds: flat to about 4000 tokens, then
growing. A call inside the twelve minute hard limit stays in the flat part, which
is why the running summary was cut.

15.10 The speech-to-text was measured on a telephone band on 12 September 2026.
Each line was synthesized, passed through 300 to 3400 hertz and 8 kilohertz
μ-law, then returned to 16 kilohertz for the model. The comparison is the
narrowband transcript against the clean transcript of the same line. Comparing
against the written line instead measures how the model writes numbers, which the
codec does not touch.

| Version | Lines identical to clean | Words adrift | Transcribe time |
|---|---|---|---|
| Telephone band and μ-law | 9 of 10 | 1 | 112 to 124 ms |
| The same with noise added | 7 of 10 | 3 to 9 | 122 ms |

15.11 So the codec is not the problem. Noise is. The single narrowband difference
was the narrowband version hearing a word that the clean version dropped. The
noisy version turned "on is" into "on his", and put a word in front of a
sentence. Those are the errors that change what the caller believes it was told.

15.12 **Fixed on 17 September 2026.** The noise is now one seeded file, and the
fixtures are kept rather than made afresh. Two runs in a row then gave the same
figures: 8 of 10 lines identical and 2 words adrift, on both the narrowband and
the noisy row. The row is a threshold now.

15.12.1 The seed alone was not enough, and the reason is worth writing down:
Piper writes different audio for the same sentence on every call, so a bench
that synthesises each time measures the voice's variance too. The transcriber
itself is repeatable: the same file three times gave the same words. Only the
kept corpus makes the measurement stable, which is what 12.5 asks for.

15.13 The speech is synthetic and the line is simulated. Real speech on a real
line is layer four, and nothing here replaces it.

15.14 **The first real call was placed on 12 September 2026**, to a number Chris
owns. It dialled through the Telnyx trunk, rang for 24.6 seconds, was answered,
spoke one sentence of 5.8 seconds through the local voice, and ended. The trunk,
the caller identification, the codec and the outbound audio path all work.

15.15 That call proves less than it looks. The agent spoke first and the far end
never took a turn, so it measured nothing about turn-taking, interruption, or the
time from the far end stopping to the first sound back. The one number in 3.6
that is still an estimate is still an estimate.

15.15.1 Chris missed that call, so what answered after 24.6 seconds was his
voicemail. The script recorded a person, because it had been written to assume
one. The audio still reached a real telephone through the trunk, which is what
the test was for, but the lesson is 13.6.1: without an agent session nothing can
tell a greeting from a hello.

15.15.4 A fourth call, on 13 September 2026, held a real conversation: four
turns each way over 50 seconds. The caller opened with the line 10.1 asks for,
asked its question, took the answers and closed. So the loop works end to end on
a telephone: a person's voice, the transcriber, the brain, the voice, and back.
Two faults came out of it, both in the record rather than the call. The report
said nothing was said (11.4.1), and the trace held 88 clock entries and no
conversation, because the state machine never left `thinking`. Barge-in, the
disclosure question and an unknown fact were not tried on this call.

15.15.3 A third call was placed on 13 September 2026, this time with the brain,
the transcriber and the voice in one session. It reached a voicemail box that was
full, which announced itself and hung up after about five seconds. Two things came
out of it. The transcriber read real telephone audio correctly for the first time:
it wrote back "Sorry, the mailbox is full and there is not enough space to leave a
message." And the local end-of-turn model announced that it was not running at
all, which is 8.5. The conversation itself is still untested, because nothing on
the other end ever took a turn.

15.15.2 The call was placed again and answered. It ran 13 seconds end to end and
the process exited on its own. Chris heard the sentence and it was clear. His one
remark was about the voice itself: it works, and it could be better (see 18.12).

15.15.5 **A pause is a setting, not a cost.** The voice bridge reported 1.8
seconds of "transcription" when 1.5 of it was its own end-of-turn pause, which
made the engine look seven times slower than it is. Every measurement of a turn
starts at the real end of speech, not at the moment the system notices it, and
the pause is reported on its own line. The budget in 3.6 separates them; the
measurements in 15.16 must too.

15.15.6 Count what a barge-in turned out to be: speech, a command, or nothing.
"Nothing" is the false interruption of 7.2.4, and it is the one that costs a
sentence for no reason. The bridge counts these and this product does not.

15.15.7 **The first rehearsals, 17 September 2026** (18.15). Five runs of the real
caller against the receiver, in a local room, on synthetic briefs. Three things
came out of them.

15.15.8 The transcriber turned a coughing fit into the words "B.I.S.S. Sorry."
A hallucinated transcript passes the word test of 7.2.3, so the test that 7.4
calls the protection against noise can be defeated by the transcriber itself.
It happened once in two cough challenges.

15.15.9 The transcription delay the framework reports is 0.7 to 1.8 seconds,
against the 112 to 124 milliseconds of 15.10. The two measure different
things: 15.10 times the model on a file, and the framework times from the end of
speech to a final transcript, which includes the voice detector's wait for
silence. Replies arrived 1.7 to 2.9 seconds after the other side stopped.

15.15.10 The caller recorded up to five false interruptions in one rehearsal,
mostly while the receiver spoke in fragments. Each one resumed.

15.15.11 A rehearsal on 17 September 2026 had the caller say "I have a Visa
ending in 4417" when a receptionist asked for a card to hold a booking. The card
was a fact of the brief and was not marked releasable, and the instruction of
9.5 was in the prompt. So the prompt alone does not hold this line, and 9.5.1
takes the value out of the prompt.

15.15.12 In the same run the caller refused the card correctly but never called
the tool of 9.8.1, so the report said nothing was blocked. A sharper rule and a
sharper tool description fixed it: the next runs recorded the deferral. A
prompt change is what fixed it, so the runner of 12.8.1 is what proves it.

15.16 **Still to measure, in this order.** The whole path, end to end, on a real telephone leg. The
transport time both ways. The false-cutoff rate of v1-mini on telephone-grade
audio. The memory footprint of v1-mini. The time to the first token on a direct
route. The effect of prefix caching.

## 16. Open risks

16.1 The local tests hear clean audio. Section 15.10 shows that the compression
by itself changes almost nothing, and that noise changes the words. So the risk
is narrower than revision 4 assumed but not smaller: the fixtures must carry
seeded noise, not only the codec, or the layer two test will pass on audio that
no telephone produces. Only a real call removes this risk.

16.2 The caller can say wrong things for Chris. Section 9 holds this down, and
Section 12.3 proves it.

16.3 The v1-mini detector has no published numbers of its own.

16.4 **The host is a desktop in a house.** It sleeps. Windows restarts it. The
network drops. The GPU can be busy. A worker that dies leaves a real person
listening to silence.

16.4.1 **Decided: a dead-air watchdog.** If the agent produces no audio and no
events for a short window, the call is ended from whichever side is still alive
and the report is written from the last known state. The other party gets a clean
disconnect rather than an open line, and Chris gets a report that says the call
died rather than no report at all. The same watchdog catches a brain that hangs,
not only a host that dies. The carrier's own limit is a backstop and not an
answer: twelve minutes of silence on a stranger's telephone is a failure.

16.5 **The limits do not cap the rate.** The soft and hard limits bound one call.
The account spend limit bounds the month. Nothing bounds how many calls happen in
an hour, so a fault can dial the same person again and again. A rate limit is
needed before the first real call.

16.6 The echo path on the telephone leg. A speakerphone at the other end can send
the agent its own voice. The word test in 7.2.3 is the protection. Only a real
call proves it.

16.7 A new telephone number has no history and a carrier can mark it.

16.8 The framework has open faults in exactly the area this product depends on.
One report says turn detection is too sensitive and the agent cuts in on the user.
Another says resume after a false interruption is broken. Test both in this
product; do not assume the framework behavior.

16.9 The call brief holds personal data and has no home, no owner and no check
that it is right. Nothing stops a wrong brief from being spoken to a stranger.
Decide this before the first real call (see Section 18.3).

16.10 **Two products now want one card.** The voice bridge runs as a service and
holds the speech engines this product reuses (2.7). Both want the same card and
the same models directory. Decide whether the caller starts its own pair of
workers or shares the bridge's, before a call and a voice session can overlap
(see Section 18.10).

## 17. Constants

17.1 Every value below is a constant, not a setting. Revision 3 made twelve of
them settings and then said each default was a guess. A value becomes a setting
when a measurement earns it, and not before.

17.2 The framework values were read from `@livekit/agents` 1.8.1 on 12 September
2026 and are written down here, because a default that is not written down is a
dependency that can move without notice.

| Constant | Value | Source | Section |
|---|---|---|---|
| Interruption, least length | 500 ms | `turnHandling.interruption.minDuration` | 7.2.2 |
| Interruption, least words | **2** | framework says 0; raised on purpose | 7.2.3 |
| False interruption timeout | 2000 ms | `turnHandling.interruption.falseInterruptionTimeout` | 7.2.4 |
| Resume after a false interruption | On | `turnHandling.interruption.resumeFalseInterruption` | 7.2.5 |
| Endpointing, least delay | 500 ms | `turnHandling.endpointing.minDelay` | 8.7 |
| Endpointing, most delay | 3000 ms | `turnHandling.endpointing.maxDelay` | 8.7 |
| Voice detector silence floor | 200 ms | the detector's own `MIN_SILENCE_DURATION_MS` | 8.7 |
| Detector sample rate | 16 kHz | the detector's own `DEFAULT_SAMPLE_RATE` | 12.5 |
| Opening line that says the caller is an assistant | On | this product | 10.1 |
| Audio recording, with its announcement | Off | this product | 10.6 |
| Soft call limit | 8 minutes | this product | 11.2 |
| Hard call limit | 12 minutes | this product | 11.3 |
| Calls in an hour | 6 | this product | 16.5 |

17.3 **One departure from a default, on purpose, and now two words.** The
framework asks for zero words before an interruption counts, so sound alone
stops the agent. Clause 7.4 makes the word test the defence against a
speakerphone feeding the agent its own voice. One word was not enough: the
transcriber turned a coughing fit into "B.I.S.S. Sorry." (15.15.8), and a
hallucination of one or two words passes a one-word test. Two words is the
setting from 17 September 2026. The cost is real and small: a genuine one-word
barge-in ("Stop!") is treated as a false interruption, so the sentence resumes
over the other party, and a real interruption waits for a second word. Every
form of the question in 10.2 is longer than two words.

17.3.1 **The hourly limit is 6.** Nothing else bounds repetition: the carrier
caps one call and the day's spend, and the hard limit caps one call, but a fault
that redials after each failure can ring the same stranger many times inside
that budget. The limit protects the person who is called.

17.4 Two figures disagree between the vendor's prose and its code. The
documentation says the detector needs a voice detector with a silence floor of
250 milliseconds; the code says 200. The table follows the code.

17.5 The flat options this product first read — `minInterruptionDuration`,
`minEndpointingDelay` and their neighbours — are deprecated in 1.8.1 in favour of
the `turnHandling` object. Use the object.

## 18. Open points

18.1 The speech-to-text model and the voice are settled by reuse (2.7). `small.en` survives the codec (15.10). What is open is whether it survives real speech with real noise, and whether a larger model earns its cost there.
18.2 **Decided.** A full local user interface composes the brief and starts the
call. HTML mockups come before any of it is built.
18.3 **Decided.** The brief lives in the user interface and is not stored. It is
composed, shown back, and passed to the call. Nothing about a brief outlives the
call it was written for.

18.2.1 **Decided, and replaced on 17 September 2026.** The mockup is one
clickable file, `design/voiceover.html`, in the Control Room direction: the brief
is a rundown that locks on air, the call is a programme feed with each reply
timed, and the report is an as-run log. `PRODUCT.md` holds the product truth
and `DESIGN.md` the visual system. The earlier canvas mockups are deleted.

18.3.1 **Decided.** The brief holds key-value facts and one optional free-text
background field. Key-value is the primary shape, because Section 9 must be
decidable and 9.5 marks a single field releasable: you cannot mark half a
sentence. The background field carries the nuance that has no field shape, such
as "travelling the first week of the month". It is a fact of the brief under
9.2, so the caller may state it; it is never the place for a number that 9.5
governs.

18.4 Confirm the caller identification level that Telnyx gives a pay-as-you-go account. The number was bought from Telnyx on 12 September 2026, which is the condition for the highest level, but the level itself is unconfirmed.
18.5 **In hand.** The rule in 10.10 rests on secondary sources. The February 2024
FCC declaratory ruling, the TCPA text it reads, and the California recording
statute are to be read directly and written up, so the rule rests on a citation
rather than on a summary of a vendor's marketing page. That write-up is not legal
advice and does not pretend to be.
18.6 **Decided.** A report stays in `~/.voiceover/reports`, as JSON beside a
readable summary, and the user interface lists them. A report older than 30 days
is deleted. That gives 10.9 a rule rather than an intention: the other party's
words do not accumulate on a desktop forever.
18.7 Other users are out of scope. Revisit only when a second user exists.
18.8 **Decided.** Keep the test personalities of the earlier version and delete
its orchestrator. The personalities are content that 12.9 needs whatever shape
the tests take. The orchestrator is the part 2.4 says failed and 12.8 has already
demoted.
18.9 Find out why the telephone account of the earlier version was closed, before the new account is opened on the same identity.
18.10 **Decided.** The caller starts its own speech engines. Two copies cost
about 3.6 gigabytes of a 12 gigabyte card, which is spare. A call then never
depends on the bridge running, and neither product can break the other by
restarting.
18.11 **Decided.** No carrier lookup. The dialing path believes what the user
interface says a line is. So the gate of 10.10 is as good as the typing, and a
mistyped line type is the fault it cannot catch. Revisit if a wrong number is
ever dialled.
18.12 **Decided.** Kokoro on the card, and not the voice the bridge speaks with.
The bridge measured Kokoro at 121 to 164 milliseconds for a first sentence
against Piper's hundred, for about 800 megabytes of the card, so the better voice
costs nothing in the number that matters. All 54 voices sit in one pack, so the
choice is a name. Chris picks from candidates rendered through the telephone band
of 12.5, because a voice that is pleasant at 22 kHz can lose what makes it
pleasant at 8.

18.12.1 Kokoro needs its own virtual environment. Its onnxruntime wants the CUDA
13 wheels and ctranslate2, which carries the speech-to-text, wants the CUDA 12
ones, and both unpack into the same directory.

18.12.2 The caller does not speak with the bridge's voice. One voice for the
assistant that talks to Chris and another for the one that talks for him keeps it
clear whose voice is whose.

18.12.3 **Built on 17 September 2026.** The caller speaks with Kokoro.
`VOICEOVER_KOKORO_VOICE` names the voice and `am_michael` is the default until
Chris picks by ear; `bun scripts/voices.ts` renders each candidate twice, as it
comes and through the telephone band of 12.5, because a voice that is pleasant
at 24 kHz can lose what makes it pleasant at 8. `VOICEOVER_TTS=piper` returns to
the bridge's voice. Kokoro made that sentence in 190 to 220 milliseconds.
18.14 **Decided. The caller runs as a framework worker.** 8.5 is the finding: a
standalone session never loads the local end-of-turn model and commits turns on a
clock instead. A worker is a daemon that receives a job and joins a room, so the
dial becomes a separate step that creates the room and dispatches to it. That is
the framework's own shape and it restores 8.4.

18.14.3 **Built on 17 September 2026.** `src/call/agent.ts` is the job:
`bun src/call/agent.ts dev` registers a worker named `caller`, and the user
interface starts one for each deployment it needs, the local server for a
rehearsal and the cloud project for a real call. A dispatch carries the whole
call in its metadata: the brief, where to post what happens, where the report
goes, and whose audio to listen to. The job writes the report itself, from local
state, which is what 11.4 asks for. A command reaches the job as a data message
on the room, which is how the console hangs up, how a rehearsal moves the clock,
and how it names an ending only the rehearsal knows.

18.14.4 Two findings from building it, both about identity. A job joins as
`agent-<job id>`, not as a name this product chooses, so nothing may wait for a
participant called "caller". And the framework accepts a standard, SIP or
connector participant by default, never an agent, so the test receiver heard
silence until its `participantKinds` included `AGENT`. Neither is written down
in the vendor's guide.

18.14.2 An attempt on 17 September 2026 to load the local model inside a
standalone session failed on purpose: the detector reads the inference executor
off the framework's job context, and the executor and the context can only be
built from parts the package does not export. Faking them would break on the
next release. So 18.14 stands, and the worker model is the way to 8.4.

18.14.1 The bridge ships a fixed 1.5 second pause and a road test of it felt
good, so a clock is not unusable in itself. The judgement is that a stranger on a
business line is less patient than Chris in his own car, and that a model reading
the words and the prosody beats a clock on a line where the other party is not
expecting a machine.

18.15.4 **On air dials from the user interface, from 17 September 2026.** TAKE
sends the rundown to the server, which checks the gate of 10.10 and the rate
limit of 16.5 against the real count, dispatches the caller's job to the cloud
project, and then dials the number through the trunk of 13.5. The page shows the
same feed, lamps and report as a rehearsal, because both come from the same
bridge. HANG UP is a command to the job. Nothing about this path has been tried
on a telephone yet.

18.15.5 **The log reads what is on disk.** `~/.voiceover/reports` and
`~/.voiceover/rehearsals`, newest first. A report older than 30 days is deleted
when the list loads, which gives 18.6 its mechanism rather than an intention.

18.15 **Decided. Layer three exists, and the user interface drives it.**
`bun scripts/ui.ts` serves `design/voiceover.html` on port 3002, and its Rehearsal
view runs the real caller of `src/call/session.ts` against a test receiver in a
local room. The receiver has its own transcriber, a Kokoro voice so it never
sounds like the caller, and Gemini 2.5 Flash (4.9). It plays one of the eight
personalities kept by 18.8, or a voicemail machine, or a menu system (12.9).
Chris steers it with challenges (a machine question, a fact the brief lacks, a
card number, talking over, a cough, silence, hold music, a transfer, the soft
limit, a hang up) or types its words himself, and listens in from the browser.
Reports go to `~/.voiceover/rehearsals`, never beside real calls. On air and the
log in the page are still simulated.

18.15.1 The local LiveKit server runs in Docker on port 7890, not 7880,
because the voice bridge's own server holds 7880 with its own keys. Neither
product uses the other's server, for the reason 18.10 gives for the engines.

18.15.2 A challenge takes the floor: the receiver stops hearing, drops what it
had queued, and says fixed words that cannot be interrupted. A reply generated
from an instruction was swallowed by the receiver's own next turn, and a test
that sometimes does not happen proves nothing.

18.15.3 **Fixed on 17 September 2026.** Both paths share one bridge,
`src/call/bridge.ts`: it tells the state machine about each turn after the
framework has handled it, collects what the report needs, and writes the report.
The disclosure debt of 10.4 now clears on a real call as it does in a rehearsal,
and `scripts/call.ts` also closes on the soft limit instead of only logging it.

18.16 **Decided. Every prompt an agent reads is editable in the user
interface**, at Chris's request on 17 September 2026. That covers the caller's
brief, its Section 9 rules, its manner and its soft-limit close; the receiver's
frame, its tool descriptions, each personality and greeting; and the words each
challenge says. `src/prompts.ts` holds the defaults. An edit is saved to
`~/.voiceover/prompts.json` and takes effect at the next rehearsal or call, never
inside one. The disclosure rules of 10.1 and 10.2 are shown and never edited,
because 10.3 forbids a setting that turns them off, and they are always the last
thing the caller reads, so no edit above them can outrank them.

18.16.1 An edit to the Section 9 rules changes what 9.9 calls the only logic
the framework does not supply. The editor warns when a template loses a
placeholder, and the rehearsal is where an edit is proved before a real call.

18.13 **Decided.** The pipeline uses the framework's `SentenceTokenizer`, because
the TTS stream adapter takes one and a second rule inside the same call would
split the same reply two ways. `src/speech/sentences.ts` stays as the benchmark's
rule, which is what 15.3 was measured with, and is not wired into a call. If the
framework's rule splits very differently, 15.3 needs measuring again with it.
