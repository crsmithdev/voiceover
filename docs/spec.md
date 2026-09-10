# Outbound Call Agent — Product Specification

Written in ASD-STE100 Simplified Technical English.
Feature level only. No code.
Date: 9 September 2026. First revision.

Source: Google Doc `Outbound Call Agent — Product Specification (ASD-STE100)`
<https://docs.google.com/document/d/1kym06wi7s1LWctCGsDNDk2x_KlwuDdhItl_FL1qfPps/edit>

This document is the specification for a personal outbound call agent. It gives
the purpose, the background, the settled design decisions, the shared
conversation core, the behavior knobs, the caller and receiver layers, the test
plan, the technology choices, the build order, and the risks. The document is a
working draft. The document builds on prior work in the voice bridge
specification.

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
2.7 Chris already runs speech-to-text and speech-to-speech on a small local card for the voice bridge. The two speech ends are already solved on hardware Chris owns.

## 3. Latency model

3.1 Startup latency is acceptable. Chris can wait 15 to 20 seconds to start the agent before a call.
3.2 Per-turn latency is the real target. The person on the other end must not hear a gap that sounds like a dropped call.
3.3 The target for per-turn latency is under about one and a half seconds to first audio, after the person stops speaking.
3.4 The system reaches this target by streaming. The speech-to-text streams partial words. The brain streams the first tokens. The speech-to-speech starts to speak the first sentence while the rest is made.
3.5 The main latency risk is the brain time to first token, and a weak network. This risk gives an occasional slow turn, not a constant delay.

## 4. Architecture decision

4.1 The product uses a three-stage pipeline. The stages are speech-to-text, then the brain, then speech-to-speech.
4.2 The product does not use a single speech-to-speech model. The reason is control. The agent speaks for Chris and must be steerable and must support tool use. Control matters more than the lowest possible latency.
4.3 The local card does the speech-to-text and the speech-to-speech.
4.4 The brain is a hosted model over a streaming interface.
4.5 The brain does not run on the local card. So the small card is enough, and the card memory limit does not matter.

## 5. The shared conversation core

5.1 The caller and the receiver share the same internals for the mechanics of conversation.
5.2 The shared mechanics are: listen, detect the end of a turn, handle interruption and barge-in, speak, and stream.
5.3 The caller and the receiver are not identical. Each is a thin layer on top of the shared core.
5.4 The caller layer holds the goal of the call, the background information, and the special behavior. The special behavior includes: drive toward the goal, detect a voicemail machine and leave a message, handle a menu system, and handle a transfer.
5.5 The receiver layer holds the behavior of the person who answers. In a test, the receiver layer holds a test personality.
5.6 The purpose is reuse of the hard conversation mechanics. The purpose is not to make the two agents the same.

## 6. Behavior knobs

6.1 Personality is a set of behavior knobs on the shared core. Personality is not a surface layer on top.
6.2 The knobs reach into the mechanics. The knobs include: how long to wait before the agent decides the other party is done, how eager the agent is to interrupt, and the pace of speech.
6.3 The knobs serve two purposes.
6.4 First purpose: adversarial test receivers. A test receiver is impolite by design. This removes the risk that two agents with the same turn detection wait for each other too politely.
6.5 Second purpose: real tuning of the caller. A patient caller and a brisk caller give different call results. The knobs tune how Chris comes across.
6.6 So the caller and the receiver are each a set of: the core, plus knob values, plus intent.

## 7. End of turn detection

7.1 End of turn detection decides when the other party has finished speaking.
7.2 This is the hard problem of the product.
7.3 A simple method waits for a fixed length of silence. This method is not good enough. It cuts in on a slow talker, or it waits too long.
7.4 The product uses a method that also looks at the content of the speech, not only the silence.
7.5 The behavior knobs adjust the end of turn detection per personality.

## 8. Test plan

8.1 The test plan gets most of the build effort. Testing was the hardest part of the earlier version.
8.2 The test plan has separable layers, so a failure points to one layer.
8.3 Layer one: conversation logic. This is tested in text, below the audio, with simulated timing. The test injects events, for example "the user started to speak at time A and went silent at time B". The test asserts what the agent does. This test is repeatable and gives readable traces.
8.4 Layer two: the audio pipeline. This is the speech-to-text, the speech-to-speech, and the barge-in. This is tested with recorded audio, not a live second agent.
8.5 Layer three: the heavily-integrated local test. Two agents talk to each other with the real speech-to-text, the real brain, the real speech-to-speech, and real barge-in. This test does not use the telephone network. The agents pass audio to each other directly. This test is nearly free and exercises almost everything that has bugs.
8.6 Layer four: the real end-to-end test. This test uses the telephone service and a real call. This test checks only the telephone transport, which layer three cannot check. This test runs rarely, because it is the most costly and the telephone transport is the least likely part to fail.
8.7 The telephone service is only a transport. Two agents do not need the telephone network to talk to each other.
8.8 The local test uses a cheap or local speech-to-speech for the test agents. The paid, high-quality voice is only for the real call.
8.9 Test personalities give the challenge. The personalities include: a slow talker, an old-sounding person, a quiet person, a rambler, a person who trails off, and a person who says "uh-huh" in the middle and does not mean they are done.
8.10 A test personality gets its character from behavior and timing, through the knobs, not from a premium voice.

## 9. Technology choices

9.1 The transport for real-time audio should use a proven real-time framework over WebRTC, as in the voice bridge. Do not build the transport by hand.
9.2 The speech-to-text and the speech-to-speech run locally, as they already do for the voice bridge.
9.3 The brain is a hosted model over a streaming interface.
9.4 The telephone transport uses a telephone service, for the real call only.

## 10. Build order

10.1 Build the shared conversation core first.
10.2 Build the text-level conversation-logic test second, with simulated timing.
10.3 Build the audio pipeline third, with recorded audio fixtures.
10.4 Build the heavily-integrated local test fourth, with two agents and no telephone network.
10.5 Add the caller layer and the receiver layer fifth.
10.6 Add the behavior knobs and the test personalities sixth.
10.7 Add the telephone transport and the real end-to-end test last.

## 11. Open risks

11.1 The local test hears clean audio. A real call is low quality, compressed, and has noise and cross-talk. Turn detection that is good on the local test can fail on a real line. So the local test must be able to add fake degradation, noise, and packet loss.
11.2 The caller can say wrong things for Chris. An agent that speaks for a person can state a wrong fact with confidence. This is a trust risk. The caller must have a safe behavior when it does not know an answer.
11.3 The caller must detect a voicemail machine and change to leave a message. This behavior does not appear in an agent-versus-agent test unless a test personality models it.
11.4 The caller must handle a menu system and a transfer.

## 12. Open points

12.1 How to pay for and run the live end-to-end tests. To be decided.
12.2 The exact hosted brain, and its time to first token. To be measured.
12.3 The exact end of turn detection method. To be decided.
12.4 The safe behavior for the caller when it does not know an answer. To be decided.
