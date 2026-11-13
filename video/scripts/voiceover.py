"""Generate the Nigerian English voiceover, one file per scene.

Usage:
  python3 scripts/voiceover.py full            # 48-second version  -> public/vo-full/
  python3 scripts/voiceover.py short           # 30-second version  -> public/vo/
  python3 scripts/voiceover.py ep1 ... ep5     # "Sound familiar?" episodes -> public/vo-ep<n>/
  python3 scripts/voiceover.py returns         # returnable items video -> public/vo-returns/
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
    # "Sound familiar?" series: problem -> stinger -> how Bookam handles it -> end card
    "ep1": {"dir": "vo-ep1", "rate": "+0%", "lines": {
        "problem": "You bought a hundred and twenty crates. Today you count ninety-seven. Where did the rest go?",
        "familiar": "Sound familiar?",
        "fix": "With Bookam, every crate in and out is recorded, with the name of who did it.",
        "cta": "Bookam. Visit bookam dot online.",
    }},
    "ep2": {"dir": "vo-ep2", "rate": "+0%", "lines": {
        "problem": "The goods left your depot this morning. Which driver took them? In which vehicle?",
        "familiar": "Sound familiar?",
        "fix": "With Bookam, every trip records the driver, the vehicle, the orders on board, and who sent it out.",
        "cta": "Bookam. Visit bookam dot online.",
    }},
    "ep3": {"dir": "vo-ep3", "rate": "+0%", "lines": {
        "problem": "A page is missing from your order book, and nobody knows what was written on it.",
        "familiar": "Sound familiar?",
        "fix": "With Bookam, records don't just disappear. A cancelled order stays on record, with a reason and a name.",
        "cta": "Bookam. Visit bookam dot online.",
    }},
    "ep4": {"dir": "vo-ep4", "rate": "+0%", "lines": {
        "problem": "It's nine p.m., and you're still adding up today's orders from the notebook.",
        "familiar": "Sound familiar?",
        "fix": "With Bookam, your daily report is ready. Orders, stock, trips and returns, in one place.",
        "cta": "Bookam. Visit bookam dot online.",
    }},
    "ep5": {"dir": "vo-ep5", "rate": "+0%", "lines": {
        "problem": "You're away from the depot. Do you really know what is happening there right now?",
        "familiar": "Sound familiar?",
        "fix": "With Bookam, you get a Telegram message for every new order, every trip, and every return, with who did it.",
        "cta": "Bookam. Visit bookam dot online.",
    }},
    # Returnable items (crates, cylinders, pallets)
    "returns": {"dir": "vo-returns", "rate": "+0%", "lines": {
        "argument": "Your customer says he returned twenty crates. Your book says twelve. Who is right?",
        "loss": "Crates, gas cylinders, pallets. Every one that doesn't come back is money lost.",
        "reveal": "Bookam tracks every returnable item.",
        "owes": "When an order goes out, Bookam knows exactly what the customer has to bring back.",
        "tripback": "When the truck returns, record what came back, order by order.",
        "balances": "Then see who still owes you, and how many you have in store.",
        "cta": "Bookam. Every crate, every cylinder, accounted for. Visit bookam dot online, or WhatsApp us today.",
    }},
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
