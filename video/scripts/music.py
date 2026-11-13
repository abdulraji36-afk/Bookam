"""Synthesise the soundtracks and sound effects. Everything is generated from scratch
with numpy, so there are no licensing issues.

Usage: python3 scripts/music.py   (needs numpy and scipy)
Writes public/music.wav (30 s cut), public/music-full.wav (49 s cut) and public/sfx/*.wav.

Each track is laid out from src/timelines.json and the voiceover word timings, so:
  start → crumple   tension: drone, clock tick, heartbeat, a riser into the crumple
  reveal            warm swell while the logo builds
  "Meet Bookam"     the Afrobeats groove drops (log drum, shaker, rim, keys, marimba)
  "easy" scene      breakdown (full cut only): drums thin out, a riser builds
  call to action    lands on a bar downbeat; the track rings out at the end
"""
import json
import os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
rng = np.random.default_rng(7)
HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..", "public")


def t_(d):
    return np.arange(int(SR * d)) / SR


def note(n):  # MIDI → Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def env(d, a=0.005, decay=0.2, curve=1.0):
    t = t_(d)
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / decay) ** curve
    return e


def place(buf, sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= buf.shape[0] or i + len(sig) <= 0:
        return
    j = min(buf.shape[0], i + len(sig))
    s = sig[: j - i] * gain
    buf[i:j, 0] += s * np.sqrt(0.5 * (1 - pan))
    buf[i:j, 1] += s * np.sqrt(0.5 * (1 + pan))


def reverb(x, secs=1.6, mix=0.25, seed=1):
    r = np.random.default_rng(seed)
    n = int(SR * secs)
    ir = r.standard_normal((n, 2)) * np.exp(-np.arange(n) / (SR * secs / 6))[:, None]
    ir = lp(ir.T, 6000).T
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    wet = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return x * (1 - mix) + wet * mix


# ---------------------------------------------------------------- instruments
def kick(d=0.45, f0=150, f1=48, amp=1.0):
    t = t_(d)
    f = f1 + (f0 - f1) * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(d, 0.002, 0.16) * amp + rng.standard_normal(len(t)) * env(d, 0.0005, 0.004) * 0.3


def log_drum(freq, d=0.5):
    """Amapiano-style log drum: pitched sine with a pitch dip and a little grit."""
    t = t_(d)
    f = freq * (1 + 0.9 * np.exp(-t * 45))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    s = np.tanh(s * 1.6) * env(d, 0.003, 0.22)
    return lp(s, 1800)


def shaker(d=0.07, amp=1.0):
    return hp(rng.standard_normal(int(SR * d)), 6000) * env(d, 0.008, 0.025) * amp


def rim(d=0.08):
    t = t_(d)
    s = np.sin(2 * np.pi * 1700 * t) * 0.6 + bp(rng.standard_normal(len(t)), 1500, 4500) * 0.8
    return s * env(d, 0.0005, 0.018)


def clap(d=0.3):
    n = bp(rng.standard_normal(int(SR * d)), 900, 5000)
    e = np.zeros(len(n))
    for k, off in enumerate([0, 0.011, 0.022]):
        i = int(off * SR)
        burst = env(d, 0.001, 0.012 if k < 2 else 0.11)[: len(e) - i]
        e[i:i + len(burst)] += burst
    return n * e


def keys(freqs, d=0.32, amp=1.0):
    """Electric-piano-ish stab: sines with a bell partial and a fast decay."""
    t = t_(d)
    s = np.zeros(len(t))
    for f in freqs:
        s += np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 18) \
            + 0.12 * np.sin(2 * np.pi * 3.98 * f * t) * np.exp(-t * 30)
    return s / len(freqs) * env(d, 0.004, 0.16) * amp


def pad(freqs, d, amp=1.0, bright=1800):
    t = t_(d)
    s = np.zeros(len(t))
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):  # slightly detuned saws
            ff = f * 2 ** (det / 12)
            s += 2 * ((ff * t) % 1) - 1
    s = lp(s / (len(freqs) * 3), bright)
    a = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.5)
    return s * a * amp


def marimba(f, d=0.45, amp=1.0):
    t = t_(d)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 40)
    return s * env(d, 0.002, 0.13) * amp


def noise_riser(d, lo=300, hi=7000):
    n = rng.standard_normal(int(SR * d))
    out = np.zeros_like(n)
    seg = int(SR * 0.05)
    for i in range(0, len(n), seg):
        frac = i / len(n)
        c = lo * (hi / lo) ** frac
        out[i:i + seg] = bp(n[i:i + seg + 400], c * 0.7, min(c * 1.4, 18000))[: len(out[i:i + seg])]
    return out * np.linspace(0, 1, len(n)) ** 2


# ------------------------------------------------------------------- music
CH = {  # Fmaj7 – G6 – Em7 – Am7  (IV – V – iii – vi in C)
    "F": [53, 57, 60, 64], "G": [55, 59, 62, 64], "Em": [52, 55, 59, 62], "Am": [57, 60, 64, 67],
}
ROOTS = {"F": 41, "G": 43, "Em": 40, "Am": 45}
PROG = ["F", "G", "Em", "Am"]
MEL = [  # (step, midi) over two bars: a little C-major pentatonic hook
    (0, 76), (3, 79), (6, 81), (10, 79), (12, 76), (14, 74),
    (16, 72), (19, 74), (22, 76), (26, 79), (28, 81), (30, 84),
]


def compose(cut, out_name):
    tl = json.load(open(os.path.join(HERE, "..", "src", "timelines.json")))[cut]
    words = json.load(open(os.path.join(ROOT, tl["voDir"], "words.json")))
    sc = tl["scenes"]
    sec = lambda frames: frames / 30.0
    DUR = sec(tl["total"])
    N = int(SR * DUR)
    t_crumple = sec(sc["nocontrol"]["from"] + sc["nocontrol"]["dur"] - 16)
    t_reveal = sec(sc["reveal"]["from"])
    meet = next(t for w, t in words["reveal"] if w.lower() == "meet")
    t_groove = sec(sc["reveal"]["vo"]) + meet - 0.05
    t_cta = sec(sc["cta"]["from"])
    t_easy = sec(sc["easy"]["from"]) if "easy" in sc else None
    # pick a tempo near 110 BPM that puts the call to action exactly on a bar line
    bars_to_cta = max(1, round((t_cta - t_groove) / (240 / 110)))
    BAR = (t_cta - t_groove) / bars_to_cta
    BEAT = BAR / 4
    STEP = BEAT / 4
    print(f"{out_name}: {DUR:.1f}s, groove at {t_groove:.2f}s, {240 / BAR:.1f} BPM, CTA at {t_cta:.2f}s")

    mix = np.zeros((N, 2))

    # tension ---------------------------------------------------------------
    drone_d = t_reveal + 0.2
    t = t_(drone_d)
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 0.35 * t)
    drone = pad([note(45), note(52), note(57)], drone_d, 0.55, bright=700) * (0.7 + 0.3 * lfo)
    drone *= np.minimum(1, t / 0.4)
    place(mix, drone, 0.0, 0.9)
    sh = (np.sin(2 * np.pi * note(76) * t) + np.sin(2 * np.pi * note(77) * t)) * (t / drone_d) ** 2 * 0.08
    place(mix, sh * np.minimum(1, (drone_d - t) / 0.2), 0.0)
    for b in range(int(t_reveal / BEAT)):
        place(mix, rim() * 0.5, b * BEAT, 0.35, pan=0.3 if b % 2 else -0.3)
    for b in range(0, int(t_reveal / BEAT), 2):
        place(mix, kick(0.35, 90, 40), b * BEAT, 0.55)
        place(mix, kick(0.3, 80, 38), b * BEAT + 0.22, 0.35)
    place(mix, noise_riser(1.6), t_crumple - 1.1, 0.35)
    rs = int(SR * 1.5)
    place(mix, np.sin(2 * np.pi * np.cumsum(np.linspace(200, 900, rs)) / SR) * np.linspace(0, 1, rs) ** 2, t_crumple - 1.0, 0.06)

    # swell while the logo builds -------------------------------------------
    place(mix, pad([note(n) for n in CH["F"]], t_groove - t_reveal + 0.4, 0.5, bright=2500), t_reveal, 0.8)

    # groove ------------------------------------------------------------------
    bar = 0
    while True:
        b0 = t_groove + bar * BAR
        if b0 >= DUR - 1.0:
            break
        ch = PROG[bar % 4]
        full = bar >= 2
        breakdown = t_easy is not None and t_easy - 0.1 <= b0 < t_cta - 0.01
        for s in range(16):
            at = b0 + s * STEP + (0.018 if s % 2 else 0.0)
            if at >= DUR - 0.8:
                break
            if not breakdown:
                if s in (0, 8):
                    place(mix, kick(), at, 0.9)
                if s == 14 and full:
                    place(mix, kick(amp=0.5), at, 0.5)
                if s in (0, 3, 7, 10, 13):
                    r = ROOTS[ch] + (12 if s in (7, 13) else 0)
                    place(mix, log_drum(note(r)), at, 0.55)
                if full and s in (4, 12):
                    place(mix, clap(), at, 0.32)
            place(mix, shaker(amp=1.0 if s % 4 == 2 else 0.45), at, 0.22 if not breakdown else 0.14, pan=0.25)
            if s in (3, 6, 11, 14):
                place(mix, rim(), at, 0.28 if not breakdown else 0.18, pan=-0.35)
            if s in (2, 6, 10):
                place(mix, keys([note(n) for n in CH[ch]]), at, 0.42, pan=0.15)
            # a little rim roll to close every fourth bar
            if bar % 4 == 3 and s >= 12 and not breakdown:
                place(mix, rim(), at + STEP / 2, 0.2, pan=0.35)
        place(mix, pad([note(n) for n in CH[ch]], BAR + 0.3, 0.16 if not breakdown else 0.3, bright=1500), b0, 1.0)
        if full:
            for step, m in MEL:
                if (step >= 16) == (bar % 2 == 1):
                    at = b0 + (step % 16) * STEP
                    if at < DUR - 0.8:
                        place(mix, marimba(note(m)), at, 0.32 if not breakdown else 0.4, pan=-0.2)
        bar += 1
    if t_easy is not None:
        place(mix, noise_riser(min(2.0, t_cta - t_easy)), t_cta - min(2.0, t_cta - t_easy), 0.3)

    # call to action: a crash, then everything rings out on Fmaj7
    place(mix, hp(rng.standard_normal(int(SR * 1.8)), 5000) * env(1.8, 0.002, 0.5), t_cta, 0.12)
    end = t_groove + int((DUR - 1.0 - t_groove) / BAR) * BAR
    place(mix, pad([note(n) for n in CH["F"] + [72]], DUR - end + 0.1, 0.4, bright=2500), end, 1.0)
    place(mix, keys([note(n) for n in CH["F"]], 1.6), end, 0.5)

    mix = reverb(mix, 1.4, 0.18)
    mix = hp(mix.T, 30).T
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    mix /= np.abs(mix).max() / 0.89
    fade = np.ones(N)
    fade[-int(SR * 0.4):] = np.linspace(1, 0, int(SR * 0.4))
    mix *= fade[:, None]
    wavfile.write(os.path.join(ROOT, out_name), SR, (mix * 32767).astype(np.int16))


compose("short", "music.wav")
compose("full", "music-full.wav")

# -------------------------------------------------------------------- sfx
os.makedirs(os.path.join(ROOT, "sfx"), exist_ok=True)


def save(name, s, verb=0.0):
    s = np.asarray(s, dtype=float)
    st = np.stack([s, s], axis=1)
    if verb:
        st = reverb(np.concatenate([st, np.zeros((int(SR * 0.8), 2))]), 0.8, verb, seed=3)
    st /= np.abs(st).max() / 0.9
    wavfile.write(os.path.join(ROOT, "sfx", f"{name}.wav"), SR, (st * 32767).astype(np.int16))


def crackle(d, density=600, lo=1500, hi=8000):
    n = int(SR * d)
    s = np.zeros(n)
    idx = rng.integers(0, n, int(d * density))
    s[idx] = rng.uniform(-1, 1, len(idx))
    return bp(s, lo, hi) + bp(rng.standard_normal(n), lo, hi) * 0.08


save("paper", crackle(0.28, 500) * env(0.28, 0.01, 0.1))
sc = bp(rng.standard_normal(int(SR * 0.7)), 2500, 7000) * (0.5 + 0.5 * np.sin(2 * np.pi * 11 * t_(0.7))) ** 2
save("scribble", sc * env(0.7, 0.02, 0.4))
save("beep", np.sign(np.sin(2 * np.pi * 2300 * t_(0.06))) * env(0.06, 0.002, 0.04) * 0.5)
bz = np.sign(np.sin(2 * np.pi * 110 * t_(0.38))) + 0.5 * np.sign(np.sin(2 * np.pi * 116 * t_(0.38)))
save("buzz", lp(bz, 2500) * env(0.38, 0.005, 0.3))
pt = t_(0.16)
save("pop", np.sin(2 * np.pi * np.cumsum(500 * np.exp(-pt * 14) + 160) / SR) * env(0.16, 0.002, 0.07), 0.2)
tt = t_(1.4)
eng = sum(np.sin(2 * np.pi * h * 46 * (1 + 0.3 * tt / 1.4) * tt) / h for h in range(1, 7))
save("truck", lp(eng + 0.5 * lp(rng.standard_normal(len(tt)), 400), 900) * np.sin(np.pi * tt / 1.4))
save("crumple", crackle(0.55, 1400, 800, 9000) * np.minimum(1, t_(0.55) / 0.05) * np.exp(-t_(0.55) * 3))
it = t_(1.6)
boom = np.sin(2 * np.pi * np.cumsum(38 + 90 * np.exp(-it * 18)) / SR) * np.exp(-it * 2.6)
save("impact", np.tanh(boom * 2) + lp(rng.standard_normal(len(it)), 3000) * np.exp(-it * 25) * 0.6, 0.35)
save("whoosh", noise_riser(0.5, 400, 5000) * np.sin(np.pi * t_(0.5) / 0.5))
save("swipe", noise_riser(0.22, 900, 7000) * np.sin(np.pi * t_(0.22) / 0.22))
kt = t_(0.09)
save("tick", (np.sin(2 * np.pi * 1600 * kt) + 0.5 * np.sin(2 * np.pi * 2400 * kt)) * env(0.09, 0.001, 0.025), 0.15)
stt = t_(0.35)
save("stamp", kick(0.35, 160, 60) * 0.9 + lp(rng.standard_normal(len(stt)), 2500) * np.exp(-stt * 40) * 0.6, 0.2)
dt = t_(1.0)
bell = sum(a * np.sin(2 * np.pi * f * dt) * np.exp(-dt * k) for f, a, k in
           [(1318.5, 1, 4), (2637, 0.4, 7), (3520, 0.2, 10), (1975.5, 0.5, 5)])
bell2 = np.zeros(len(dt)); o = int(0.11 * SR)
bell2[o:] = sum(a * np.sin(2 * np.pi * f * dt[: len(dt) - o]) * np.exp(-dt[: len(dt) - o] * k) for f, a, k in
                [(1760, 1, 4), (3520, 0.4, 7)])
save("ding", (bell + bell2) * np.minimum(1, dt / 0.002), 0.2)
save("grab", lp(rng.standard_normal(int(SR * 0.18)), 1200) * env(0.18, 0.004, 0.05) + kick(0.18, 120, 70) * 0.4)
for name, f0 in (("type", 3200), ("tap", 900)):
    d = 0.05 if name == "type" else 0.12
    tt_ = t_(d)
    save(name, (np.sin(2 * np.pi * f0 * tt_) * 0.6 + bp(rng.standard_normal(len(tt_)), f0 * 0.6, f0 * 2) * 0.6) * env(d, 0.0008, d / 4), 0.1)
print("sfx:", sorted(os.listdir(os.path.join(ROOT, "sfx"))))
