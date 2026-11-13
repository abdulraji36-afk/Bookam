import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { LogoMark } from "../components/LogoMark";
import { NavyBackdrop } from "../components/PaperBackdrop";
import { pop, ramp } from "../components/anim";
import { C, FONT } from "../theme";

export const Wordmark: React.FC<{ frame: number; size: number; delay?: number }> = ({ frame, size, delay = 0 }) => (
  <div style={{ display: "flex", fontFamily: FONT, fontWeight: 900, fontSize: size, color: "#fff", letterSpacing: "0.04em" }}>
    {"BOOKAM".split("").map((ch, i) => {
      const p = pop(frame, delay + i * 2.2, 12);
      return (
        <span key={i} style={{ display: "inline-block", opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 60}px)` }}>
          {ch}
        </span>
      );
    })}
  </div>
);

export const Reveal: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const flash = 1 - ramp(frame, 0, 8);
  const out = ramp(frame, dur - 8, dur);
  const tag = pop(frame, 30, 14);
  return (
    <AbsoluteFill>
      <NavyBackdrop glowY={42} />
      <AbsoluteFill style={{
        alignItems: "center", justifyContent: "center", gap: 50,
        transform: `scale(${1 + frame * 0.002 - out * 0.15})`, opacity: 1 - out,
      }}>
        <LogoMark size={300} frame={frame - 2} />
        <Wordmark frame={frame} size={150} delay={16} />
        <div style={{
          fontFamily: FONT, fontSize: 46, fontWeight: 600, color: C.nav,
          opacity: tag, transform: `translateY(${(1 - tag) * 30}px)`, textAlign: "center", lineHeight: 1.3,
        }}>
          Order &amp; dispatch software for<br />depots, shops and warehouses
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};
