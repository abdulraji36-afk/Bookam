import React from "react";
import { Composition } from "remotion";
import { BookamPromo } from "./BookamPromo";
import { FULL, SHORT } from "./timeline";
import { FPS } from "./theme";

export const Root: React.FC = () => (
  <>
    {/* 49 s, natural pace: WhatsApp Status, website, YouTube, sending to interested customers */}
    <Composition id={FULL.id} component={BookamPromo} defaultProps={{ tl: FULL }}
      durationInFrames={FULL.total} fps={FPS} width={1080} height={1920} />
    {/* 30 s cut for paid ads and fast-scrolling feeds */}
    <Composition id={SHORT.id} component={BookamPromo} defaultProps={{ tl: SHORT }}
      durationInFrames={SHORT.total} fps={FPS} width={1080} height={1920} />
  </>
);
