import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Soundtrack } from "./Soundtrack";
import { CallToAction } from "./scenes/CallToAction";
import { Accounting, Hook, ManualBooking, NoControl, Theft } from "./scenes/Problems";
import { Reveal } from "./scenes/Reveal";
import { Showcase } from "./scenes/Showcase";
import { SCENES, SHOWCASE } from "./timeline";
import { C } from "./theme";

export const BookamPromo: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Sequence from={SCENES.hook.from} durationInFrames={SCENES.hook.dur}><Hook /></Sequence>
    <Sequence from={SCENES.manual.from} durationInFrames={SCENES.manual.dur}><ManualBooking /></Sequence>
    <Sequence from={SCENES.accounting.from} durationInFrames={SCENES.accounting.dur}><Accounting /></Sequence>
    <Sequence from={SCENES.theft.from} durationInFrames={SCENES.theft.dur}><Theft /></Sequence>
    <Sequence from={SCENES.nocontrol.from} durationInFrames={SCENES.nocontrol.dur}>
      <NoControl dur={SCENES.nocontrol.dur} />
    </Sequence>
    <Sequence from={SCENES.reveal.from} durationInFrames={SCENES.reveal.dur}><Reveal dur={SCENES.reveal.dur} /></Sequence>
    <Sequence from={SHOWCASE.from} durationInFrames={SHOWCASE.dur}><Showcase /></Sequence>
    <Sequence from={SCENES.cta.from} durationInFrames={SCENES.cta.dur}><CallToAction /></Sequence>
    <Soundtrack />
  </AbsoluteFill>
);
