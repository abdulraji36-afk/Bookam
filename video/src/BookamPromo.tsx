import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Soundtrack } from "./Soundtrack";
import { CTA_PREROLL, CallToAction } from "./scenes/CallToAction";
import { Accounting, Hook, ManualBooking, NoControl, Theft } from "./scenes/Problems";
import { Reveal } from "./scenes/Reveal";
import { Showcase } from "./scenes/Showcase";
import { SceneKey, Timeline, TimelineProvider } from "./timeline";
import { C } from "./theme";

const PROBLEMS: [SceneKey, React.FC][] = [
  ["hook", Hook], ["manual", ManualBooking], ["accounting", Accounting], ["theft", Theft], ["nocontrol", NoControl], ["reveal", Reveal],
];

export const BookamPromo: React.FC<{ tl: Timeline }> = ({ tl }) => {
  const sc = tl.scenes;
  const showFrom = sc.customers!.from;
  const showDur = sc.cta!.from - showFrom;
  return (
    <TimelineProvider tl={tl}>
      <AbsoluteFill style={{ background: C.ink }}>
        {PROBLEMS.map(([k, Comp]) => (
          <Sequence key={k} from={sc[k]!.from} durationInFrames={sc[k]!.dur}><Comp /></Sequence>
        ))}
        <Sequence from={showFrom} durationInFrames={showDur}><Showcase from={showFrom} dur={showDur} /></Sequence>
        <Sequence from={sc.cta!.from - CTA_PREROLL} durationInFrames={sc.cta!.dur + CTA_PREROLL}><CallToAction /></Sequence>
        <Soundtrack />
      </AbsoluteFill>
    </TimelineProvider>
  );
};
