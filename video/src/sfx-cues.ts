import { SCENES } from "./timeline";

const S = SCENES;
/** Sound effects, by absolute frame. Files are made by scripts/music.py. */
export const SFX: { at: number; name: string; vol: number }[] = [
  { at: S.hook.from + 2, name: "paper", vol: 0.5 },
  { at: S.hook.from + 6, name: "scribble", vol: 0.35 },
  ...[0, 3, 6, 9, 12, 15, 18, 21].map((d) => ({ at: S.manual.from + d + 4, name: "paper", vol: 0.25 })),
  { at: S.manual.from + 32, name: "scribble", vol: 0.4 },
  ...Array.from({ length: 9 }, (_, i) => ({ at: S.accounting.from + 4 + i * 3, name: "beep", vol: 0.18 })),
  { at: S.accounting.from + 30, name: "buzz", vol: 0.35 },
  ...[0, 6, 12, 18, 24].map((d) => ({ at: S.theft.from + 6 + d, name: "pop", vol: 0.35 })),
  { at: S.nocontrol.from + 0, name: "truck", vol: 0.4 },
  { at: S.nocontrol.from + S.nocontrol.dur - 14, name: "crumple", vol: 0.55 },
  { at: S.reveal.from, name: "impact", vol: 0.8 },
  { at: S.reveal.from + 12, name: "whoosh", vol: 0.3 },
  { at: S.customers.from, name: "whoosh", vol: 0.35 },
  ...[S.orders.from, S.dispatch.from, S.stock.from, S.realtime.from].map((at) => ({ at, name: "swipe", vol: 0.3 })),
  { at: S.orders.from + 34, name: "tick", vol: 0.5 },
  { at: S.dispatch.from + 34, name: "stamp", vol: 0.6 },
  { at: S.stock.from + 40, name: "tick", vol: 0.5 },
  { at: S.realtime.from + 12, name: "ding", vol: 0.45 },
  { at: S.realtime.from + 46, name: "ding", vol: 0.45 },
  { at: S.cta.from, name: "impact", vol: 0.55 },
  { at: S.cta.from + 143, name: "tick", vol: 0.45 },
];
