import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { NavyBackdrop } from "../components/PaperBackdrop";
import { Avatar, Card, Chip, Phone, ScreenTitle, naira } from "../components/Phone";
import { pop, ramp } from "../components/anim";
import { SceneKey, useScene, useTimeline } from "../timeline";
import { C, FONT } from "../theme";
import { Truck } from "./Problems";

type ScreenProps = { f: number };
type Feature = {
  key: SceneKey;
  caption: string;
  Screen: React.FC<ScreenProps>;
  /** camera push towards a point of the phone (percent), starting at a spoken word */
  zoom?: { word: string; fallback: number; z: number; x: number; y: number };
};

const FEATURES: Feature[] = [
  { key: "customers", caption: "Every *customer,* organised", Screen: Customers,
    zoom: { word: "place", fallback: 0.7, z: 1.12, x: 50, y: 40 } },
  { key: "orders", caption: "Orders, handled *automatically*", Screen: Orders,
    zoom: { word: "automatically", fallback: 0.5, z: 1.14, x: 50, y: 30 } },
  { key: "dispatch", caption: "Know *who* moved *what*", Screen: Dispatch,
    zoom: { word: "released", fallback: 0.4, z: 1.12, x: 50, y: 52 } },
  { key: "stock", caption: "Every crate *tracked*", Screen: Stock,
    zoom: { word: "return", fallback: 0.7, z: 1.12, x: 50, y: 75 } },
  { key: "realtime", caption: "*Real-time* updates. Full *transparency.*", Screen: Realtime },
  { key: "easy", caption: "Simple for *anyone* on your team", Screen: Easy,
    zoom: { word: "simple", fallback: 0.2, z: 1.1, x: 50, y: 45 } },
];

const PHONE_TOP = 440;

export const Showcase: React.FC<{ from: number; dur: number }> = ({ from, dur }) => {
  const frame = useCurrentFrame();
  const tl = useTimeline();
  const feats = FEATURES.filter((x) => tl.scenes[x.key]).map((x) => {
    const sc = tl.scenes[x.key]!;
    return { ...x, s: sc.from - from, e: sc.from - from + sc.dur };
  });
  const enter = pop(frame, 0, 15);
  const exit = ramp(frame, dur - 14, dur);
  const active = feats.find((x) => frame >= x.s && frame < x.e) ?? feats[feats.length - 1];
  return (
    <AbsoluteFill>
      <NavyBackdrop glowY={62} />
      <AbsoluteFill style={{
        alignItems: "center", paddingTop: PHONE_TOP,
        transform: `translateY(${(1 - enter) * 1500 + exit * 260}px) scale(${1 - exit * 0.35})`, opacity: 1 - exit,
      }}>
        <ZoomRig feature={active} frame={frame}>
          <Phone overlay={tl.scenes.realtime ? <Notifications frame={frame - feats.find((x) => x.key === "realtime")!.s} /> : null}>
            {feats.map(({ s, e, Screen, key }, i) => {
              if (frame < s - 1 || frame > e + 12) return null;
              const inP = i === 0 ? 1 : pop(frame, s, 16);
              const outP = i === feats.length - 1 ? 0 : ramp(frame, e, e + 12);
              return (
                <AbsoluteFill key={key} style={{ transform: `translateX(${(1 - inP) * 100 - outP * 100}%)`, padding: 44 }}>
                  <Sequence from={s} layout="none"><Screen f={frame - s} /></Sequence>
                </AbsoluteFill>
              );
            })}
          </Phone>
        </ZoomRig>
      </AbsoluteFill>
      {/* captions sit above the phone, on a band that hides a zoomed phone's top edge */}
      <AbsoluteFill style={{
        background: `linear-gradient(180deg, ${C.ink} 0%, ${C.ink} 420px, rgba(11,31,51,0) 470px)`, height: 480,
      }} />
      {feats.map(({ s, e, caption, key }) =>
        frame >= s && frame < e ? (
          <AbsoluteFill key={key} style={{ opacity: 1 - ramp(frame, e - 5, e) }}>
            <Sequence from={s} layout="none">
              <Caption text={caption} color="#fff" highlight={C.accent} size={84} top={190} />
            </Sequence>
          </AbsoluteFill>
        ) : null,
      )}
      <div style={{ position: "absolute", top: 395, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 16 }}>
        {feats.map(({ s, e, key }) => (
          <div key={key} style={{
            width: frame >= s && frame < e ? 90 : 26, height: 14, borderRadius: 7,
            background: frame >= s && frame < e ? C.accent : frame >= e ? "rgba(245,163,10,0.5)" : "rgba(255,255,255,0.18)",
          }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Pushes the camera in on the detail each feature is about, then eases back out before the next one. */
const ZoomRig: React.FC<{ feature: Feature & { s: number; e: number }; frame: number; children: React.ReactNode }> = ({
  feature, frame, children,
}) => {
  const S = useScene(feature.key);
  const z = feature.zoom;
  let scale = 1;
  if (z) {
    const at = feature.s + S.cue(z.word, z.fallback);
    const p = pop(frame, at, 22, 1.2) * (1 - ramp(frame, feature.e - 14, feature.e - 2));
    scale = 1 + (z.z - 1) * p;
  }
  return (
    <div style={{ transform: `scale(${scale})`, transformOrigin: z ? `${z.x}% ${z.y}%` : "50% 50%" }}>{children}</div>
  );
};

/* Customers: list fills, then a search finds one customer's full record -- */
const CUSTOMERS = [
  { n: "Chinedu Okafor", p: "0803 412 9921", b: 0, c: "#1f6fb2" },
  { n: "Aisha Bello", p: "0806 220 4417", b: 12000, c: "#8e44ad" },
  { n: "Tunde Bakare", p: "0812 775 0193", b: 0, c: "#17643a" },
  { n: "Ngozi Eze", p: "0909 340 1182", b: 4500, c: "#c0392b" },
  { n: "Emeka Obi", p: "0705 118 6630", b: 0, c: "#d35400" },
  { n: "Fatima Yusuf", p: "0817 902 3345", b: 0, c: "#16a085" },
];
function Customers({ f }: ScreenProps) {
  const S = useScene("customers");
  const search = S.dur >= 80;
  const typeAt = S.cue("organised", 0.4) + 4;
  const query = "Aisha";
  const typed = search ? Math.max(0, Math.min(query.length, Math.floor((f - typeAt) / 2.5))) : 0;
  const filtered = search ? ramp(f, typeAt + 14, typeAt + 22) : 0;
  const detail = search ? pop(f, typeAt + 18, 14) : 0;
  return (
    <div>
      <ScreenTitle title="Customers" right={<Chip bg={C.chip} fg={C.ink}>128 total</Chip>} />
      <div style={{
        background: "#fff", border: `3px solid ${typed ? C.accent : C.line}`, borderRadius: 26, padding: "22px 30px",
        fontSize: 36, color: typed ? C.ink : C.field, marginBottom: 24, display: "flex", alignItems: "center", gap: 16,
      }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.field} strokeWidth={2.6}>
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />
        </svg>
        {typed ? query.slice(0, typed) : "Search customers…"}
        {typed && typed < query.length + 1 && Math.floor(f / 8) % 2 === 0 ? <span style={{ color: C.accent }}>|</span> : null}
      </div>
      {CUSTOMERS.map((c, i) => {
        const p = pop(f, 3 + i * 3, 14);
        const isHit = c.n.startsWith("Aisha");
        const hide = isHit ? 0 : filtered;
        return (
          <div key={c.n} style={{
            maxHeight: 160 * (1 - hide), overflow: "hidden", opacity: p * (1 - hide), marginBottom: 18 * (1 - hide),
            transform: `translateX(${(1 - p) * 140}px)`,
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 24, background: "#fff", borderRadius: 28, padding: "22px 26px",
              border: `3px solid ${isHit && filtered > 0 ? C.accent : C.line}`,
            }}>
              <Avatar name={c.n} color={c.c} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 40, fontWeight: 750 }}>{c.n}</div>
                <div style={{ fontSize: 30, color: C.inkSoft }}>{c.p}</div>
              </div>
              {c.b ? <Chip bg="#fff4dc" fg={C.accentStrong} size={28}>Owes {naira(c.b)}</Chip>
                : <Chip bg={C.successSoft} fg={C.success} size={28}>Settled</Chip>}
            </div>
          </div>
        );
      })}
      {search ? (
        <div style={{ opacity: detail, transform: `translateY(${(1 - detail) * 80}px)` }}>
          <Card style={{ marginTop: 6 }}>
            {[["Orders", "23"], ["Crates out", "20"], ["Last order", "Today, 10:15 AM"], ["Balance", "Owes ₦12,000"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 36, padding: "10px 0", borderBottom: `2px solid ${C.line}` }}>
                <span style={{ color: C.inkSoft }}>{k}</span><span style={{ fontWeight: 800 }}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

/* Orders: one order moves through its steps by itself ------------------ */
function Orders({ f }: ScreenProps) {
  const S = useScene("orders");
  const steps = [
    { label: "Booked", at: 4 },
    { label: "Confirmed", at: S.cue("automatically", 0.45) },
    { label: "Dispatched", at: S.cue("booking", 0.75) },
    ...(S.has("delivery") ? [{ label: "Delivered", at: S.cue("delivery", 1) }] : []),
  ];
  const cur = steps.filter((s) => f >= s.at).length - 1;
  const done = cur === steps.length - 1;
  const bump = pop(f, steps[Math.max(0, cur)].at, 8);
  const lines = [["20 × Crate of drinks", 92000], ["4 × Gas cylinder 12.5kg", 72000], ["2 × Bag of rice 50kg", 96000]] as const;
  const chip = done ? { bg: C.successSoft, fg: C.success } : cur >= 1 ? { bg: "#e3effa", fg: C.chart } : { bg: "#fff4dc", fg: C.accentStrong };
  return (
    <div>
      <ScreenTitle title="Orders" right={<Chip bg={C.chip} fg={C.ink}>Today · 14</Chip>} />
      <Card style={{ transform: `scale(${0.9 + pop(f, 2, 14) * 0.1})` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 30, color: C.inkSoft, fontWeight: 600 }}>Order #1042</div>
            <div style={{ fontSize: 50, fontWeight: 850 }}>Aisha Bello</div>
          </div>
          <span style={{ transform: `scale(${0.8 + bump * 0.2})`, display: "inline-block" }}>
            <Chip bg={chip.bg} fg={chip.fg} size={34}>{done ? "✓ " : ""}{steps[Math.max(0, cur)].label}</Chip>
          </span>
        </div>
        {/* step tracker */}
        <div style={{ display: "flex", alignItems: "flex-start", margin: "34px 0 10px" }}>
          {steps.map((s, i) => {
            const on = f >= s.at;
            const fill = i === 0 ? 0 : ramp(f, s.at - 6, s.at);
            return (
              <React.Fragment key={s.label}>
                {i > 0 ? (
                  <div style={{ flex: 1, height: 8, background: C.chip, borderRadius: 4, marginTop: 22, overflow: "hidden" }}>
                    <div style={{ width: `${fill * 100}%`, height: "100%", background: C.success }} />
                  </div>
                ) : null}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 150 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 26, background: on ? C.success : C.chip, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900,
                    transform: `scale(${on ? 0.7 + pop(f, s.at, 9) * 0.3 : 1})`,
                  }}>{on ? "✓" : ""}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: on ? C.ink : C.field, marginTop: 8 }}>{s.label}</div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ height: 2, background: C.line, margin: "20px 0" }} />
        {lines.map(([l, v], i) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 34, marginBottom: 14, opacity: ramp(f, 6 + i * 3, 12 + i * 3) }}>
            <span>{l}</span><span style={{ fontWeight: 700 }}>{naira(v)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 42, fontWeight: 850, marginTop: 14 }}>
          <span>Total</span><span>{naira(260000)}</span>
        </div>
      </Card>
      {[["#1043", "Emeka Obi · 8 crates"], ["#1044", "Ngozi Eze · 2 gas cylinders"], ["#1045", "Fatima Yusuf · 5 bags rice"]].map(([id, what], i) => {
        const p = pop(f, S.dur * 0.35 + i * 7, 13);
        return (
          <div key={id} style={{
            marginTop: 18, display: "flex", alignItems: "center", gap: 18, background: "#fff", borderRadius: 26,
            border: `3px solid ${C.line}`, padding: "22px 28px", fontSize: 34, opacity: p, transform: `translateY(${(1 - p) * 60}px)`,
          }}>
            <span style={{ fontWeight: 800 }}>{id}</span><span style={{ flex: 1 }}>{what}</span>
            <Chip bg="#e3effa" fg={C.chart} size={26}>Auto</Chip>
          </div>
        );
      })}
    </div>
  );
}

/* Dispatch: who released it, which driver, when -- signed off ---------- */
function Dispatch({ f }: ScreenProps) {
  const S = useScene("dispatch");
  const relAt = S.cue("released", 0.3);
  const drvAt = S.cue("driver", 0.65);
  const stampAt = Math.min(S.dur - 22, S.vo + S.voLen - 2);
  const stamp = pop(f, stampAt, 9, 0.7);
  // truck rolls in, parks, and leaves once signed off
  const park = pop(f, 2, 18, 1.1);
  const leave = ramp(f, stampAt + 8, S.dur);
  const truckX = -430 + park * 470 + leave * leave * 900;
  const rows = [
    { k: "Released by", v: "Musa Ibrahim", sub: "Storekeeper", av: "#1f6fb2", at: relAt },
    { k: "Driver", v: "Tunde Bakare", sub: "Truck LAG 482 KJ", av: "#17643a", at: drvAt },
  ];
  return (
    <div>
      <ScreenTitle title="Dispatch" right={<Chip bg={C.chip} fg={C.ink}>#D-2207</Chip>} />
      <div style={{ height: 170, position: "relative", overflow: "hidden", marginBottom: 14 }}>
        <div style={{ position: "absolute", left: truckX, top: 6 }}><Truck label="BOOKAM" scale={0.72} /></div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 2, height: 6, borderRadius: 3, background: C.line }} />
      </div>
      <Card>
        {rows.map((r) => {
          const p = pop(f, r.at, 14);
          return (
            <div key={r.k} style={{ position: "relative", marginBottom: 30, height: 150 }}>
            {/* empty slot until the name is spoken */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 24, opacity: (1 - p) * ramp(f, 4, 10) }}>
              <div style={{ width: 104, height: 104, borderRadius: 52, background: C.chip }} />
              <div>
                <div style={{ fontSize: 28, color: C.inkSoft, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{r.k}</div>
                <div style={{ width: 320, height: 40, borderRadius: 10, background: C.chip, marginTop: 8 }} />
              </div>
            </div>
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 24, opacity: p, transform: `translateX(${(1 - p) * 90}px)`,
            }}>
              <Avatar name={r.v} color={r.av} size={104} />
              <div>
                <div style={{ fontSize: 28, color: C.inkSoft, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{r.k}</div>
                <div style={{ fontSize: 50, fontWeight: 850 }}>{r.v}</div>
                <div style={{ fontSize: 32, color: C.inkSoft }}>{r.sub}</div>
              </div>
            </div>
            </div>
          );
        })}
        <div style={{ height: 2, background: C.line, margin: "4px 0 24px" }} />
        {[["Order", "#1042 · Aisha Bello"], ["Items", "20 crates · 4 cylinders"], ["Time", "Today, 10:42 AM"]].map(([k, v], i) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 36, marginBottom: 14, opacity: ramp(f, 6 + i * 3, 12 + i * 3) }}>
            <span style={{ color: C.inkSoft }}>{k}</span><span style={{ fontWeight: 750 }}>{v}</span>
          </div>
        ))}
        <div style={{ height: 130, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 8 }}>
          <div style={{
            border: `8px solid ${C.success}`, color: C.success, borderRadius: 22, padding: "6px 30px", fontSize: 50, fontWeight: 900,
            letterSpacing: "0.06em", transform: `rotate(-5deg) scale(${2.2 - stamp * 1.2})`, opacity: stamp, background: "rgba(230,244,234,0.85)",
          }}>✓ SIGNED OFF</div>
        </div>
      </Card>
    </div>
  );
}

/* Stock: counted to the last crate, returns go back on the shelf ------- */
function Stock({ f }: ScreenProps) {
  const S = useScene("stock");
  const lastAt = S.cue("last", 0.3);
  const retAt = S.cue("return", 0.65);
  const ret = pop(f, retAt, 12);
  const returned = Math.round(interpolate(f, [retAt + 4, retAt + 22], [0, 12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const items = [
    { n: "Crate of drinks", v: 312, out: 48, pct: 0.78 },
    { n: "Gas cylinder 12.5kg", v: 64, out: 16, pct: 0.55 },
    { n: "Bag of rice 50kg", v: 210, out: 0, pct: 0.9 },
  ];
  const ring = pop(f, lastAt, 12) * (1 - ramp(f, retAt + 24, retAt + 34));
  return (
    <div>
      <ScreenTitle title="Stock" right={<Chip bg={C.successSoft} fg={C.success}>All counted</Chip>} />
      {items.map((it, i) => {
        const p = pop(f, 3 + i * 5, 14);
        const base = Math.round(interpolate(f, [3 + i * 5, 26 + i * 5], [0, it.v], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
        const v = i === 0 ? base + returned : base;
        const out = i === 0 ? it.out - returned : it.out;
        return (
          <Card key={it.n} style={{
            marginBottom: 20, padding: 30, opacity: p, transform: `translateY(${(1 - p) * 60}px)`,
            boxShadow: i === 0 && ring > 0 ? `0 0 0 ${ring * 8}px rgba(245,163,10,0.85), 0 10px 30px rgba(11,31,51,0.08)` : undefined,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 40, fontWeight: 800 }}>{it.n}</div>
              <div style={{ fontSize: 64, fontWeight: 900 }}>{v}</div>
            </div>
            <div style={{ height: 18, borderRadius: 9, background: C.chip, marginTop: 14, overflow: "hidden" }}>
              <div style={{ width: `${it.pct * ramp(f, 5 + i * 5, 26 + i * 5) * 100}%`, height: "100%", background: C.accent, borderRadius: 9 }} />
            </div>
            <div style={{ fontSize: 30, color: C.inkSoft, marginTop: 12 }}>
              In store · {out ? `${out} out with customers` : "nothing outstanding"}
            </div>
          </Card>
        );
      })}
      <div style={{
        display: "flex", alignItems: "center", gap: 22, background: C.successSoft, border: "3px solid #bfe3cb",
        borderRadius: 30, padding: "24px 28px", transform: `scale(${ret})`, opacity: ret,
      }}>
        <div style={{ fontSize: 52, width: 90, height: 90, borderRadius: 45, background: C.success, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>↩</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 40, fontWeight: 850, color: C.success }}>{returned} crates returned</div>
          <div style={{ fontSize: 30, color: C.inkSoft }}>Chinedu Okafor · received by Musa</div>
        </div>
      </div>
    </div>
  );
}

/* Real-time report + who-did-what activity log ------------------------- */
function Realtime({ f }: ScreenProps) {
  const S = useScene("realtime");
  const bars = [0.42, 0.55, 0.48, 0.7, 0.62, 0.8, 1];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const sales = interpolate(f, [4, S.dur * 0.45], [0, 1240500], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logAt = Math.min(S.cue("full", 0.5) - 6, Math.round(S.dur * 0.35));
  const log = [
    ["10:42", "Musa", "dispatched #1042 → Tunde", "#1f6fb2"],
    ["10:55", "Musa", "received 12 crates from Chinedu", "#1f6fb2"],
    ["11:03", "Bola", "booked #1046 · Emeka Obi", "#8e44ad"],
  ];
  return (
    <div>
      <ScreenTitle title="Daily report" right={<Chip bg="#ffe9e7" fg={C.danger}>● Live</Chip>} />
      <Card style={{ padding: 34 }}>
        <div style={{ fontSize: 32, color: C.inkSoft, fontWeight: 600 }}>Today's sales</div>
        <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: "-0.02em" }}>{naira(sales)}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, height: 230, marginTop: 16 }}>
          {bars.map((b, i) => {
            const p = pop(f, 6 + i * 3, 14);
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ width: "100%", height: 180 * b * p, borderRadius: 10, background: i === bars.length - 1 ? C.accent : C.chart, opacity: i === bars.length - 1 ? 1 : 0.85 }} />
                <div style={{ fontSize: 26, color: C.inkSoft, fontWeight: 700 }}>{days[i]}</div>
              </div>
            );
          })}
        </div>
      </Card>
      <div style={{ fontSize: 36, fontWeight: 850, margin: "30px 0 16px", opacity: ramp(f, logAt - 6, logAt) }}>Who did what</div>
      {log.map(([t, who, txt, col], i) => {
        const p = pop(f, logAt + i * 7, 13);
        return (
          <div key={t} style={{
            display: "flex", gap: 18, alignItems: "center", background: "#fff", border: `3px solid ${C.line}`,
            borderRadius: 24, padding: "18px 22px", marginBottom: 14, fontSize: 32, opacity: p, transform: `translateX(${(1 - p) * 120}px)`,
          }}>
            <Avatar name={who} color={col} size={64} />
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.chart }}>{t}</div>
              <div><b>{who}</b> {txt}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Phone alerts that drop in over the screen while the real-time feature plays. */
const Notifications: React.FC<{ frame: number }> = ({ frame }) => {
  const S = useScene("realtime");
  if (frame < 0 || frame > S.dur + 10) return null;
  const gap = S.dur >= 110 ? 30 : 34;
  const alerts = [
    { at: 10, title: "Order #1042 dispatched", body: "By Musa Ibrahim · Driver: Tunde Bakare" },
    { at: 10 + gap, title: "12 crates returned", body: "Chinedu Okafor · stock updated" },
    ...(S.dur >= 110 ? [{ at: 10 + gap * 2, title: "Daily report ready", body: "Sales today: ₦1,240,500" }] : []),
  ];
  return (
    <>
      {alerts.map((a, i) => {
        const p = pop(frame, a.at, 13);
        const gone = ramp(frame, a.at + gap - 6, a.at + gap + 2);
        return (
          <div key={a.title} style={{
            position: "absolute", left: 26, right: 26, top: 96 + (1 - p) * -300 - gone * 300,
            background: "rgba(255,255,255,0.98)", borderRadius: 38, padding: "24px 28px", display: "flex", gap: 22,
            boxShadow: "0 24px 60px rgba(11,31,51,0.4)", opacity: p * (1 - gone), zIndex: 10 + i, fontFamily: FONT,
          }}>
            <div style={{ width: 88, height: 88, borderRadius: 22, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="50" height="50" viewBox="0 0 24 24"><path d="M2 11 22 3l-4 18-6-6-4 4 1-6 9-8-11 7z" fill={C.accent} /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: C.inkSoft, fontWeight: 700 }}>
                <span>BOOKAM ALERTS</span><span>now</span>
              </div>
              <div style={{ fontSize: 38, fontWeight: 850, color: C.ink }}>{a.title}</div>
              <div style={{ fontSize: 30, color: C.inkSoft }}>{a.body}</div>
            </div>
          </div>
        );
      })}
    </>
  );
};

/* Easy: big buttons, two taps to dispatch ------------------------------- */
const TILES = [
  { t: "New order", bg: C.accent, fg: C.ink, icon: "M12 5v14M5 12h14" },
  { t: "Dispatch", bg: C.ink, fg: "#fff", icon: "M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-.1M17 19a2 2 0 1 0 0-.1" },
  { t: "Record return", bg: C.success, fg: "#fff", icon: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" },
  { t: "Count stock", bg: C.chart, fg: "#fff", icon: "M4 7h16v13H4zM4 7l2-3h12l2 3M9 12h6" },
];
function Easy({ f }: ScreenProps) {
  const S = useScene("easy");
  const tap1 = Math.round(S.dur * 0.3);
  const sheetAt = tap1 + 4;
  const tap2 = Math.round(S.dur * 0.62);
  const toastAt = tap2 + 5;
  // finger position: hover over "Dispatch", then over "Confirm"
  const toConfirm = ramp(f, tap1 + 8, tap2 - 4);
  const fx = interpolate(toConfirm, [0, 1], [570, 380]);
  const fy = interpolate(toConfirm, [0, 1], [270, 975]);
  const fingerIn = pop(f, tap1 - 14, 14);
  const press = (t: number) => Math.max(0, 1 - Math.abs(f - t) / 4);
  const sheet = pop(f, sheetAt, 15) - ramp(f, toastAt - 2, toastAt + 10);
  const toast = pop(f, toastAt, 12);
  return (
    <div style={{ position: "relative", height: "100%" }}>
      <ScreenTitle title="Quick actions" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {TILES.map((t, i) => {
          const p = pop(f, 2 + i * 3, 13);
          const pressed = i === 1 ? press(tap1) : 0;
          return (
            <div key={t.t} style={{
              background: t.bg, color: t.fg, borderRadius: 36, height: 300, padding: 34,
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              transform: `scale(${p * (1 - pressed * 0.06)})`, boxShadow: "0 14px 30px rgba(11,31,51,0.18)",
            }}>
              <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke={t.fg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              <div style={{ fontSize: 46, fontWeight: 850, lineHeight: 1.05 }}>{t.t}</div>
            </div>
          );
        })}
      </div>
      {/* bottom sheet: confirm the dispatch */}
      <div style={{
        position: "absolute", left: -44, right: -44, top: 700 + (1 - sheet) * 900, background: "#fff", borderRadius: "44px 44px 0 0",
        padding: "34px 44px 300px", boxShadow: "0 -20px 60px rgba(11,31,51,0.25)",
      }}>
        <div style={{ width: 90, height: 10, borderRadius: 5, background: C.line, margin: "0 auto 26px" }} />
        <div style={{ fontSize: 46, fontWeight: 850 }}>Dispatch #1046</div>
        <div style={{ fontSize: 34, color: C.inkSoft, margin: "8px 0 26px" }}>Emeka Obi · 8 crates · Driver: Tunde</div>
        <div style={{
          background: C.accent, borderRadius: 30, padding: "30px 0", textAlign: "center", fontSize: 46, fontWeight: 900, color: C.ink,
          transform: `scale(${1 - press(tap2) * 0.05})`,
        }}>Confirm dispatch</div>
      </div>
      {/* toast */}
      <div style={{
        position: "absolute", left: -20, right: -20, top: 330, display: "flex", justifyContent: "center",
        opacity: toast, transform: `translateY(${(1 - toast) * 40}px) scale(${0.9 + toast * 0.1})`, zIndex: 5,
      }}>
        <div style={{ background: C.success, color: "#fff", borderRadius: 999, padding: "30px 50px", fontSize: 52, fontWeight: 900, boxShadow: "0 24px 60px rgba(23,100,58,0.5)" }}>
          ✓ Dispatched in 2 taps
        </div>
      </div>
      {/* the finger */}
      <div style={{
        position: "absolute", left: fx - 50, top: fy - 50, width: 100, height: 100, borderRadius: 50, zIndex: 6,
        background: "rgba(255,255,255,0.55)", border: "5px solid rgba(11,31,51,0.55)",
        opacity: fingerIn * (1 - ramp(f, toastAt, toastAt + 6)),
        transform: `scale(${1 - Math.max(press(tap1), press(tap2)) * 0.25})`,
        boxShadow: `0 0 0 ${Math.max(press(tap1), press(tap2)) * 30}px rgba(245,163,10,0.35)`,
      }} />
    </div>
  );
}
