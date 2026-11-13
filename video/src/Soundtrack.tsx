import React from "react";
import { Audio, Sequence, interpolate, staticFile } from "remotion";
import { buildSfx } from "./sfx-cues";
import { SceneKey, useTimeline } from "./timeline";
import { FPS } from "./theme";

export const Soundtrack: React.FC = () => {
  const tl = useTimeline();
  const keys = Object.keys(tl.scenes) as SceneKey[];
  // frames during which a voice line plays, used to duck the music under speech
  const voiced = keys.map((k) => [tl.scenes[k]!.vo, tl.scenes[k]!.vo + Math.ceil(tl.durations[k] * FPS)]);
  const musicVolume = (f: number) => {
    let d = Infinity;
    for (const [a, b] of voiced) d = Math.min(d, f < a ? a - f : f > b ? f - b : 0);
    const duck = interpolate(d, [0, 8], [0.22, 0.55], { extrapolateRight: "clamp" });
    const fadeOut = interpolate(f, [tl.total - 20, tl.total], [1, 0], { extrapolateLeft: "clamp" });
    return duck * fadeOut;
  };
  return (
    <>
      <Audio src={staticFile(tl.music)} volume={musicVolume} />
      {keys.map((k) => (
        <Sequence key={k} from={tl.scenes[k]!.vo} layout="none">
          <Audio src={staticFile(`${tl.voDir}/${k}.mp3`)} />
        </Sequence>
      ))}
      {buildSfx(tl).map((s, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(s.at))} layout="none">
          <Audio src={staticFile(`sfx/${s.name}.wav`)} volume={s.vol} />
        </Sequence>
      ))}
    </>
  );
};
