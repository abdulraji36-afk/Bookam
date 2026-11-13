/**
 * Every scene's start and length, in frames at 30 fps (900 frames = 30 s).
 * `vo` is when that scene's voiceover line starts (public/vo/<key>.mp3).
 */
export const SCENES = {
  hook: { from: 0, dur: 60, vo: 8 },
  manual: { from: 60, dur: 52, vo: 62 },
  accounting: { from: 112, dur: 52, vo: 114 },
  theft: { from: 164, dur: 48, vo: 166 },
  nocontrol: { from: 212, dur: 58, vo: 210 },
  reveal: { from: 270, dur: 60, vo: 302 },
  customers: { from: 330, dur: 54, vo: 332 },
  orders: { from: 384, dur: 60, vo: 386 },
  dispatch: { from: 444, dur: 74, vo: 446 },
  stock: { from: 518, dur: 88, vo: 520 },
  realtime: { from: 606, dur: 94, vo: 608 },
  cta: { from: 700, dur: 200, vo: 708 },
} as const;

export type SceneKey = keyof typeof SCENES;

export const TOTAL_FRAMES = 900;

/** The phone mockup stays on screen from "customers" through "realtime". */
export const SHOWCASE = {
  from: SCENES.customers.from,
  dur: SCENES.cta.from - SCENES.customers.from,
};
