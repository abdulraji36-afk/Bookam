import { CTA_PREROLL } from "./scenes/CallToAction";
import { SceneKey, Timeline, sceneInfo } from "./timeline";

type Cue = { at: number; name: string; vol: number };

/**
 * Sound effects for a cut, in absolute frames. They follow the same cues the
 * animations use (mostly spoken words), so picture and sound stay locked together.
 * The .wav files are made by scripts/music.py.
 */
export const buildSfx = (tl: Timeline): Cue[] => {
  const sc = (k: SceneKey) => sceneInfo(tl, k);
  const at = (k: SceneKey, local: number) => tl.scenes[k]!.from + local;
  const out: Cue[] = [];
  const add = (k: SceneKey, local: number, name: string, vol: number) => out.push({ at: at(k, local), name, vol });

  const hook = sc("hook");
  add("hook", 1, "paper", 0.5);
  const per = Math.max(5, Math.floor((hook.dur - 12) / 7));
  for (let i = 0; i < 7; i++) add("hook", 3 + i * per, "scribble", 0.22);

  const man = sc("manual");
  for (let i = 0; i < 6; i++) add("manual", i * 3, "paper", 0.22);
  if (man.has("mixed")) {
    add("manual", man.cue("mixed"), "whoosh", 0.3);
    add("manual", man.cue("mixed") + 10, "stamp", 0.45);
  }
  add("manual", man.cue("lost", 0.35), "swipe", 0.45);

  const acc = sc("accounting");
  const fail = acc.cue("balance", 0.7);
  for (let f = 4; f < fail - 2; f += 3) add("accounting", f, "beep", 0.14);
  add("accounting", fail, "buzz", 0.35);

  const th = sc("theft");
  const span = th.dur - 14, L = Math.min(30, span * 0.42);
  for (let i = 0; i < 5; i++) {
    const w = 2 + (i * (span - L)) / 4;
    add("theft", w + L * 0.4, "grab", 0.4);
    add("theft", w + L * 0.85, "pop", 0.25);
  }

  const nc = sc("nocontrol");
  add("nocontrol", 0, "truck", 0.4);
  for (const w of ["dispatched", "driver", "took"]) if (nc.has(w)) add("nocontrol", nc.cue(w), "pop", 0.3);
  add("nocontrol", nc.dur - 16, "crumple", 0.55);

  const rv = sc("reveal");
  add("reveal", 0, "impact", 0.7);
  add("reveal", Math.max(4, rv.cue("meet") - 24), "whoosh", 0.3);
  add("reveal", rv.cue("meet") - 6, "impact", 0.4);

  add("customers", 0, "whoosh", 0.35);
  for (const k of ["orders", "dispatch", "stock", "realtime", "easy"] as SceneKey[]) if (tl.scenes[k]) add(k, 0, "swipe", 0.3);

  const cu = sc("customers");
  if (cu.dur >= 80) for (let i = 0; i < 5; i++) add("customers", cu.cue("organised", 0.4) + 4 + i * 2.5, "type", 0.3);

  const or = sc("orders");
  for (const [w, fb] of [["automatically", 0.45], ["booking", 0.75], ["delivery", 1]] as const)
    if (or.has(w) || w !== "delivery") add("orders", or.cue(w, fb), "tick", 0.45);

  const di = sc("dispatch");
  add("dispatch", di.cue("released", 0.3), "tick", 0.35);
  add("dispatch", di.cue("driver", 0.65), "tick", 0.35);
  add("dispatch", Math.min(di.dur - 22, di.vo + di.voLen - 2), "stamp", 0.6);

  const st = sc("stock");
  add("stock", st.cue("last", 0.3), "tick", 0.4);
  add("stock", st.cue("return", 0.65), "ding", 0.3);

  const rt = sc("realtime");
  const gap = rt.dur >= 110 ? 30 : 34;
  for (let i = 0; i < (rt.dur >= 110 ? 3 : 2); i++) add("realtime", 10 + i * gap, "ding", 0.42);

  if (tl.scenes.easy) {
    const ez = sc("easy");
    add("easy", Math.round(ez.dur * 0.3), "tap", 0.6);
    add("easy", Math.round(ez.dur * 0.62), "tap", 0.6);
    add("easy", Math.round(ez.dur * 0.62) + 5, "ding", 0.4);
  }

  const cta = sc("cta");
  add("cta", -CTA_PREROLL, "whoosh", 0.35);
  add("cta", 0, "impact", 0.5);
  add("cta", cta.cue("visit", 0.7), "tick", 0.45);
  if (cta.has("whatsapp")) add("cta", cta.cue("whatsapp"), "tick", 0.45);
  return out;
};
