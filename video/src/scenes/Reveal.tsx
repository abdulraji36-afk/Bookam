import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { LogoMark } from "../components/LogoMark";
import { NavyBackdrop } from "../components/PaperBackdrop";
import { pop, ramp } from "../components/anim";
import { useScene } from "../timeline";
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

export const Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useScene("reveal");
  const bridge = S.has("there's");
  const meet = S.cue("meet", 0);
  const logoAt = Math.max(4, meet - 24);
  const flash = 1 - ramp(frame, 0, 8);
  const out = ramp(frame, S.dur - 8, S.dur);
  const tag = pop(frame, meet + 14, 14);
  const bridgeOut = ramp(frame, logoAt - 8, logoAt + 2);
  return (
    <AbsoluteFill>
      <NavyBackdrop glowY={42} />
      {bridge ? (
        <AbsoluteFill style={{ opacity: 1 - bridgeOut, transform: `translateY(${-bridgeOut * 80}px)` }}>
          <Caption text="There's a *better* way." color="#fff" highlight={C.accent} size={120} top={800} delay={S.vo - 2} stagger={4} />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{
        alignItems: "center", justifyContent: "center", gap: 50,
        transform: `scale(${1 + Math.max(0, frame - logoAt) * 0.0015 - out * 0.15})`, opacity: 1 - out,
      }}>
        <LogoMark size={320} frame={frame - logoAt} />
        <Wordmark frame={frame} size={160} delay={logoAt + 14} />
        <div style={{
          fontFamily: FONT, fontSize: 50, fontWeight: 600, color: C.nav,
          opacity: tag, transform: `translateY(${(1 - tag) * 30}px)`, textAlign: "center", lineHeight: 1.3,
        }}>
          Order &amp; dispatch software for<br />depots, shops and warehouses
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};
