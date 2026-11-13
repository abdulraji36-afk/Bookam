import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { LogoMark } from "../components/LogoMark";
import { NavyBackdrop } from "../components/PaperBackdrop";
import { pop, ramp } from "../components/anim";
import { useScene } from "../timeline";
import { C, FONT } from "../theme";
import { Wordmark } from "./Reveal";

/** Frames this scene starts before the showcase ends, so the two cross-fade instead of cutting through black. */
export const CTA_PREROLL = 12;

export type CtaLine = { t: string; word: string; color: string };
const PROMO_LINES: CtaLine[] = [
  { t: "Every order.", word: "order", color: "#fff" },
  { t: "Every product.", word: "product", color: "#fff" },
  { t: "Every driver.", word: "driver", color: "#fff" },
  { t: "Accounted for.", word: "accounted", color: C.accent },
];

/** End card. Each line appears as its `word` is spoken; with no lines it shows a short tagline instead. */
export const CallToAction: React.FC<{ lines?: CtaLine[] }> = ({ lines: given = PROMO_LINES }) => {
  const frame = useCurrentFrame() - CTA_PREROLL;
  const S = useScene("cta");
  const fadeIn = ramp(frame, -CTA_PREROLL, 0);
  const lines = given.filter((l) => S.has(l.word));
  const tag = pop(frame, 14, 14);
  const visit = S.cue("visit", 0.7);
  const wa = S.has("whatsapp") ? S.cue("whatsapp") : visit + 10;
  const site = pop(frame, visit, 12);
  const phone = pop(frame, wa, 12);
  const pulse = 1 + Math.max(0, Math.sin((frame - wa - 24) * 0.16)) * 0.035 * ramp(frame, wa + 24, wa + 34);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <NavyBackdrop glowY={30} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: lines.length ? 250 : 560 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <LogoMark size={180} frame={frame + 4} />
          <Wordmark frame={frame} size={140} delay={4} />
        </div>
        {lines.length ? null : (
          <div style={{
            marginTop: 50, fontFamily: FONT, fontSize: 52, fontWeight: 600, color: C.nav, textAlign: "center", lineHeight: 1.3,
            opacity: tag, transform: `translateY(${(1 - tag) * 30}px)`,
          }}>Order &amp; dispatch software for<br />depots, shops and warehouses</div>
        )}
        <div style={{ marginTop: lines.length ? 90 : 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {lines.map((l) => {
            const p = pop(frame, S.cue(l.word) - 6, 12);
            return (
              <div key={l.t} style={{
                fontFamily: FONT, fontWeight: 900, fontSize: lines.length > 3 ? 112 : 120, letterSpacing: "-0.03em", color: l.color,
                opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 70}px) scale(${0.9 + p * 0.1})`, lineHeight: 1.1,
              }}>{l.t}</div>
            );
          })}
        </div>
        <div style={{ marginTop: 90, display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 24, background: C.accent, color: C.ink, borderRadius: 999,
            padding: "30px 66px", fontFamily: FONT, fontWeight: 900, fontSize: 80,
            transform: `translateY(${(1 - site) * 80}px) scale(${pulse})`, opacity: site, boxShadow: "0 20px 60px rgba(245,163,10,0.35)",
          }}>
            <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={2.4}>
              <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
            </svg>
            bukam.online
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 24, background: "#1f9d55", color: "#fff", borderRadius: 999,
            padding: "26px 60px 26px 30px", fontFamily: FONT, fontWeight: 850, fontSize: 70,
            transform: `translateY(${(1 - phone) * 80}px) scale(${pulse})`, opacity: phone, boxShadow: "0 20px 60px rgba(31,157,85,0.35)",
          }}>
            <div style={{ width: 96, height: 96, borderRadius: 48, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="#1f9d55">
                <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" />
              </svg>
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
              <span style={{ fontSize: 34, fontWeight: 700, opacity: 0.9 }}>WhatsApp</span>
              0815 282 3719
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
