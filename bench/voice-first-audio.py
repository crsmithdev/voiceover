"""Measures the time from a sentence to a finished wav (spec 15.8, second item).

Drives the voice bridge's own TTS worker, because spec 13.2 reuses that engine
instead of installing a second one. So this benchmark needs the bridge present
at the paths below; it is not self-contained.

Usage: ~/voice-bridge-mcp/.venv/bin/python3 bench/voice-first-audio.py
"""
import json, os, statistics, subprocess, sys, time, wave

PY_BIN = os.path.expanduser("~/voice-bridge-mcp/.venv/bin/python3")
WORKER = os.path.expanduser("~/voice-bridge-mcp/speech/tts_worker.py")
VOICE = os.path.expanduser("~/.voice-bridge/models/en_US-lessac-medium.onnx")
OUT = "/tmp/claude-1001/-home-crsmi-caller/3670f9cb-95b7-45b1-91cf-d18ad2610910/scratchpad/tts.wav"

# The first sentences the models actually produced in the brain benchmark.
SENTENCES = [
    "Tuesday the twenty-second at nine fifteen works great.",
    "He would prefer the Thursday at 8:30 AM.",
    "Let me check his schedule.",
    "Either works, but let's go with Thursday at eight thirty, please.",
    "Yes, I'm an assistant calling on his behalf.",
]

load_started = time.time()
p = subprocess.Popen([PY_BIN, WORKER, VOICE], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
ready = json.loads(p.stdout.readline())
print(f"voice loaded in {time.time() - load_started:.2f} s, sample rate {ready.get('sample_rate')}")

def synth(text):
    t0 = time.perf_counter()
    p.stdin.write(json.dumps({"text": text, "wav": OUT}) + "\n")
    p.stdin.flush()
    r = json.loads(p.stdout.readline())
    ms = (time.perf_counter() - t0) * 1000
    if "error" in r:
        raise RuntimeError(r["error"])
    with wave.open(OUT) as w:
        audio_ms = w.getnframes() / w.getframerate() * 1000
    return ms, audio_ms

for s in SENTENCES[:2]:          # warm up
    synth(s)

print(f"\n{'chars':>5} {'synth ms':>9} {'audio ms':>9} {'x real time':>11}  sentence")
all_ms, ratios = [], []
for s in SENTENCES:
    runs = [synth(s) for _ in range(6)]
    ms = statistics.median(m for m, _ in runs)
    audio = runs[0][1]
    all_ms.append(ms); ratios.append(audio / ms)
    print(f"{len(s):>5} {ms:>9.0f} {audio:>9.0f} {audio/ms:>11.1f}  {s[:52]}")

print(f"\nmedian synth {statistics.median(all_ms):.0f} ms over {len(SENTENCES)} sentences, "
      f"{statistics.median(ratios):.1f}x real time")
p.stdin.close(); p.terminate()
