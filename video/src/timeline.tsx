import React, { createContext, useContext } from "react";
import timelines from "./timelines.json";
import voShortDur from "../public/vo/durations.json";
import voShortWords from "../public/vo/words.json";
import voFullDur from "../public/vo-full/durations.json";
import voFullWords from "../public/vo-full/words.json";
import seriesTimelines from "./series/timelines.json";
import ep1Dur from "../public/vo-ep1/durations.json";
import ep1Words from "../public/vo-ep1/words.json";
import ep2Dur from "../public/vo-ep2/durations.json";
import ep2Words from "../public/vo-ep2/words.json";
import ep3Dur from "../public/vo-ep3/durations.json";
import ep3Words from "../public/vo-ep3/words.json";
import ep4Dur from "../public/vo-ep4/durations.json";
import ep4Words from "../public/vo-ep4/words.json";
import ep5Dur from "../public/vo-ep5/durations.json";
import ep5Words from "../public/vo-ep5/words.json";
import retDur from "../public/vo-returns/durations.json";
import retWords from "../public/vo-returns/words.json";
import { FPS } from "./theme";

/**
 * Both cuts of the video share every scene; they differ only in timing.
 * src/timelines.json holds each scene's start, length and voice cue in frames (30 fps);
 * scripts/music.py reads the same file so the music lands on the same moments.
 */
export type SceneKey = string;
/** `caption` / `sub` override a reused scene's on-screen text in another video. */
export type Scene = { from: number; dur: number; vo: number; caption?: string; sub?: string };
type Words = Record<string, [string, number][]>;

export type Timeline = {
  id: string;
  total: number;
  voDir: string;
  music: string;
  scenes: Partial<Record<SceneKey, Scene>>;
  durations: Record<string, number>;
  words: Words;
};

export const SHORT: Timeline = {
  ...timelines.short, durations: voShortDur, words: voShortWords as unknown as Words,
};
export const FULL: Timeline = {
  ...timelines.full, durations: voFullDur, words: voFullWords as unknown as Words,
};

/* "Sound familiar?" episodes and the returnables video (laid out by scripts/plan_series.py) */
const SERIES_VO: Record<string, [Record<string, number>, unknown]> = {
  ep1: [ep1Dur, ep1Words], ep2: [ep2Dur, ep2Words], ep3: [ep3Dur, ep3Words],
  ep4: [ep4Dur, ep4Words], ep5: [ep5Dur, ep5Words], returns: [retDur, retWords],
};
/** Text overrides for scenes borrowed from the main promo. */
const OVERRIDES: Record<string, Record<string, Partial<Scene>>> = {
  ep1: { problem: { caption: "Bought *120.* Counted *97.*" } },
  ep2: { problem: { caption: "Which *driver* took it?" } },
  returns: { reveal: { sub: "Tracks every crate, cylinder\nand pallet you lend out" } },
};
export const SERIES: Record<string, Timeline> = Object.fromEntries(
  Object.entries(seriesTimelines).map(([cut, t]) => {
    const scenes = Object.fromEntries(
      Object.entries(t.scenes).map(([k, sc]) => [k, { ...sc, ...(OVERRIDES[cut]?.[k] ?? {}) }]),
    );
    const [durations, words] = SERIES_VO[cut];
    return [cut, { ...t, scenes, durations, words: words as Words }];
  }),
);

const Ctx = createContext<Timeline>(SHORT);
export const TimelineProvider: React.FC<{ tl: Timeline; children: React.ReactNode }> = ({ tl, children }) => (
  <Ctx.Provider value={tl}>{children}</Ctx.Provider>
);

const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "");

/** Timing helpers for one scene, all in frames relative to that scene's start. */
export const sceneInfo = (tl: Timeline, key: SceneKey) => {
  const s = tl.scenes[key]!;
  const words = tl.words[key] ?? [];
  const vo = s.vo - s.from;
  const voLen = Math.ceil((tl.durations[key] ?? 0) * FPS);
  /** Frame at which `word` is spoken (n-th match), or `fallback` (0-1 through the line) if the line lacks it. */
  const cue = (word: string, fallback = 0, n = 0) => {
    const hit = words.filter(([w]) => norm(w) === word.toLowerCase())[n];
    return Math.round(vo + (hit ? hit[1] * FPS : fallback * voLen));
  };
  const has = (word: string) => words.some(([w]) => norm(w) === word.toLowerCase());
  return { ...s, vo, voLen, cue, has, full: tl.id !== SHORT.id };
};

export const useScene = (key: SceneKey) => sceneInfo(useContext(Ctx), key);

export const useTimeline = () => useContext(Ctx);
