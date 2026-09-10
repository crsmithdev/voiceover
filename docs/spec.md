# Outbound Call Agent — Product Specification

Written in ASD-STE100 Simplified Technical English.
Feature level only. No code.
Date: 9 September 2026. Second revision.

Source of the first revision: Google Doc
`Outbound Call Agent — Product Specification (ASD-STE100)`,
<https://docs.google.com/document/d/1kym06wi7s1LWctCGsDNDk2x_KlwuDdhItl_FL1qfPps/edit>.
This file is now the live copy. The Google Doc is the history.

This document is the specification for a personal outbound call agent. It gives
the purpose, the background, the settled design decisions, the shared
conversation core, the behavior knobs, the caller and receiver layers, the test
plan, the technology choices, the build order, the measurements, and the risks.
The document builds on prior work in the voice bridge specification.

**What changed in the second revision.** The four open points of the first
revision are closed. The brain is Claude Haiku 4.5. The end-of-turn method is
the LiveKit Turn Detector v1-mini. The telephone service is Telnyx. The safe
behavior on an unknown is in a new Section 8. Section 12 records the measured
latency. Clause 2.7 of the first revision was wrong and is corrected.

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

2.7 **Correction.** The first revision said that Chris already runs speech-to-text
and speech-to-speech on a local card. This is not true today. The machine holds
no speech model. The voice bridge specification chooses a local speech engine but
still lists the voice as an open point. So the two speech ends are decided, not
built. This product must install them.

2.8 The card is an NVIDIA RTX 5070 with 12 gigabytes of video memory. The machine
has 30 gigabytes of system memory. The voice bridge specification assumes 8
gigabytes of video memory, so it understates the headroom. A small Whisper-family
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

3.5 The budget for one turn has four parts. Section 12 gives the measurements.

| Part | Time | Status |
|---|---|---|
| End-of-turn detection, after the last speech | 300 to 600 ms | Set by a knob |
| Brain, to the first token | 740 ms at the middle value | Measured |
| Speech-to-speech, to the first audio | 100 to 250 ms | Estimate. To measure |
| Transport, both ways | 50 to 150 ms | Estimate. To measure |

3.6 The target of 1.5 seconds holds only at the fast end of the detection knob.
At the slow end the turn takes about 1.8 seconds. This is the main tension in the
product: a slow detector cuts in less often but sounds slower.

3.7 The main latency risk is the brain time to first token, and a weak network. This risk gives an occasional slow turn, not a constant delay.

## 4. Architecture decision

4.1 The product uses a three-stage pipeline. The stages are speech-to-text, then the brain, then speech-to-speech.
4.2 The product does not use a single speech-to-speech model. The reason is control. The agent speaks for Chris and must be steerable and must support tool use. Control matters more than the lowest possible latency.
4.3 The local card does the speech-to-text and the speech-to-speech.
4.4 The brain is a hosted model over a streaming interface.
4.5 The brain does not run on the local card. So the small card is enough, and the card memory limit does not matter.

4.6 **The brain is Claude Haiku 4.5.** The middle value of the time to the first
token is 740 milliseconds, which fits the budget in Section 3.5. The model keeps
tool use and takes instruction well. The larger Claude models do not fit: Sonnet 5
measures 1254 milliseconds and Opus 5 measures 3583 milliseconds, so both break
the target by themselves.

4.7 The route to the brain is OpenRouter, because that key works today. A direct
key at the model vendor removes one network hop. Measure the direct route before
you decide that the budget is tight (see Section 12.5).

4.8 The test receivers use a cheaper and faster model, for example Gemini 2.5
Flash Lite at 415 milliseconds. A test receiver does not speak for Chris, so it
does not need the same care.

## 5. The shared conversation core

5.1 The caller and the receiver share the same internals for the mechanics of conversation.
5.2 The shared mechanics are: listen, detect the end of a turn, handle interruption and barge-in, speak, and stream.
5.3 The caller and the receiver are not identical. Each is a thin layer on top of the shared core.
5.4 The caller layer holds the goal of the call, the background information, and the special behavior. The special behavior includes: drive toward the goal, detect a voicemail machine and leave a message, handle a menu system, and handle a transfer.
5.5 The receiver layer holds the behavior of the person who answers. In a test, the receiver layer holds a test personality.
5.6 The purpose is reuse of the hard conversation mechanics. The purpose is not to make the two agents the same.

## 6. Behavior knobs

6.1 Personality is a set of behavior knobs on the shared core. Personality is not a surface layer on top.
6.2 The knobs reach into the mechanics.

6.3 There are four knobs. Each knob is a real parameter of the core.

| Knob | What it sets |
|---|---|
| Silence floor | The shortest silence that the voice detector reports. The detector needs at least 250 ms |
| Endpointing delay | The wait after the detector reports the end of a turn, before the agent speaks |
| Detector threshold | The confidence at which the end-of-turn model calls the turn finished |
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

7.5 **The method is the LiveKit Turn Detector, model v1-mini.** The model reads
the audio directly. The model joins what the person says to how the person says
it, and gives one prediction. The model does not wait for a transcript, so it
removes the transcription delay from the hot path.

7.6 The model runs on the local processor inside the agent process. It needs less
than 500 megabytes of memory. It has no per-use cost. So it agrees with the rule
in Section 10 that the hot path holds no paid network call.

7.7 The model needs a voice detector under it, with a silence floor of at least
250 milliseconds.

7.8 The full v1 model, which runs only on the vendor cloud, reports a false-cutoff
rate of 9.9 percent at a 300 millisecond budget and 4.5 percent at a 600
millisecond budget. The v1-mini model is the pruned and quantized form of the
same model, so expect a worse rate. Measure the rate (see Section 12.5).

7.9 The code is Apache-2.0. The weights are under the vendor model licence.
Personal use is permitted. Read the licence again before you give the product to
another person.

7.10 The knobs in Section 6.3 adjust this detector per personality.

## 8. Safe behavior on an unknown

8.1 The caller speaks for Chris. A wrong fact said with confidence is the worst failure of this product. It is worse than a failed call.

8.2 The caller may state only the facts in the call brief. Every other fact is unknown.

8.3 The caller does not guess. The caller never invents a date, a number, a spelling, an address, or a name.

8.4 On an unknown, the caller says one short line: it does not have that detail, and it will check and come back. The caller then returns to the goal.

8.5 The caller does not give a payment detail, a card number, a date of birth, an account number, or a government number, unless the call brief marks that field as releasable.

8.6 The caller does not agree to a price, a fee, or a commitment that the call brief does not permit.

8.7 If the other party needs an unknown fact to continue, the caller ends the call politely and offers a callback or a text message. The caller does not hold the line and it does not improvise.

8.8 The caller reports every blocked item to Chris with the call result.

8.9 One test personality asks for facts that the brief does not hold. This makes the layer three test catch an invented fact (see Section 9.5).

## 9. Test plan

9.1 The test plan gets most of the build effort. Testing was the hardest part of the earlier version.
9.2 The test plan has separable layers, so a failure points to one layer.
9.3 Layer one: conversation logic. This is tested in text, below the audio, with simulated timing. The test injects events, for example "the user started to speak at time A and went silent at time B". The test asserts what the agent does. This test is repeatable and gives readable traces.
9.4 Layer two: the audio pipeline. This is the speech-to-text, the speech-to-speech, and the barge-in. This is tested with recorded audio, not a live second agent.
9.5 Layer three: the heavily-integrated local test. Two agents talk to each other with the real speech-to-text, the real brain, the real speech-to-speech, and real barge-in. This test does not use the telephone network. The agents pass audio to each other directly. This test is nearly free and exercises almost everything that has bugs.
9.6 Layer four: the real end-to-end test. This test uses the telephone service and a real call. This test checks only the telephone transport, which layer three cannot check. This test runs rarely, because it is the most costly and the telephone transport is the least likely part to fail.
9.7 The telephone service is only a transport. Two agents do not need the telephone network to talk to each other.
9.8 The local test uses a cheap or local speech-to-speech for the test agents. The paid, high-quality voice is only for the real call.
9.9 Test personalities give the challenge. The personalities include: a slow talker, an old-sounding person, a quiet person, a rambler, a person who trails off, a person who says "uh-huh" in the middle and does not mean they are done, and a person who asks for facts the brief does not hold.
9.10 A test personality gets its character from behavior and timing, through the knobs, not from a premium voice.

9.11 **How to pay for layer four.** The layer four test calls a second number that
Chris owns. No other person answers. The cost is the number rent and the minutes.
At Telnyx rates this is $1.00 each month, plus $0.005 for each outbound minute.
Twenty test calls of three minutes cost about 30 cents. So the money is not a
reason to run layer four less often. The reason is that layer four is slow and
gives a narrow result.

9.12 Layer four runs at three moments: before the first real call, after a change
to the audio pipeline, and after a change to the transport. It does not run on
every commit.

9.13 The Telnyx account holds a spend limit. The agent holds a hard limit on the
length of one call. The two limits together cap a fault that dials again and
again.

## 10. Technology choices

10.1 The transport for real-time audio uses LiveKit over WebRTC, as in the voice bridge. Do not build the transport by hand.
10.2 The speech-to-text and the speech-to-speech run locally on the card. They are not installed yet (see Section 2.7).
10.3 The brain is Claude Haiku 4.5 over a streaming interface (see Section 4.6).
10.4 The end-of-turn model is the LiveKit Turn Detector v1-mini, on the local processor (see Section 7.5).
10.5 **The telephone service is Telnyx.** LiveKit lists Telnyx as a tested SIP provider. The outbound rate is half the rate of the nearest competitor, the number costs $1.00 each month, and the platform fee is zero. The service is a transport for the layer four test and the real call only.
10.6 Nothing but the brain makes a paid network call on the hot path.

## 11. Build order

11.1 Build the shared conversation core first.
11.2 Build the text-level conversation-logic test second, with simulated timing.
11.3 Install the local speech-to-text and the local speech-to-speech third. This step is new in this revision, because Section 2.7 shows the step is not done.
11.4 Build the audio pipeline fourth, with recorded audio fixtures.
11.5 Build the heavily-integrated local test fifth, with two agents and no telephone network.
11.6 Add the caller layer and the receiver layer sixth.
11.7 Add the behavior knobs and the test personalities seventh.
11.8 Add the Telnyx transport and the real end-to-end test last.

## 12. Measurements

12.1 The time to the first token was measured on 9 September 2026. The method
sent a call brief of about 600 tokens and a conversation of six turns, streamed
the reply, and timed the first token of content. Each model ran eight times. The
route was OpenRouter.

| Model | Middle value | High value |
|---|---|---|
| Gemini 2.5 Flash Lite | 415 ms | 487 ms |
| Gemini 2.5 Flash | 529 ms | 609 ms |
| GPT-4.1 mini | 597 ms | 846 ms |
| **Claude Haiku 4.5** | **740 ms** | **798 ms** |
| Gemini 3 Flash preview | 933 ms | 1023 ms |
| Claude Sonnet 5 | 1254 ms | 1305 ms |
| Claude Opus 5 | 3583 ms | 3620 ms |

12.2 The suite ran two times for most models. The two runs agree within 60
milliseconds. So the numbers are repeatable.

12.3 Every number includes the OpenRouter hop. The direct route was not measured,
because no direct key works today. So every number is an upper limit.

12.4 The numbers come from this machine and this network. Confirm them again if
the machine or the connection changes.

12.5 Still to measure: the time from the local voice to the first audio, the
transport time both ways, the false-cutoff rate of the v1-mini detector on real
call audio, and the time to the first token on a direct route.

## 13. Open risks

13.1 The local test hears clean audio. A real call is low quality, compressed, and has noise and cross-talk. Turn detection that is good on the local test can fail on a real line. So the local test must be able to add fake degradation, noise, and packet loss.
13.2 The caller can say wrong things for Chris. Section 8 gives the rule that holds this risk down. The rule is a behavior, so a test must prove it (see Section 9.9).
13.3 The caller must detect a voicemail machine and change to leave a message. This behavior does not appear in an agent-versus-agent test unless a test personality models it.
13.4 The caller must handle a menu system and a transfer.
13.5 The v1-mini detector is a smaller form of the model that has the published numbers. Its own numbers are not published. The detector is the hardest part of the product, so a worse rate hurts the most here.
13.6 The budget in Section 3.5 holds three estimates and one measurement. If the local voice is slower than 250 milliseconds to the first audio, the target in 3.3 fails even with the fastest brain.

## 14. Open points

14.1 Choose the local speech-to-text model and the local voice. The voice bridge specification also holds this point open. Choose once, for both products.
14.2 Set the default knob values for the caller, after the layer three test.
14.3 Decide how Chris starts a call and gives the call brief.
14.4 Decide where the call transcript and the call result go.
14.5 Find out why the telephone account of the earlier version was closed, before the new account is opened on the same identity.
