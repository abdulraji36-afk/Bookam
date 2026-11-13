import React, { createContext, useContext } from "react";
import timelines from "./timelines.json";
import voShortDur from "../public/vo/durations.json";
import voShortWords from "../public/vo/words.json";
import voFullDur from "../public/vo-full/durations.json";
import voFullWords from "../public/vo-full/words.json";
import { FPS } from "./theme";

/**
 * Both cuts of the video share every scene; they differ only in timing.
 * src/timelines.json holds each scene's start, length and voice cue in frames (30 fps);
 * scripts/music.py reads the same file so the music lands on the same moments.
 */
export type SceneKey =
  | "hook" | "manual" | "accounting" | "theft" | "nocontrol" | "reveal"
  | "customers" | "orders" | "dispatch" | "stock" | "realtime" | "easy" | "cta";
export type Scene = { from: number; dur: number; vo: number };
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
