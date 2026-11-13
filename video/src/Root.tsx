import React from "react";
import { Composition } from "remotion";
import { BookamPromo } from "./BookamPromo";
import { TOTAL_FRAMES } from "./timeline";
import { FPS } from "./theme";

export const Root: React.FC = () => (
  <Composition
    id="BookamPromo"
    component={BookamPromo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={1080}
    height={1920}
  />
);
