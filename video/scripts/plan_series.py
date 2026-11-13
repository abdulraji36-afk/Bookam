"""Lay out the "Sound familiar?" episodes and the returnables video from their voiceover lengths.

Usage: python3 scripts/plan_series.py
Reads public/vo-<cut>/durations.json, writes src/series/timelines.json (frames at 30 fps),
which both the video (src/series/*) and scripts/music.py read.
"""
import json, math, os

HERE = os.path.dirname(__file__)
FPS = 30

# (scene key, frames before the voice starts, frames after it ends)
EPISODE = [("problem", 10, 12), ("familiar", 4, 12), ("fix", 14, 14), ("cta", 8, 40)]
RETURNS = [("argument", 10, 8), ("loss", 4, 12), ("reveal", 26, 10), ("owes", 14, 8),
           ("tripback", 8, 8), ("balances", 8, 10), ("cta", 10, 40)]

CUTS = {f"ep{n}": (f"SoundFamiliar{n}", f"vo-ep{n}", f"music-ep{n}.wav", EPISODE) for n in range(1, 6)}
CUTS["returns"] = ("BookamReturnables", "vo-returns", "music-returns.wav", RETURNS)

out = {}
for cut, (comp_id, vo_dir, music, plan) in CUTS.items():
    d = json.load(open(os.path.join(HERE, "..", "public", vo_dir, "durations.json")))
    t, scenes = 0, {}
    for key, lead, tail in plan:
        v = math.ceil(d[key] * FPS)
        scenes[key] = {"from": t, "dur": lead + v + tail, "vo": t + lead}
        t += lead + v + tail
    out[cut] = {"id": comp_id, "total": t, "voDir": vo_dir, "music": music, "scenes": scenes}
    print(f"{comp_id:18s} {t / FPS:5.1f}s")

json.dump(out, open(os.path.join(HERE, "..", "src", "series", "timelines.json"), "w"), indent=2)
