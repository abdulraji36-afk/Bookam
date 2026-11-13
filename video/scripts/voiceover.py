"""Generate the Nigerian English voiceover, one file per scene.

Usage: python3 scripts/voiceover.py [voice]
Default voice is en-NG-AbeoNeural (male). en-NG-EzinneNeural is the female option.
Needs network access to speech.platform.bing.com (pip install edge-tts).
"""
import asyncio, json, os, subprocess, sys
import edge_tts

VOICE = sys.argv[1] if len(sys.argv) > 1 else "en-NG-AbeoNeural"
RATE = "+8%"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "vo")

LINES = {
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
}

async def main():
    os.makedirs(OUT, exist_ok=True)
    proxy = os.environ.get("HTTPS_PROXY")
    durations = {}
    for key, text in LINES.items():
        path = os.path.join(OUT, f"{key}.mp3")
        raw = path + ".raw.mp3"
        await edge_tts.Communicate(text, VOICE, rate=RATE, proxy=proxy).save(raw)
        # Trim silence at both ends so scene timing follows the speech itself.
        trim = "silenceremove=start_periods=1:start_threshold=-45dB"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af",
                        f"{trim},areverse,{trim},areverse,loudnorm=I=-15:TP=-1.5:LRA=11", "-ar", "44100", path], check=True)
        os.remove(raw)
        d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "csv=p=0", path], capture_output=True, text=True).stdout
        durations[key] = round(float(d), 3)
        print(f"{key:11s} {durations[key]:6.2f}s  {text}")
    print("total", round(sum(durations.values()), 2))
    with open(os.path.join(OUT, "durations.json"), "w") as f:
        json.dump(durations, f, indent=2)

asyncio.run(main())
