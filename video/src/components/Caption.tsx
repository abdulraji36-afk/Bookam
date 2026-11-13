import React from "react";
import { useCurrentFrame } from "remotion";
import { FONT } from "../theme";
import { pop } from "./anim";

type Props = {
  /** Words wrapped in *asterisks* are drawn in the highlight colour. */
  text: string;
  color: string;
  highlight: string;
  size?: number;
  delay?: number;
  stagger?: number;
  top?: number;
  align?: "center" | "left";
  weight?: number;
};

/** Big headline that pops in word by word. */
export const Caption: React.FC<Props> = ({
  text, color, highlight, size = 96, delay = 0, stagger = 3, top = 230, align = "center", weight = 850,
}) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div
      style={{
        position: "absolute", top, left: 70, right: 70,
        display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start",
        columnGap: size * 0.26, rowGap: size * 0.05,
        fontFamily: FONT, fontWeight: weight, fontSize: size, lineHeight: 1.04,
        letterSpacing: "-0.02em", textAlign: align,
      }}
    >
      {words.map((raw, i) => {
        const hot = raw.startsWith("*");
        const w = raw.replace(/\*/g, "");
        const p = pop(frame, delay + i * stagger, 12);
        return (
          <span
            key={i}
            style={{
              display: "inline-block", color: hot ? highlight : color,
              opacity: Math.min(1, p * 1.4),
              transform: `translateY(${(1 - p) * 50}px) scale(${0.85 + p * 0.15})`,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};
