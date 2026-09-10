# Outbound Call Agent — Product Specification

Written in ASD-STE100 Simplified Technical English.
Feature level only. No code.
Date: 10 September 2026. Third revision.

Source of the first revision: Google Doc
`Outbound Call Agent — Product Specification (ASD-STE100)`,
<https://docs.google.com/document/d/1kym06wi7s1LWctCGsDNDk2x_KlwuDdhItl_FL1qfPps/edit>.
This file is the live copy. The Google Doc is the history.

This document is the specification for a personal outbound call agent. It gives
the purpose, the background, the settled design decisions, the shared
conversation core, the behavior knobs, the caller and receiver layers, the test
plan, the technology choices, the build order, the measurements, and the risks.
The document builds on prior work in the voice bridge specification.

**What changed in the third revision.** Disclosure and recording are decided
(Section 9). The call limits and the context cap are decided (Section 10). Two
items left the build: the transport handles the tones of a menu, and the
framework detects a voicemail machine. The test fixtures move to telephone-grade
audio (Section 11.5). Every setting and its default are in one table
(Section 16). Clause 7.6 of the second revision was wrong and is corrected.

## 1. Purpose

1.1 The outbound call agent makes telephone calls for Chris.
1.2 Chris uses the agent when he wants to make a call but does not want to make it himself.
1.3 The agent holds a real, open conversation. The agent does not read a fixed script.
1.4 The agent has a goal for each call. The agent works toward that goal.
1.5 The agent reports the result of the call back to Chris.
1.6 The product is for personal use. A small number of other people can use it too.
1.7 Chris builds this product himself. Chris does not use an off-the-shelf product.

## 2. Background and reasoning

2.1 An earlier version of this product did not work well in practice.
2.2 The earlier version used a hosted brain with separate speech-to-text and speech-to-speech services in a chain. The chain gave bad latency.
2.3 The earlier version handled interruptions poorly.
2.4 The earlier version was hard to test. The test used receiving agents that were an afterthought. The receiving agents stepped on each other. The system gave poor visibility into what happened.
2.5 The earlier version was costly to test. The test used a paid speech service, a paid telephone service, and the brain, all at the same time, on every test.
2.6 The industry has moved away from the chain that gives bad latency. The industry streams every stage and does not wait for a complete output before the next stage starts. Done this way, the same chain gives low latency.

2.7 **Correction, made in the second revision.** The first revision said that Chris
already runs speech-to-text and speech-to-speech on a local card. This is not true
today. The machine holds no speech model. The voice bridge specification chooses a
local speech engine but still lists the voice as an open point. So the two speech
ends are decided, not built. This product must install them.

2.8 The card is an NVIDIA RTX 5070 with 12 gigabytes of video memory. The machine
has 30 gigabytes of system memory. The voice bridge specification assumes 8
gigabytes of video memory, so it understates the headroom. A small speech-to-text
model and a local neural voice fit on this card together.

2.9 Nothing carries over from the earlier version. The telephone account of the
earlier version is closed. The model account of the earlier version is disabled.
Both were checked on 9 September 2026 and both refuse authentication. So every
account in this product is new.

## 3. Latency model

3.1 Startup latency is acceptable. Chris can wait 15 to 20 seconds to start the agent before a call.
3.2 Per-turn latency is the real target. The person on the other end must not hear a gap that sounds like a dropped call.
3.3 The target for per-turn latency is under about one and a half seconds to first audio, after the person stops speaking.
3.4 The system reaches this target by streaming. The speech-to-text streams partial words. The brain streams the first tokens. The speech-to-speech starts to speak the first sentence while the rest is made.

3.5 The budget for one turn has four parts. Section 14 gives the measurements.

| Part | Time | Status |
|---|---|---|
| End-of-turn detection, after the last speech | 300 to 600 ms | Set by a knob |
| Brain, to the first token | 740 to 870 ms at the middle value | Measured |
| Speech-to-speech, to the first audio | 100 to 250 ms | Estimate. To measure |
| Transport, both ways | 50 to 150 ms | Estimate. To measure |

3.6 The target of 1.5 seconds holds only at the fast end of the detection knob.
At the slow end the turn takes about 1.8 seconds. This is the main tension in the
product: a slow detector cuts in less often but sounds slower.

3.7 The main latency risk is the brain time to first token, and a weak network. This risk gives an occasional slow turn, not a constant delay.

3.8 The brain gets slower as the call gets longer, because each turn sends the
whole conversation again. Section 10 caps the conversation for this reason.

## 4. Architecture decision

4.1 The product uses a three-stage pipeline. The stages are speech-to-text, then the brain, then speech-to-speech.
4.2 The product does not use a single speech-to-speech model. The reason is control. The agent speaks for Chris and must be steerable and must support tool use. Control matters more than the lowest possible latency.
4.3 The local card does the speech-to-text and the speech-to-speech.
4.4 The brain is a hosted model over a streaming interface.
4.5 The brain does not run on the local card. So the small card is enough, and the card memory limit does not matter.

4.6 **The brain is Claude Haiku 4.5.** The middle value of the time to the first
token is 740 to 870 milliseconds, which fits the budget in Section 3.5. The model
keeps tool use and takes instruction well. The larger Claude models do not fit:
Sonnet 5 measures 1254 milliseconds and Opus 5 measures 3583 milliseconds, so both
break the target by themselves.

4.7 The route to the brain is OpenRouter, because that key works today. A direct
key at the model vendor removes one network hop. Measure the direct route before
you decide that the budget is tight (see Section 14.7).

4.8 The test receivers use a cheaper and faster model, for example Gemini 2.5
Flash Lite at 415 milliseconds. A test receiver does not speak for Chris, so it
does not need the same care.

## 5. The shared conversation core

5.1 The caller and the receiver share the same internals for the mechanics of conversation.
5.2 The shared mechanics are: listen, detect the end of a turn, handle interruption and barge-in, speak, and stream.
5.3 The caller and the receiver are not identical. Each is a thin layer on top of the shared core.
5.4 The caller layer holds the goal of the call, the background information, and the special behavior. The special behavior includes: drive toward the goal, leave a message on a voicemail machine, get through a menu system, and handle a transfer.
5.5 The receiver layer holds the behavior of the person who answers. In a test, the receiver layer holds a test personality.
5.6 The purpose is reuse of the hard conversation mechanics. The purpose is not to make the two agents the same.

## 6. Behavior knobs

6.1 Personality is a set of behavior knobs on the shared core. Personality is not a surface layer on top.
6.2 The knobs reach into the mechanics.

6.3 There are five knobs. Each knob is a real parameter of the core. Section 16 gives the defaults.

| Knob | What it sets |
|---|---|
| Silence floor | The shortest silence that the voice detector reports. The detector needs at least 250 ms |
| Endpointing delay | The wait after the detector reports the end of a turn, before the agent speaks |
| Detector threshold | The confidence at which the end-of-turn model calls the turn finished |
| Barge-in floor | The shortest speech that stops the agent's playback (see Section 15.6) |
| Speech pace | The speed of the spoken output, and the length of the sentences the agent makes |

6.4 The knobs serve two purposes.
6.5 First purpose: adversarial test receivers. A test receiver is impolite by design. This removes the risk that two agents with the same turn detection wait for each other too politely.
6.6 Second purpose: real tuning of the caller. A patient caller and a brisk caller give different call results. The knobs tune how Chris comes across.
6.7 So the caller and the receiver are each a set of: the core, plus knob values, plus intent.

## 7. End of turn detection

7.1 End of turn detection decides when the other party has finished speaking.
7.2 This is the hard problem of the product.
7.3 A simple method waits for a fixed length of silence. This method is not good enough. It cuts in on a slow talker, or it waits too long.
7.4 The product uses a method that also looks at the content of the speech, not only the silence.

7.5 **The method is the LiveKit Turn Detector, audio model v1-mini.** The model
reads the audio directly. The model joins what the person says to how the person
says it, and gives one prediction. The model does not wait for a transcript, so it
removes the transcription delay from the hot path.

7.6 **Correction.** The second revision said that this model needs less than 500
megabytes of memory. That figure belongs to the older text detector, which reads a
transcript and is deprecated. The memory footprint of the audio v1-mini model is
not published. Measure it.

7.7 The audio model runs on the local processor. It has no per-use cost. It is
part of the agent framework, so it needs no separate package. So it agrees with
the rule in Section 12.7 that the hot path holds no paid network call.

7.8 The model needs a voice detector under it, with a silence floor of at least
250 milliseconds.

7.9 The full v1 model, which runs only on the vendor cloud, reports a false-cutoff
rate of 9.9 percent at a 300 millisecond budget and 4.5 percent at a 600
millisecond budget. The v1-mini model is the pruned and quantized form of the same
model, so expect a worse rate. Measure the rate on telephone-grade audio, not on
clean audio (see Section 11.5).

7.10 The code is Apache-2.0. The weights are under the vendor model licence.
Personal use is permitted. Read the licence again before you give the product to
another person.

7.11 The knobs in Section 6.3 adjust this detector per personality.

## 8. Safe behavior on an unknown

8.1 The caller speaks for Chris. A wrong fact said with confidence is the worst failure of this product. It is worse than a failed call.

8.2 The caller may state only the facts in the call brief. Every other fact is unknown.

8.3 The caller does not guess. The caller never invents a date, a number, a spelling, an address, or a name.

8.4 On an unknown, the caller says one short line: it does not have that detail, and it will check and come back. The caller then returns to the goal.

8.5 The caller does not give a payment detail, a card number, a date of birth, an account number, or a government number, unless the call brief marks that field as releasable.

8.6 The caller does not agree to a price, a fee, or a commitment that the call brief does not permit.

8.7 If the other party needs an unknown fact to continue, the caller ends the call politely and offers a callback or a text message. The caller does not hold the line and it does not improvise.

8.8 The caller reports every blocked item to Chris with the call result.

8.9 One test personality asks for facts that the brief does not hold. This makes the layer three test catch an invented fact (see Section 11.9).

## 9. Disclosure and recording

9.1 The caller opens with a line that says it is an assistant that calls for Chris.
This opening line is a setting. Chris can turn it off.

9.2 Two rules are not settings. First, the caller answers the direct question
truthfully and at once: if a person asks whether it is a machine or an artificial
intelligence, the caller says yes. Second, the caller never says that it is Chris.

9.3 The reason for 9.2 is that a setting which turns off these two rules is an
instruction to lie. The product does not hold such a setting.

9.4 Audio recording is off. The product keeps the text transcript that the
speech-to-text already makes. The product does not keep the audio.

9.5 Recording is a setting. If Chris turns recording on, the caller says in its
first sentence that it records the call. The two always move together. The product
does not record without the announcement.

9.6 The reason for 9.4 and 9.5 is the law of the state, which asks every party to
agree before a private conversation is recorded. A transcript with no audio, and a
recording that is announced, both stay clear of the question.

9.7 The first calls go to the published line of a business. Before the caller
dials a mobile telephone or a home telephone, get a legal check. The rules that
govern an artificial voice on those lines are stricter, and this document is not
legal advice.

## 10. Call limits and context

10.1 A call has two limits. Section 16 gives the defaults. Both are settings.

10.2 The soft limit starts the close. At the soft limit the caller stops working
toward the goal. It states where things stand, it offers a callback, and it ends
the call politely.

10.3 The hard limit cuts the call. The hard limit is the protection against a
fault that will not end.

10.4 The caller always writes the report, at either limit. A report from the hard
limit says that the call was cut. The caller never drops the line in the middle of
a sentence with no report.

10.5 The caller does not carry the whole conversation to the brain. It carries the
call brief, the last few exchanges in full, and a running summary of the rest.

10.6 The number of exchanges kept in full is a setting. The size at which the
summary starts is a setting.

10.7 The reason is Section 14.4. The time to the first token is flat up to about
4000 tokens of input, and then it grows. The default summary point sits at that
knee.

10.8 The call brief does not change during a call. So the brief is marked as a
prefix that the model provider can cache. This lowers the cost, and it can lower
the time to the first token. Measure the effect (see Section 14.7).

## 11. Test plan

11.1 The test plan gets most of the build effort. Testing was the hardest part of the earlier version.
11.2 The test plan has separable layers, so a failure points to one layer.
11.3 Layer one: conversation logic. This is tested in text, below the audio, with simulated timing. The test injects events, for example "the user started to speak at time A and went silent at time B". The test asserts what the agent does. This test is repeatable and gives readable traces.
11.4 Layer two: the audio pipeline. This is the speech-to-text, the speech-to-speech, and the barge-in. This is tested with recorded audio, not a live second agent.

11.5 **The fixtures are telephone-grade.** Record at 16 kilohertz. Then pass the
recording through 8 kilohertz μ-law and back. Every audio test then runs on the
same codec as a real call. A test on clean microphone audio gives a good result
that the telephone line does not repeat.

11.6 Choose the speech-to-text model by measuring it on those fixtures. Do not
choose it from a public leaderboard, because the leaderboards use wide-band audio.

11.7 Layer three: the heavily-integrated local test. Two agents talk to each other with the real speech-to-text, the real brain, the real speech-to-speech, and real barge-in. This test does not use the telephone network. The agents pass audio to each other directly. This test is nearly free and exercises almost everything that has bugs.
11.8 Layer four: the real end-to-end test. This test uses the telephone service and a real call. This test checks the telephone transport, the echo path, and the caller identification, which layer three cannot check. This test runs rarely.
11.9 Test personalities give the challenge. The personalities include: a slow talker, an old-sounding person, a quiet person, a rambler, a person who trails off, a person who says "uh-huh" in the middle and does not mean they are done, a person who asks for facts the brief does not hold, a voicemail machine, and a menu system.
11.10 A test personality gets its character from behavior and timing, through the knobs, not from a premium voice.
11.11 The telephone service is only a transport. Two agents do not need the telephone network to talk to each other.
11.12 The local test uses a cheap or local speech-to-speech for the test agents. The paid, high-quality voice is only for the real call.

11.13 **How to pay for layer four.** The layer four test calls a second number that
Chris owns. No other person answers. The cost is the number rent and the minutes.
At Telnyx rates this is $1.00 each month, plus $0.005 for each outbound minute.
Twenty test calls of three minutes cost about 30 cents. So the money is not a
reason to run layer four less often. The reason is that layer four is slow and
gives a narrow result.

11.14 Layer four runs at three moments: before the first real call, after a change
to the audio pipeline, and after a change to the transport. It does not run on
every commit.

11.15 The Telnyx account holds a spend limit. The agent holds the hard call limit
from Section 10.3. The two limits together cap a fault that dials again and again.

## 12. Technology choices

12.1 The transport for real-time audio uses LiveKit over WebRTC, as in the voice bridge. Do not build the transport by hand.
12.2 The speech-to-text and the speech-to-speech run locally on the card. They are not installed yet (see Section 2.7).
12.3 The brain is Claude Haiku 4.5 over a streaming interface (see Section 4.6).
12.4 The end-of-turn model is the LiveKit Turn Detector v1-mini, on the local processor (see Section 7.5).
12.5 **The telephone service is Telnyx.** LiveKit lists Telnyx as a tested provider. The outbound rate is half the rate of the nearest competitor, the number costs $1.00 each month, and the platform fee is zero. Chris buys the number from Telnyx, so the number carries the highest caller identification level from the first call. The service is a transport for the layer four test and the real call only.

12.6 **The transport owns the tones and the machine detection.** The framework
sends the tones of a menu, it detects a menu and works through it, and it says
whether a person, a voicemail machine, a menu, or a dead line answered. This
product configures these features. This product does not build them.

12.7 Nothing but the brain makes a paid network call on the hot path.

## 13. Build order

13.1 Build the shared conversation core first.
13.2 Build the text-level conversation-logic test second, with simulated timing.
13.3 Install the local speech-to-text and the local speech-to-speech third.
13.4 Build the audio pipeline fourth, with telephone-grade fixtures (see Section 11.5).
13.5 Build the heavily-integrated local test fifth, with two agents and no telephone network.
13.6 Add the caller layer and the receiver layer sixth. The disclosure rules of Section 9 and the limits of Section 10 land with the caller layer.
13.7 Add the behavior knobs and the test personalities seventh.
13.8 Add the Telnyx transport and the real end-to-end test last. Configure the tones and the machine detection here, not earlier.

## 14. Measurements

14.1 The time to the first token was measured on 9 September 2026. The method sent
a call brief of about 600 tokens and a conversation of six turns, streamed the
reply, and timed the first token of content. Each model ran eight times. The route
was OpenRouter.

| Model | Middle value | High value |
|---|---|---|
| Gemini 2.5 Flash Lite | 415 ms | 487 ms |
| Gemini 2.5 Flash | 529 ms | 609 ms |
| GPT-4.1 mini | 597 ms | 846 ms |
| **Claude Haiku 4.5** | **740 ms** | **798 ms** |
| Gemini 3 Flash preview | 933 ms | 1023 ms |
| Claude Sonnet 5 | 1254 ms | 1305 ms |
| Claude Opus 5 | 3583 ms | 3620 ms |

14.2 The suite ran two times for most models. The two runs agree within 60
milliseconds. So the numbers are repeatable.

14.3 The effect of the length of the call was measured on 10 September 2026, with
Claude Haiku 4.5 and the same brief. Each row ran six times.

| Exchanges | Prompt tokens | Middle value | High value |
|---|---|---|---|
| 6 | 349 | 819 ms | 836 ms |
| 40 | 1083 | 795 ms | 812 ms |
| 160 | 3693 | 866 ms | 892 ms |
| 400 | 8913 | 1282 ms | 1328 ms |

14.4 The time is flat up to about 4000 tokens of input, and then it grows. A call
of ten minutes is near the third row. So a normal call is safe, but a long brief,
a menu, and a transfer together can push past the knee. This is the reason for the
cap in Section 10.5.

14.5 The two measurements of the short case differ by about 80 milliseconds, one
day apart. So treat 80 milliseconds as the noise, and do not read more precision
into these numbers.

14.6 Every number includes the OpenRouter hop. The direct route was not measured,
because no direct key works today. So every number is an upper limit.

14.7 Still to measure: the time from the local voice to the first audio, the
transport time both ways, the false-cutoff rate of the v1-mini detector on
telephone-grade audio, the memory footprint of the v1-mini model, the time to the
first token on a direct route, and the effect of prefix caching on both the cost
and the time to the first token.

## 15. Open risks

15.1 The local test hears clean audio. A real call is low quality, compressed, and
has noise and cross-talk. Turn detection that is good on the local test can fail on
a real line. Section 11.5 lowers this risk but does not remove it, so the local
test must also be able to add noise and packet loss.

15.2 The caller can say wrong things for Chris. Section 8 gives the rule that holds
this risk down. The rule is a behavior, so a test must prove it (see Section 11.9).

15.3 The v1-mini detector is a smaller form of the model that has the published
numbers. Its own numbers are not published. The detector is the hardest part of the
product, so a worse rate hurts the most here.

15.4 The budget in Section 3.5 holds two estimates and two measurements. If the
local voice is slower than 250 milliseconds to the first audio, the target in 3.3
fails even with the fastest brain.

15.5 A new telephone number has no history. A carrier can mark it. The call volume
of one person is very low, so the risk is small, but an important call can still
meet a person who does not answer an unknown number.

15.6 **The echo path on the telephone leg.** The echo cancellation of the framework
belongs to the client side. A telephone leg has no such client. A speakerphone at
the other end can send the agent its own voice, and the agent can read this as an
interruption. So a barge-in must come from the end-of-turn model, never from the
raw energy of the microphone, and it must need a minimum length of speech (see the
barge-in floor in Section 6.3). Only layer four finds this fault.

15.7 The caller must handle a transfer. A transfer changes the person, and the new
person has none of the conversation. The caller starts again from the brief.

## 16. Settings and defaults

16.1 Every value below is a setting. The default is the starting point, not a
finding. Tune the first five on the layer three test.

| Setting | Default | Section |
|---|---|---|
| Silence floor | 250 ms | 6.3 |
| Endpointing delay | 400 ms | 6.3 |
| Detector threshold | The framework default | 6.3 |
| Barge-in floor | 300 ms of speech | 6.3, 15.6 |
| Speech pace | Normal | 6.3 |
| Opening line that says the caller is an assistant | On | 9.1 |
| Audio recording, with its announcement | Off | 9.4 |
| Soft call limit | 8 minutes | 10.2 |
| Hard call limit | 12 minutes | 10.3 |
| Exchanges kept in full | 20 | 10.5 |
| Size at which the summary starts | 4000 tokens | 10.7 |
| Spend limit on the telephone account | Set by Chris at the account | 11.15 |

## 17. Open points

17.1 Choose the local speech-to-text model and the local voice. The voice bridge
specification also holds this point open. Choose once, for both products. Measure
the candidates on telephone-grade fixtures (see Section 11.6).
17.2 Set the knob values for the caller, after the layer three test.
17.3 Decide how Chris starts a call and gives the call brief.
17.4 Decide where the call transcript and the call result go.
17.5 Find out why the telephone account of the earlier version was closed, before
the new account is opened on the same identity.
17.6 Confirm the caller identification level that Telnyx gives a pay-as-you-go
account, before the first important call.
