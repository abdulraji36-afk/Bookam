import React from "react";
import { interpolate } from "remotion";
import { C } from "../theme";
import { pop } from "./anim";

/**
 * The Bookam mark: an amber tile, a navy spine and two stacked loads.
 * `frame` drives the build: tile → spine slides up → loads drop in.
 */
export const LogoMark: React.FC<{ size: number; frame: number; built?: boolean }> = ({
  size, frame, built = false,
}) => {
  const f = built ? 999 : frame;
  const tile = pop(f, 0, 11);
  const spine = pop(f, 6, 13);
  const top = pop(f, 11, 9, 0.9);
  const bottom = pop(f, 16, 9, 0.9);
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} style={{ overflow: "visible" }}>
      <g transform={`translate(16 16) scale(${tile}) rotate(${interpolate(tile, [0, 1], [-25, 0])}) translate(-16 -16)`}>
        <rect width="32" height="32" rx="7" fill={C.accent} />
        <rect
          x="8" y={7 + (1 - spine) * 20} width="4.5" height={18 * spine} rx="1" fill={C.ink}
        />
        <path d="M14 7h4.5a4 4 0 0 1 0 8H14z" fill={C.ink}
          transform={`translate(0 ${(1 - top) * -26})`} opacity={top > 0.02 ? 1 : 0} />
        <path d="M14 17h5.5a4 4 0 0 1 0 8H14z" fill={C.ink}
          transform={`translate(0 ${(1 - bottom) * -36})`} opacity={bottom > 0.02 ? 1 : 0} />
      </g>
    </svg>
  );
};
