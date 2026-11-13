# Bookam promo video (Remotion)

A 30-second, 9:16 (1080×1920) promo for WhatsApp Status, Reels and TikTok.
It is its own project with its own dependencies; the Next.js app ignores this folder.

## Story

| Time | Scene | Voiceover (Nigerian English) |
| --- | --- | --- |
| 0–2 s | Paper notebook | "Still booking orders on paper?" |
| 2–3.7 s | Slips piling up | "Orders lost in notebooks." |
| 3.7–5.5 s | Calculator, ₦ ??? | "Accounts that never balance." |
| 5.5–7 s | Crates vanish, stock 120 → 97 | "Goods vanishing from your store…" |
| 7–9 s | Who dispatched? Page crumples | "…and no one knows who dispatched what." |
| 9–11 s | Logo builds | "Meet Bookam." |
| 11–23.3 s | Phone: customers, orders, dispatch, stock, real-time report | One line per feature |
| 23.3–30 s | Logo, tagline, bookam.online, WhatsApp 0815 282 3719 | "Bookam. Every order, every driver, accounted for. Visit bookam dot online." |

## Commands

```bash
npm install
npm run studio      # live preview in the browser
npm run render      # renders out/bookam-promo-9x16.mp4 (audio mastered to -14 LUFS; needs ffmpeg)
```

## Changing things

- **Timing**: `src/timeline.ts` holds every scene's start, length and voice cue (frames, 30 fps).
- **Words on screen**: captions live in each scene (`src/scenes/*`).
- **Voiceover**: edit `LINES` in `scripts/voiceover.py`, then `pip install edge-tts` and
  `npm run voiceover` (or `python3 scripts/voiceover.py en-NG-EzinneNeural` for the female voice).
  It rewrites `public/vo/*.mp3` and `durations.json`; check the timeline still fits.
- **Music and sound effects**: generated from scratch (royalty-free) by `scripts/music.py`
  (`pip install numpy scipy`, then `npm run music`). Cue points for effects are in `src/sfx-cues.ts`.
- **Sample data** (customers, drivers, ₦ amounts) is made up and lives in `src/scenes/Showcase.tsx`.
