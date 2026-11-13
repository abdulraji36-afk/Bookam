import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { pop, ramp, shake } from "../components/anim";
import { Soundtrack } from "../Soundtrack";
import { CTA_PREROLL, CallToAction, CtaLine } from "../scenes/CallToAction";
import { NoControl, Theft } from "../scenes/Problems";
import { Reveal } from "../scenes/Reveal";
import { Feature, Showcase } from "../scenes/Showcase";
import { Cue } from "../sfx-cues";
import { SERIES, Timeline, TimelineProvider, sceneInfo } from "../timeline";
import { C, FONT } from "../theme";
import { Argument, Away, LateNight, Loss, TornPage } from "./problems";
import { Balances, DailyReport, OwesScreen, StockLedger, TelegramChat, TripBack, TripRecord, VoidedOrder } from "./screens";

/* ------------------------------------------------------------------ pieces */

/** Small series badge at the top of every episode. */
const SeriesTag: React.FC<{ n: number; ctaFrom: number }> = ({ n, ctaFrom }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, 4, 14) * (1 - ramp(frame, ctaFrom - 14, ctaFrom - 4));
  return (
    <div style={{ position: "absolute", top: 108, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: p }}>
      <div style={{
        fontFamily: FONT, fontWeight: 850, fontSize: 32, letterSpacing: "0.08em", color: "#fff", background: C.danger,
        borderRadius: 999, padding: "10px 28px", boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}>SOUND FAMILIAR? · {n}/5</div>
    </div>
  );
};

/** The "Sound familiar?" stinger between the problem and the fix. */
const Familiar: React.FC = () => {
  const frame = useCurrentFrame();
  const S = sceneInfo(useTl(), "familiar");
  const a = pop(frame, S.cue("sound", 0) - 3, 10);
  const b = pop(frame, S.cue("familiar", 0.4) - 3, 9);
  const out = ramp(frame, S.dur - 7, S.dur);
  const s = shake(frame, 5 * (1 - out));
  return (
    <AbsoluteFill style={{ background: "#06121f" }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, rgba(180,35,24,${0.45 + Math.sin(frame * 0.6) * 0.08}) 0%, rgba(0,0,0,0) 60%)` }} />
      <AbsoluteFill style={{
        alignItems: "center", justifyContent: "center", fontFamily: FONT, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 0.95,
        transform: `translate(${s.x}px, ${s.y}px) scale(${1 + out * 2.2})`, opacity: 1 - out,
      }}>
        <div style={{ fontSize: 210, color: "#fff", transform: `scale(${a})` }}>Sound</div>
        <div style={{ fontSize: 210, color: C.accent, transform: `scale(${b}) rotate(${(1 - b) * -8}deg)` }}>familiar?</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const TlCtx = React.createContext<Timeline | null>(null);
const useTl = () => React.useContext(TlCtx)!;

/* ---------------------------------------------------------------- episodes */

type Episode = { n: number; Problem: React.FC; feature: Omit<Feature, "key">; sfx: (tl: Timeline) => Cue[] };

const at = (tl: Timeline, key: string, local: number, name: string, vol: number): Cue => ({ at: tl.scenes[key]!.from + local, name, vol });

const EPISODES: Record<string, Episode> = {
  ep1: {
    n: 1, Problem: () => <Theft k="problem" />,
    feature: { caption: "Every crate, *with a name*", Screen: StockLedger, zoom: { word: "name", fallback: 0.8, z: 1.1, x: 50, y: 50 } },
    sfx: (tl) => {
      const S = sceneInfo(tl, "problem"), F = sceneInfo(tl, "fix");
      const span = S.dur - 14, L = Math.min(30, span * 0.42);
      const out: Cue[] = [];
      for (let i = 0; i < 5; i++) {
        const w = 2 + (i * (span - L)) / 4;
        out.push(at(tl, "problem", w + L * 0.4, "grab", 0.4), at(tl, "problem", w + L * 0.85, "pop", 0.25));
      }
      for (let i = 0; i < 3; i++) out.push(at(tl, "fix", 6 + i * 9, "tick", 0.35));
      out.push(at(tl, "fix", F.cue("name", 0.8), "ding", 0.3), at(tl, "fix", F.vo + F.voLen - 6, "stamp", 0.45));
      return out;
    },
  },
  ep2: {
    n: 2, Problem: () => <NoControl k="problem" />,
    feature: { caption: "Every trip, *on record*", Screen: TripRecord, zoom: { word: "sent", fallback: 0.85, z: 1.1, x: 50, y: 70 } },
    sfx: (tl) => {
      const S = sceneInfo(tl, "problem"), F = sceneInfo(tl, "fix");
      return [
        at(tl, "problem", 0, "truck", 0.4), at(tl, "problem", S.cue("driver"), "pop", 0.3), at(tl, "problem", S.cue("vehicle"), "pop", 0.3),
        at(tl, "problem", S.dur - 16, "crumple", 0.5),
        ...["driver", "vehicle", "orders", "sent"].map((w, i) => at(tl, "fix", F.cue(w, 0.25 + i * 0.2), "tick", 0.4)),
      ];
    },
  },
  ep3: {
    n: 3, Problem: TornPage,
    feature: { caption: "Nothing *disappears*", Screen: VoidedOrder, zoom: { word: "reason", fallback: 0.7, z: 1.1, x: 50, y: 58 } },
    sfx: (tl) => {
      const S = sceneInfo(tl, "problem"), F = sceneInfo(tl, "fix");
      return [
        at(tl, "problem", 5, "crumple", 0.6), at(tl, "problem", 9, "swipe", 0.5), at(tl, "problem", S.cue("missing", 0.3), "pop", 0.35),
        at(tl, "problem", S.cue("nobody", 0.6), "buzz", 0.25),
        at(tl, "fix", F.cue("cancelled", 0.5), "stamp", 0.5), at(tl, "fix", F.cue("reason", 0.7), "tick", 0.4), at(tl, "fix", F.cue("name", 0.85), "ding", 0.35),
      ];
    },
  },
  ep4: {
    n: 4, Problem: LateNight,
    feature: { caption: "Your daily report, *ready*", Screen: DailyReport, zoom: { word: "stock", fallback: 0.45, z: 1.08, x: 50, y: 40 } },
    sfx: (tl) => {
      const S = sceneInfo(tl, "problem"), F = sceneInfo(tl, "fix");
      const out: Cue[] = [];
      for (let f = 0; f < S.dur * 0.55; f += 4) out.push(at(tl, "problem", f, "tick", 0.12));
      const per = Math.max(4, (S.dur - 30) / 7);
      for (let i = 0; i < 7; i++) out.push(at(tl, "problem", 6 + i * per, "scribble", 0.15));
      out.push(at(tl, "problem", 6 + 7 * per, "buzz", 0.3));
      ["orders", "stock", "trips", "returns"].forEach((w, i) => out.push(at(tl, "fix", F.cue(w, 0.3 + i * 0.13), "tick", 0.4)));
      return out;
    },
  },
  ep5: {
    n: 5, Problem: Away,
    feature: { caption: "Every move, *on your phone*", Screen: TelegramChat, bare: true },
    sfx: (tl) => {
      const S = sceneInfo(tl, "problem"), F = sceneInfo(tl, "fix");
      return [
        at(tl, "problem", 20, "truck", 0.25),
        ...[0, 1, 2].map((i) => at(tl, "problem", S.cue("happening", 0.6) + i * 5, "pop", 0.3)),
        ...["order", "trip", "return"].map((w, i) => at(tl, "fix", F.cue(w, 0.25 + i * 0.25), "ding", 0.42)),
      ];
    },
  },
};

const commonSfx = (tl: Timeline, keys: { hit: string; show: string }): Cue[] => {
  const cta = sceneInfo(tl, "cta");
  return [
    at(tl, keys.hit, 0, "impact", 0.6),
    at(tl, keys.show, 0, "whoosh", 0.35),
    at(tl, "cta", -CTA_PREROLL, "whoosh", 0.3),
    at(tl, "cta", 0, "impact", 0.45),
    at(tl, "cta", cta.cue("visit", 0.6), "tick", 0.45),
    ...(cta.has("whatsapp") ? [at(tl, "cta", cta.cue("whatsapp"), "tick", 0.45)] : []),
  ];
};

export const SoundFamiliar: React.FC<{ cut: string }> = ({ cut }) => {
  const tl = SERIES[cut];
  const ep = EPISODES[cut];
  const sc = tl.scenes;
  const fix = sc.fix!, cta = sc.cta!;
  return (
    <TimelineProvider tl={tl}>
      <TlCtx.Provider value={tl}>
        <AbsoluteFill style={{ background: C.ink }}>
          <Sequence from={sc.problem!.from} durationInFrames={sc.problem!.dur}><ep.Problem /></Sequence>
          <Sequence from={sc.familiar!.from} durationInFrames={sc.familiar!.dur}><Familiar /></Sequence>
          <Sequence from={fix.from} durationInFrames={fix.dur}>
            <Showcase from={fix.from} dur={fix.dur} features={[{ key: "fix", ...ep.feature }]} />
          </Sequence>
          <Sequence from={cta.from - CTA_PREROLL} durationInFrames={cta.dur + CTA_PREROLL}><CallToAction lines={[]} /></Sequence>
          <SeriesTag n={ep.n} ctaFrom={cta.from} />
          <Soundtrack sfx={[...commonSfx(tl, { hit: "familiar", show: "fix" }), ...ep.sfx(tl)]} />
        </AbsoluteFill>
      </TlCtx.Provider>
    </TimelineProvider>
  );
};

/* --------------------------------------------------------- returnables video */

const RETURN_FEATURES: Feature[] = [
  { key: "owes", caption: "It knows what's *owed*", Screen: OwesScreen, zoom: { word: "knows", fallback: 0.45, z: 1.1, x: 50, y: 70 } },
  { key: "tripback", caption: "Record what *came back*", Screen: TripBack, zoom: { word: "order", fallback: 0.8, z: 1.08, x: 50, y: 60 } },
  { key: "balances", caption: "See who *still owes*", Screen: Balances },
];
const RETURN_LINES: CtaLine[] = [
  { t: "Every crate.", word: "crate", color: "#fff" },
  { t: "Every cylinder.", word: "cylinder", color: "#fff" },
  { t: "Accounted for.", word: "accounted", color: C.accent },
];

const returnsSfx = (tl: Timeline): Cue[] => {
  const A = sceneInfo(tl, "argument"), L = sceneInfo(tl, "loss"), O = sceneInfo(tl, "owes"), T = sceneInfo(tl, "tripback"), B = sceneInfo(tl, "balances");
  const out: Cue[] = [
    at(tl, "argument", A.cue("says", 0.15), "pop", 0.4), at(tl, "argument", A.cue("book", 0.5), "paper", 0.5),
    at(tl, "argument", A.cue("who", 0.8), "buzz", 0.35),
    ...["crates", "gas", "pallets"].map((w, i) => at(tl, "loss", L.cue(w, i * 0.15), "pop", 0.35)),
    at(tl, "loss", L.cue("every", 0.55), "whoosh", 0.4),
    at(tl, "reveal", 0, "impact", 0.65), at(tl, "reveal", 4, "whoosh", 0.3),
    at(tl, "owes", 0, "whoosh", 0.35), at(tl, "tripback", 0, "swipe", 0.3), at(tl, "balances", 0, "swipe", 0.3),
    at(tl, "owes", O.cue("goes", 0.2), "tick", 0.4), at(tl, "owes", O.cue("knows", 0.45), "ding", 0.35),
    at(tl, "tripback", T.cue("order", 0.8, 1), "ding", 0.3),
    at(tl, "balances", B.cue("owes", 0.35), "tick", 0.4), at(tl, "balances", B.cue("store", 0.8), "tick", 0.4),
  ];
  const came = T.cue("came", 0.45);
  for (let f = came; f < came + 20; f += 3) out.push(at(tl, "tripback", f, "type", 0.3));
  const cta = sceneInfo(tl, "cta");
  out.push(at(tl, "cta", -CTA_PREROLL, "whoosh", 0.3), at(tl, "cta", 0, "impact", 0.45),
    at(tl, "cta", cta.cue("visit", 0.6), "tick", 0.45), at(tl, "cta", cta.cue("whatsapp", 0.8), "tick", 0.45));
  return out;
};

export const Returnables: React.FC = () => {
  const tl = SERIES.returns;
  const sc = tl.scenes;
  const showFrom = sc.owes!.from;
  const showDur = sc.cta!.from - showFrom;
  return (
    <TimelineProvider tl={tl}>
      <AbsoluteFill style={{ background: C.ink }}>
        <Sequence from={sc.argument!.from} durationInFrames={sc.argument!.dur}><Argument /></Sequence>
        <Sequence from={sc.loss!.from} durationInFrames={sc.loss!.dur}><Loss /></Sequence>
        <Sequence from={sc.reveal!.from} durationInFrames={sc.reveal!.dur}><Reveal /></Sequence>
        <Sequence from={showFrom} durationInFrames={showDur}><Showcase from={showFrom} dur={showDur} features={RETURN_FEATURES} /></Sequence>
        <Sequence from={sc.cta!.from - CTA_PREROLL} durationInFrames={sc.cta!.dur + CTA_PREROLL}><CallToAction lines={RETURN_LINES} /></Sequence>
        <Soundtrack sfx={returnsSfx(tl)} />
      </AbsoluteFill>
    </TimelineProvider>
  );
};
