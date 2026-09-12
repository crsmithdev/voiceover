# Outbound Call Agent — Product Specification

Written in ASD-STE100 Simplified Technical English.
Feature level only. No code.
Date: 12 September 2026. Fifth revision.

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
instead (see Section 15.10).

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

8.5 The memory footprint of the audio v1-mini model is not published. Revision 2
gave a figure that belongs to the older text model. Measure it.

8.6 The model needs a voice detector under it, with a silence floor of at least
250 milliseconds. This is the same voice detector that feeds 7.2.1. There is one
detector, not two, and a change to its floor moves both the end-of-turn behavior
and the interruption behavior. Tune it as one thing.

8.7 The published false-cutoff rates of 9.9 percent at 300 milliseconds and 4.5
percent at 600 milliseconds belong to the full v1 model, which runs only on the
vendor cloud. They are not a promise for v1-mini. Measure v1-mini on
telephone-grade audio.

8.8 The code is Apache-2.0. The weights are under the vendor model licence.

## 9. Safe behavior on an unknown

9.1 The caller speaks for Chris. A wrong fact said with confidence is the worst failure of this product. It is worse than a failed call.
9.2 The caller may state only the facts in the call brief. Every other fact is unknown.
9.3 The caller does not guess. The caller never invents a date, a number, a spelling, an address, or a name.
9.4 On an unknown, the caller says one short line: it does not have that detail, and it will check and come back. The caller then returns to the goal.
9.5 The caller does not give a payment detail, a card number, a date of birth, an account number, or a government number, unless the call brief marks that field as releasable.
9.6 The caller does not agree to a price, a fee, or a commitment that the call brief does not permit.
9.7 If the other party needs an unknown fact to continue, the caller ends the call politely and offers a callback or a text message.
9.8 The caller reports every blocked item to Chris with the call result.

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
10.10 The first calls go to the published line of a business. The dialing path classifies the number before it dials, and refuses a number that is not a business line, until the check in 18.5 is done. An intention is not enough.

## 11. Call limits

11.1 A call has two limits, and both are constants (see Section 17).
11.2 The soft limit starts the close. The caller stops working toward the goal, states where things stand, offers a callback, and ends the call politely. The soft limit never cuts a sentence.
11.3 The hard limit cuts the call. It is the protection against a fault that will not end.
11.4 The report is always written, at either limit, and a report from the hard limit says the call was cut. Writing the report must not depend on the brain, because the fault that reached the hard limit can be the brain. A report written from local state is enough.
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
configures these. It does not build them. What this product builds is Section 6,
Section 9, the caller layer, and the report.

13.7 Nothing but the brain makes a paid network call on the hot path, except the
media hop through LiveKit Cloud that 13.5 accepts. Measure that hop as part of the
end-to-end time (15.14).

## 14. Build order

14.1 Build the conversation state machine of Section 6 first.
14.2 Build the layer one test second, with simulated timing. It covers Section 6, Section 7 and Section 9.
14.3 Reuse the bridge's speech engines third. Done: the first sentence, the voice and the speech-to-text on a telephone band are measured (15.3, 15.5, 15.10). What remains needs a real line.

14.4 **Make one real call fourth.** Add the Telnyx transport, the caller layer and
the report, and call a second number that Chris owns. This is the earliest point
that tests the idea of the product, which is that streaming makes the delay
acceptable. Everything after this point is improvement of a thing that works.

14.5 Build the audio fixtures and the layer two test fifth, with the numbers the real call gave.
14.6 Add the test personalities sixth.
14.7 Consider layer three last, and only if a gap remains (see 12.8).

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

15.12 The noise in that test is not seeded, so the noisy row moves between runs,
between 3 and 9 words. Replace it with a fixed noise file before anyone uses it
as a threshold.

15.13 The speech is synthetic and the line is simulated. Real speech on a real
line is layer four, and nothing here replaces it.

15.14 **Still to measure, in this order.** The whole path, end to end, on a real telephone leg. The
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
network drops. The GPU can be busy. None of this has a defined behavior yet, and
a worker that dies leaves a real person listening to silence. The product must
close the telephone leg when the worker dies, and it must tell Chris that the call
ended this way.

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

17.1 Every value below is a constant at the framework default, not a setting.
Revision 3 made twelve of them settings and then said each default was a guess.
A value becomes a setting when a measurement earns it, and not before.

| Constant | Value | Section |
|---|---|---|
| Voice detector silence floor | 250 ms | 8.6 |
| Endpointing delay | Framework default | 8.6 |
| End-of-turn threshold | Framework default | 8.4 |
| Minimum length of an interruption | Framework default | 7.2.2 |
| Minimum words of an interruption | Framework default | 7.2.3 |
| False interruption timeout | Framework default | 7.2.4 |
| Resume after a false interruption | On | 7.2.5 |
| Opening line that says the caller is an assistant | On | 10.1 |
| Audio recording, with its announcement | Off | 10.6 |
| Soft call limit | 8 minutes | 11.2 |
| Hard call limit | 12 minutes | 11.3 |
| Calls in an hour | To decide | 16.5 |

17.2 Record the framework default for each row when it is read from the framework.
A default that is not written down is a dependency that can move without notice.

## 18. Open points

18.1 The speech-to-text model and the voice are settled by reuse (2.7). `small.en` survives the codec (15.10). What is open is whether it survives real speech with real noise, and whether a larger model earns its cost there.
18.2 Decide how Chris starts a call and gives the call brief.
18.3 Decide where a call brief lives, who writes one, and what checks it before a call.
18.4 Confirm the caller identification level that Telnyx gives a pay-as-you-go account. The number was bought from Telnyx on 12 September 2026, which is the condition for the highest level, but the level itself is unconfirmed.
18.5 Get a legal check before the caller dials a mobile or a home number, and cite the recording statute in 10.8.
18.6 Decide how long a call transcript lives, and where the report goes.
18.7 Other users are out of scope. Revisit only when a second user exists.
18.8 Keep and repair the test orchestrator and personalities of the earlier version, or delete them.
18.9 Find out why the telephone account of the earlier version was closed, before the new account is opened on the same identity.
18.10 Decide whether the caller starts its own speech workers or shares the voice bridge's (see Section 16.10).
