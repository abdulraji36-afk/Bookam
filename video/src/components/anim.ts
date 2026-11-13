import { interpolate, spring } from "remotion";
import { FPS } from "../theme";

/** 0 → 1 spring that starts at `delay` frames. */
export const pop = (frame: number, delay = 0, damping = 14, mass = 0.8) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping, mass, stiffness: 160 } });

/** Clamped linear ramp from a → b over frames [start, end]. */
export const ramp = (frame: number, start: number, end: number, a = 0, b = 1) =>
  interpolate(frame, [start, end], [a, b], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** Fade + slight lift out over the last `len` frames of a scene. */
export const exitOut = (frame: number, dur: number, len = 8) => ramp(frame, dur - len, dur, 1, 0);

/** Deterministic pseudo-random in [0, 1) for jitter that renders the same every time. */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Small hand-held camera wobble for the "chaos" half. */
export const shake = (frame: number, amount = 4) => ({
  x: Math.sin(frame * 0.9) * amount + Math.sin(frame * 2.3) * amount * 0.4,
  y: Math.cos(frame * 1.1) * amount * 0.7,
  r: Math.sin(frame * 0.7) * amount * 0.12,
});
