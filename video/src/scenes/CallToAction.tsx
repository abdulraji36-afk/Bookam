import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { LogoMark } from "../components/LogoMark";
import { NavyBackdrop } from "../components/PaperBackdrop";
import { pop, ramp } from "../components/anim";
import { C, FONT } from "../theme";
import { Wordmark } from "./Reveal";

/* Frame cues, matched to the pauses in public/vo/cta.mp3 (voice starts at frame 8). */
const CUE = { brand: 4, order: 46, driver: 71, accounted: 96, visit: 143 };

export const CallToAction: React.FC = () => {
  const frame = useCurrentFrame();
  const flash = 1 - ramp(frame, 0, 6);
  const lines = [
    { t: "Every order.", at: CUE.order, color: "#fff" },
    { t: "Every driver.", at: CUE.driver, color: "#fff" },
    { t: "Accounted for.", at: CUE.accounted, color: C.accent },
  ];
  const pills = pop(frame, CUE.visit, 12);
  const pills2 = pop(frame, CUE.visit + 8, 12);
  const pulse = 1 + Math.max(0, Math.sin((frame - CUE.visit - 20) * 0.18)) * 0.03 * ramp(frame, CUE.visit + 20, CUE.visit + 30);
  return (
    <AbsoluteFill>
      <NavyBackdrop glowY={30} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 260 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <LogoMark size={190} frame={frame - CUE.brand} />
          <Wordmark frame={frame} size={140} delay={CUE.brand + 8} />
        </div>
        <div style={{ marginTop: 110, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {lines.map((l) => {
            const p = pop(frame, l.at, 12);
            return (
              <div key={l.t} style={{
                fontFamily: FONT, fontWeight: 900, fontSize: 118, letterSpacing: "-0.03em", color: l.color,
                opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 70}px) scale(${0.9 + p * 0.1})`,
                lineHeight: 1.08,
              }}>{l.t}</div>
            );
          })}
        </div>
        <div style={{ marginTop: 120, display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 22, background: C.accent, color: C.ink, borderRadius: 999,
            padding: "30px 64px", fontFamily: FONT, fontWeight: 900, fontSize: 76,
            transform: `translateY(${(1 - pills) * 80}px) scale(${pulse})`, opacity: pills,
            boxShadow: "0 20px 60px rgba(245,163,10,0.35)",
          }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={2.4}>
              <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
            </svg>
            bookam.online
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 20, background: "rgba(255,255,255,0.08)",
            border: "3px solid rgba(255,255,255,0.18)", color: "#fff", borderRadius: 999, padding: "24px 52px",
            fontFamily: FONT, fontWeight: 800, fontSize: 60,
            transform: `translateY(${(1 - pills2) * 80}px)`, opacity: pills2,
          }}>
            <div style={{
              width: 76, height: 76, borderRadius: 38, background: "#25a244", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="#fff">
                <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" />
              </svg>
            </div>
            <span style={{ color: C.nav, fontWeight: 600 }}>WhatsApp</span> 0815 282 3719
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: flash * 0.6 }} />
    </AbsoluteFill>
  );
};
