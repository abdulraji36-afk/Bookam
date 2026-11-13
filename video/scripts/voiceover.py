"""Generate the Nigerian English voiceover, one file per scene.

Usage:
  python3 scripts/voiceover.py full            # 48-second version  -> public/vo-full/
  python3 scripts/voiceover.py short           # 30-second version  -> public/vo/
  python3 scripts/voiceover.py full en-NG-EzinneNeural   # female voice

Default voice is en-NG-AbeoNeural (male). Needs network access to
speech.platform.bing.com (pip install edge-tts) and ffmpeg.

Writes <key>.mp3 per line, durations.json (seconds) and words.json
(start time of every word, in seconds from the start of the trimmed clip),
which the video uses to time on-screen text to the speech.
"""
import asyncio, json, os, subprocess, sys
import edge_tts

SETS = {
    "short": {
        "dir": "vo",
        "rate": "+8%",
        "lines": {
            "hook": "Still booking orders on paper?",
            "manual": "Orders lost in notebooks.",
            "accounting": "Accounts that never balance.",
            "theft": "Goods vanishing from your store...",
            "nocontrol": "and no one knows who dispatched what.",
            "reveal": "Meet Bookam.",
            "customers": "Every customer, organised.",
            "orders": "Orders, handled automatically.",
            "dispatch": "Know which staff and which driver moved every product.",
            "stock": "Every crate tracked. Every return counted.",
            "realtime": "Real-time updates. Full transparency.",
            "cta": "Bookam. Every order, every driver, accounted for. Visit bookam dot online.",
        },
    },
    "full": {
        "dir": "vo-full",
        "rate": "+0%",
        "lines": {
            "hook": "Still booking orders on paper?",
            "manual": "Orders get mixed up, or lost completely.",
            "accounting": "At the end of the day, the accounts never balance.",
            "theft": "Goods go missing from your store and warehouse,",
            "nocontrol": "and nobody knows who dispatched what, or which driver took it.",
            "reveal": "There's a better way. Meet Bookam.",
            "customers": "All your customers, organised in one place.",
            "orders": "Orders are handled automatically, from booking to delivery.",
            "dispatch": "Every dispatch shows who released the goods, and which driver took them.",
            "stock": "Stock is tracked to the last crate, and every return is counted.",
            "realtime": "Real-time updates on your phone. Full transparency.",
            "easy": "And it's simple enough for anyone on your team.",
            "cta": "Bookam. Every order, every product, every driver, accounted for. "
                   "Visit bookam dot online, or WhatsApp us today.",
        },
    },
}

SET = sys.argv[1] if len(sys.argv) > 1 else "full"
VOICE = sys.argv[2] if len(sys.argv) > 2 else "en-NG-AbeoNeural"
CFG = SETS[SET]
OUT = os.path.join(os.path.dirname(__file__), "..", "public", CFG["dir"])


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", path], capture_output=True, text=True).stdout
    return round(float(out), 3)


async def synth(key, text, proxy):
    path = os.path.join(OUT, f"{key}.mp3")
    raw = path + ".raw.mp3"
    words = []
    com = edge_tts.Communicate(text, VOICE, rate=CFG["rate"], proxy=proxy, boundary="WordBoundary")
    with open(raw, "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append([chunk["text"], chunk["offset"] / 1e7])
    # Trim silence at both ends (so timing follows the speech itself) and level it to -15 LUFS.
    trim = "silenceremove=start_periods=1:start_threshold=-45dB"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af",
                    f"{trim},areverse,{trim},areverse,loudnorm=I=-15:TP=-1.5:LRA=11",
                    "-ar", "44100", path], check=True)
    os.remove(raw)
    lead = words[0][1] if words else 0.0
    return probe(path), [[w, round(t - lead, 3)] for w, t in words]


async def main():
    os.makedirs(OUT, exist_ok=True)
    proxy = os.environ.get("HTTPS_PROXY")
    durations, words = {}, {}
    for key, text in CFG["lines"].items():
        durations[key], words[key] = await synth(key, text, proxy)
        print(f"{key:11s} {durations[key]:6.2f}s  {text}")
    print("total speech", round(sum(durations.values()), 2), "s")
    with open(os.path.join(OUT, "durations.json"), "w") as f:
        json.dump(durations, f, indent=2)
    with open(os.path.join(OUT, "words.json"), "w") as f:
        json.dump(words, f, indent=1)


asyncio.run(main())
