import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";

/** Warm, slightly grubby paper for the "problem" half. */
export const PaperBackdrop: React.FC<{ tint?: string }> = ({ tint }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 50% 40%, ${C.oldPaper} 0%, ${C.oldPaperDark} 100%)`,
    }}
  >
    <AbsoluteFill
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(60,40,10,0.035) 0 2px, transparent 2px 6px)," +
          "repeating-linear-gradient(90deg, rgba(60,40,10,0.025) 0 1px, transparent 1px 9px)",
      }}
    />
    {tint ? <AbsoluteFill style={{ background: tint }} /> : null}
    <AbsoluteFill style={{ boxShadow: "inset 0 0 260px rgba(40,25,0,0.35)" }} />
  </AbsoluteFill>
);

/** Deep navy with a soft amber glow and a faint grid for the "solution" half. */
export const NavyBackdrop: React.FC<{ glowY?: number }> = ({ glowY = 45 }) => (
  <AbsoluteFill style={{ background: C.ink }}>
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "72px 72px",
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% ${glowY}%, rgba(245,163,10,0.28) 0%, rgba(245,163,10,0) 55%)`,
      }}
    />
    <AbsoluteFill style={{ boxShadow: `inset 0 0 300px ${C.inkDeep}` }} />
  </AbsoluteFill>
);
