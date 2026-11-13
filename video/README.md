# Bookam promo videos (Remotion)

Two vertical (1080×1920) cuts of the same promo, built from the same scenes:

| Composition | Length | Use it for |
| --- | --- | --- |
| `BookamPromoFull` | 49 s, natural pace | WhatsApp Status, the website, YouTube, sending to interested customers |
| `BookamPromo` | 30 s, fast | Paid ads, TikTok/Reels feeds where people scroll quickly |

This is its own project with its own dependencies; the Next.js app ignores this folder.

## Story (full cut)

| Time | Scene | Voiceover (Nigerian English) |
| --- | --- | --- |
| 0–2.4 s | A notebook fills with messy entries | "Still booking orders on paper?" |
| 2.4–5.2 s | Two orders swap places, one blows away | "Orders get mixed up, or lost completely." |
| 5.2–8.5 s | Calculator lands on ₦ ???, the difference gets circled | "At the end of the day, the accounts never balance." |
| 8.5–11.1 s | A hand sneaks crates off the shelf, stock 120 → 97 | "Goods go missing from your store and warehouse," |
| 11.1–14.9 s | Unfilled delivery note, then the page crumples | "and nobody knows who dispatched what, or which driver took it." |
| 14.9–18.1 s | "There's a better way." then the logo builds | "There's a better way. Meet Bookam." |
| 18.1–38.7 s | Phone: customers (search), orders (step tracker), dispatch (who + driver, signed off), stock (returns go back on the shelf), live report + alerts, quick actions (dispatch in 2 taps) | One line per feature |
| 38.7–49 s | Logo, tagline, bookam.online, WhatsApp 0815 282 3719 | "Bookam. Every order, every product, every driver, accounted for. Visit bookam dot online, or WhatsApp us today." |

## Commands

```bash
npm install
npm run studio          # live preview in the browser
npm run render          # both cuts → out/bookam-promo-full-49s.mp4 and out/bookam-promo-30s.mp4
npm run render:full     # just the 49-second cut
```

Rendering needs ffmpeg on the PATH (the last step levels the audio to -14 LUFS for social platforms).

## Changing things

- **Timing**: `src/timelines.json` holds every scene's start, length and voice start (frames, 30 fps) for both cuts.
  On-screen moments are tied to the spoken words (`public/<vo dir>/words.json`), so most animations follow the voice automatically.
- **Words on screen**: captions live in each scene (`src/scenes/*`).
- **Voiceover**: edit the lines in `scripts/voiceover.py`, then `pip install edge-tts` and
  `python3 scripts/voiceover.py full` (or `short`). Add a voice name to switch voice, e.g.
  `python3 scripts/voiceover.py full en-NG-EzinneNeural` for the female Nigerian voice.
  Check the printed durations still fit `src/timelines.json`.
- **Music and sound effects**: generated from scratch (royalty-free) by `scripts/music.py`
  (`pip install numpy scipy`, then `npm run music`). The music reads the same timeline, so re-run it after changing timings.
  Sound-effect cues are in `src/sfx-cues.ts`.
- **Sample data** (customers, drivers, ₦ amounts, "Kano Road Depot") is made up and lives in `src/scenes/Showcase.tsx`.
