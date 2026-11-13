import React from "react";
import { Composition } from "remotion";
import { BukAmPromo } from "./BukAmPromo";
import { Returnables, SoundFamiliar } from "./series/SeriesKit";
import { FULL, SERIES, SHORT } from "./timeline";
import { FPS } from "./theme";

const V = { fps: FPS, width: 1080, height: 1920 };

export const Root: React.FC = () => (
  <>
    {/* 49 s, natural pace: WhatsApp Status, website, YouTube, sending to interested customers */}
    <Composition id={FULL.id} component={BukAmPromo} defaultProps={{ tl: FULL }} durationInFrames={FULL.total} {...V} />
    {/* 30 s cut for paid ads and fast-scrolling feeds */}
    <Composition id={SHORT.id} component={BukAmPromo} defaultProps={{ tl: SHORT }} durationInFrames={SHORT.total} {...V} />
    {/* "Sound familiar?" series: one problem each, about 18 s */}
    {[1, 2, 3, 4, 5].map((n) => (
      <Composition key={n} id={SERIES[`ep${n}`].id} component={SoundFamiliar} defaultProps={{ cut: `ep${n}` }}
        durationInFrames={SERIES[`ep${n}`].total} {...V} />
    ))}
    {/* Returnable items (crates, cylinders, pallets), about 38 s */}
    <Composition id={SERIES.returns.id} component={Returnables} durationInFrames={SERIES.returns.total} {...V} />
  </>
);
