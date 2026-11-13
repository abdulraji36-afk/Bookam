import React from "react";
import { Audio, Sequence, interpolate, staticFile } from "remotion";
import durations from "../public/vo/durations.json";
import { SCENES, SceneKey, TOTAL_FRAMES } from "./timeline";
import { FPS } from "./theme";
import { SFX } from "./sfx-cues";

/** Frames during which a voice line is playing, used to duck the music under speech. */
const voiced = (Object.keys(SCENES) as SceneKey[]).map((k) => [
  SCENES[k].vo, SCENES[k].vo + Math.ceil((durations as Record<string, number>)[k] * FPS),
]);

const musicVolume = (f: number) => {
  // distance (in frames) to the nearest voiced span, so the duck eases in and out
  let d = Infinity;
  for (const [a, b] of voiced) d = Math.min(d, f < a ? a - f : f > b ? f - b : 0);
  const duck = interpolate(d, [0, 8], [0.22, 0.55], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(f, [TOTAL_FRAMES - 20, TOTAL_FRAMES], [1, 0], { extrapolateLeft: "clamp" });
  return duck * fadeOut;
};

export const Soundtrack: React.FC = () => (
  <>
    <Audio src={staticFile("music.wav")} volume={musicVolume} />
    {(Object.keys(SCENES) as SceneKey[]).map((k) => (
      <Sequence key={k} from={SCENES[k].vo} layout="none">
        <Audio src={staticFile(`vo/${k}.mp3`)} volume={1} />
      </Sequence>
    ))}
    {SFX.map((s, i) => (
      <Sequence key={i} from={s.at} layout="none">
        <Audio src={staticFile(`sfx/${s.name}.wav`)} volume={s.vol} />
      </Sequence>
    ))}
  </>
);
