"""Does the telephone band change what the model hears? (spec 12.5, 15.10)

The comparison that matters is narrowband against the same audio clean, not
against the reference text: comparing to the text measures how the model writes
numbers, which the codec does not touch.

Three versions of each line: clean 16 kHz, the telephone leg, and the telephone
leg with noise on it. Synthetic speech, so this is a first signal only.

The fixtures are kept, not made afresh. Piper writes different audio for the
same sentence on every run, so a bench that synthesises each time measures the
voice's variance as well as the codec's effect. The noise is seeded for the
same reason (15.12). Delete the fixture directory to build a new corpus.

Usage: python3 bench/narrowband.py    (needs sox and the voice bridge present)
"""
import difflib, glob, json, os, random, re, statistics, struct, subprocess, wave

V = os.path.expanduser("~/sidetone/.venv")
SPEECH = os.path.expanduser("~/sidetone/speech")
VOICE = os.path.expanduser("~/.sidetone/models/en_US-lessac-medium.onnx")
MODELS = os.path.expanduser("~/.sidetone/models")
OUT = os.environ.get("NARROWBAND_OUT", "/tmp/narrowband-fixtures")
os.makedirs(OUT, exist_ok=True)
S = OUT

# ctranslate2 wants CUDA 12 and the only CUDA on the path belongs to torch,
# which is 13. The wheels inside the venv carry the right one, so point the
# loader at them the same way the bridge does in src/speech.ts.
_libs = [d for d in glob.glob(f"{V}/lib/python*/site-packages/nvidia/*/lib") if os.path.isdir(d)]
os.environ["LD_LIBRARY_PATH"] = ":".join(_libs + [os.environ.get("LD_LIBRARY_PATH", "")])

LINES = [
    "Tuesday the twenty-second at nine fifteen works great.",
    "He would prefer the Thursday at eight thirty.",
    "Can you spell the last name for me?",
    "His date of birth is not something I can share.",
    "I will check with him and come back to you.",
    "Is there a morning slot in the next three weeks?",
    "Yes, I am an assistant calling on his behalf.",
    "The number to reach him on is five five five, one two one two.",
    "Sorry, could you say that again? The line is not great.",
    "That works. Please put him down for the Thursday.",
]

def worker(args):
    p = subprocess.Popen([f"{V}/bin/python3"] + args, stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, text=True, bufsize=1,
                         env={**os.environ})
    assert json.loads(p.stdout.readline()).get("ready")
    return p

def ask(p, payload):
    p.stdin.write(json.dumps(payload) + "\n"); p.stdin.flush()
    return json.loads(p.stdout.readline())

def sox(*args):
    subprocess.run(["sox", *args], check=True, capture_output=True)

# 15.12: sox synth whitenoise is a different noise on every run, so the noisy
# row moved between 3 and 9 words adrift and could not be a threshold. One
# seeded file, written once, makes the row repeatable.
NOISE_SEED = 20260917
NOISE_LEVEL = 0.012
NOISE = f"{S}/noise-seed{NOISE_SEED}.wav"

def seeded_noise(path, seconds=8, rate=8000):
    if os.path.exists(path):
        return path
    rnd = random.Random(NOISE_SEED)
    frames = bytearray()
    for _ in range(seconds * rate):
        frames += struct.pack("<h", int(rnd.uniform(-1.0, 1.0) * NOISE_LEVEL * 32767))
    with wave.open(path, "wb") as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(rate)
        out.writeframes(bytes(frames))
    return path

words = lambda t: re.sub(r"[^a-z0-9 ]", " ", t.lower()).split()

def diff(a, b):
    sm = difflib.SequenceMatcher(None, a, b)
    return max(len(a), len(b)) - sum(block.size for block in sm.get_matching_blocks())

tts = worker([f"{SPEECH}/tts_worker.py", VOICE])
stt = worker([f"{SPEECH}/stt_worker.py", "small.en", MODELS])

same_narrow = same_noisy = 0
drift_narrow = drift_noisy = total = 0
times = {"clean": [], "narrow": [], "noisy": []}

made = reused = 0
for i, line in enumerate(LINES):
    raw = f"{S}/f{i}-raw.wav"
    if os.path.exists(raw):
        reused += 1
    else:
        ask(tts, {"text": line, "wav": raw})
        made += 1
    clean, narrow, noisy = f"{S}/f{i}-clean.wav", f"{S}/f{i}-narrow.wav", f"{S}/f{i}-noisy.wav"
    ul, uln = f"{S}/f{i}-ul.wav", f"{S}/f{i}-uln.wav"

    sox(raw, "-r", "16000", "-c", "1", "-e", "signed-integer", "-b", "16", clean)
    # The telephone leg: 300-3400 Hz, 8 kHz u-law, then back up for the model.
    sox(raw, "-r", "8000", "-c", "1", "-e", "u-law", ul, "sinc", "300-3400")
    sox(ul, "-r", "16000", "-c", "1", "-e", "signed-integer", "-b", "16", narrow)
    # The same leg with noise on it, which a real line has and a fixture does not.
    sox(raw, "-r", "8000", "-c", "1", "-e", "u-law", uln, "sinc", "300-3400", "vol", "0.7")
    sox("-m", uln, seeded_noise(NOISE), "-r", "16000", "-c", "1",
        "-e", "signed-integer", "-b", "16", noisy)

    out = {}
    for name, path in (("clean", clean), ("narrow", narrow), ("noisy", noisy)):
        reply = ask(stt, {"wav": path})
        out[name] = words(reply.get("text", ""))
        times[name].append(reply["seconds"] * 1000)

    dn, dz = diff(out["clean"], out["narrow"]), diff(out["clean"], out["noisy"])
    total += len(out["clean"])
    drift_narrow += dn; drift_noisy += dz
    same_narrow += dn == 0; same_noisy += dz == 0
    mark = "same" if dn == 0 else f"narrow drifts {dn}"
    mark += ", noisy same" if dz == 0 else f", noisy drifts {dz}"
    print(f"line {i}: {mark}")
    if dn or dz:
        print(f"   clean:  {' '.join(out['clean'])}")
        if dn: print(f"   narrow: {' '.join(out['narrow'])}")
        if dz: print(f"   noisy:  {' '.join(out['noisy'])}")

print(f"\nfixtures: {reused} reused, {made} newly synthesised, in {S}")
print(f"{len(LINES)} lines, {total} words as the clean audio was heard")
print(f"narrowband identical to clean: {same_narrow}/{len(LINES)} lines, {drift_narrow} words adrift")
print(f"with noise added:              {same_noisy}/{len(LINES)} lines, {drift_noisy} words adrift")
for name in times:
    print(f"{name:>7} transcribe median {statistics.median(times[name]):.0f} ms")
for p in (tts, stt):
    p.stdin.close(); p.terminate()
