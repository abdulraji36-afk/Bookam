import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { NavyBackdrop } from "../components/PaperBackdrop";
import { Avatar, Card, Chip, Phone, ScreenTitle, naira } from "../components/Phone";
import { pop, ramp } from "../components/anim";
import { SCENES, SHOWCASE } from "../timeline";
import { C, FONT } from "../theme";
import { Truck } from "./Problems";

/** Feature screens, with start/end relative to the start of the showcase. */
const rel = (k: keyof typeof SCENES) => ({
  s: SCENES[k].from - SHOWCASE.from,
  e: SCENES[k].from - SHOWCASE.from + SCENES[k].dur,
});
const FEATURES = [
  { ...rel("customers"), caption: "Every *customer,* organised", Screen: Customers },
  { ...rel("orders"), caption: "Orders, handled *automatically*", Screen: Orders },
  { ...rel("dispatch"), caption: "Know *who* moved *what*", Screen: Dispatch },
  { ...rel("stock"), caption: "Every crate *tracked*", Screen: Stock },
  { ...rel("realtime"), caption: "*Real-time* updates. Full *transparency.*", Screen: Realtime },
];

export const Showcase: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = pop(frame, 0, 15);
  const exit = ramp(frame, SHOWCASE.dur - 10, SHOWCASE.dur);
  return (
    <AbsoluteFill>
      <NavyBackdrop glowY={60} />
      {FEATURES.map(({ s, e, caption }) =>
        frame >= s && frame < e ? (
          <AbsoluteFill key={caption} style={{ opacity: 1 - ramp(frame, e - 5, e) }}>
            <Sequence from={s} layout="none"><Caption text={caption} color="#fff" highlight={C.accent} size={84} top={150} /></Sequence>
          </AbsoluteFill>
        ) : null,
      )}
      <Progress frame={frame} />
      <AbsoluteFill style={{
        alignItems: "center", paddingTop: 520,
        transform: `translateY(${(1 - enter) * 1400 + exit * 200}px) scale(${1 - exit * 0.2})`, opacity: 1 - exit,
      }}>
        <Phone overlay={<Notifications frame={frame - rel("realtime").s} />}>
          {FEATURES.map(({ s, e, Screen, caption }, i) => {
            if (frame < s - 1 || frame > e + 10) return null;
            const inP = i === 0 ? 1 : pop(frame, s, 16);
            const outP = i === FEATURES.length - 1 ? 0 : ramp(frame, e, e + 10);
            const x = (1 - inP) * 100 - outP * 100;
            return (
              <AbsoluteFill key={caption} style={{ transform: `translateX(${x}%)`, padding: 40 }}>
                <Screen f={frame - s} />
              </AbsoluteFill>
            );
          })}
        </Phone>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Progress: React.FC<{ frame: number }> = ({ frame }) => (
  <div style={{ position: "absolute", top: 440, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 16 }}>
    {FEATURES.map(({ s, e }, i) => {
      const active = frame >= s && frame < e;
      const done = frame >= e;
      return (
        <div key={i} style={{
          width: active ? 90 : 26, height: 14, borderRadius: 7,
          background: active ? C.accent : done ? "rgba(245,163,10,0.5)" : "rgba(255,255,255,0.18)",
        }} />
      );
    })}
  </div>
);

/* Customers -------------------------------------------------------------- */
const CUSTOMERS = [
  { n: "Chinedu Okafor", p: "0803 412 9921", b: 0, c: "#1f6fb2" },
  { n: "Aisha Bello", p: "0806 220 4417", b: 12000, c: "#8e44ad" },
  { n: "Tunde Bakare", p: "0812 775 0193", b: 0, c: "#17643a" },
  { n: "Ngozi Eze", p: "0909 340 1182", b: 4500, c: "#c0392b" },
  { n: "Emeka Obi", p: "0705 118 6630", b: 0, c: "#d35400" },
  { n: "Fatima Yusuf", p: "0817 902 3345", b: 0, c: "#16a085" },
];
function Customers({ f }: { f: number }) {
  return (
    <div>
      <ScreenTitle title="Customers" right={<Chip bg={C.chip} fg={C.ink}>128 total</Chip>} />
      <div style={{
        background: "#fff", border: `2px solid ${C.line}`, borderRadius: 24, padding: "20px 28px",
        fontSize: 30, color: C.field, marginBottom: 24,
      }}>Search customers…</div>
      {CUSTOMERS.map((c, i) => {
        const p = pop(f, 4 + i * 3.5, 14);
        return (
          <div key={c.n} style={{
            display: "flex", alignItems: "center", gap: 22, background: "#fff", borderRadius: 26, padding: "20px 24px",
            marginBottom: 16, border: `2px solid ${C.line}`, opacity: p, transform: `translateX(${(1 - p) * 120}px)`,
          }}>
            <Avatar name={c.n} color={c.c} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 34, fontWeight: 750 }}>{c.n}</div>
              <div style={{ fontSize: 26, color: C.inkSoft }}>{c.p}</div>
            </div>
            {c.b ? <Chip bg="#fff4dc" fg={C.accentStrong} size={24}>Owes {naira(c.b)}</Chip>
              : <Chip bg={C.successSoft} fg={C.success} size={24}>Settled</Chip>}
          </div>
        );
      })}
    </div>
  );
}

/* Orders ------------------------------------------------------------------ */
const STATUS = [
  { at: 0, label: "Pending", bg: "#fff4dc", fg: C.accentStrong },
  { at: 18, label: "Confirmed", bg: "#e3effa", fg: C.chart },
  { at: 34, label: "Dispatched", bg: C.successSoft, fg: C.success },
];
function Orders({ f }: { f: number }) {
  const st = [...STATUS].reverse().find((s) => f >= s.at) ?? STATUS[0];
  const bump = pop(f, st.at, 8);
  const lines = [["20 × Crate of drinks", 92000], ["4 × Gas cylinder 12.5kg", 72000], ["2 × Bag of rice 50kg", 96000]] as const;
  return (
    <div>
      <ScreenTitle title="Orders" right={<Chip bg={C.chip} fg={C.ink}>Today · 14</Chip>} />
      <Card style={{ transform: `scale(${0.9 + pop(f, 2, 14) * 0.1})` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 28, color: C.inkSoft, fontWeight: 600 }}>Order #1042</div>
            <div style={{ fontSize: 42, fontWeight: 800 }}>Aisha Bello</div>
          </div>
          <span style={{ transform: `scale(${0.8 + bump * 0.2})`, display: "inline-block" }}>
            <Chip bg={st.bg} fg={st.fg} size={30}>{st.label === "Dispatched" ? "✓ " : ""}{st.label}</Chip>
          </span>
        </div>
        <div style={{ height: 2, background: C.line, margin: "24px 0" }} />
        {lines.map(([l, v], i) => (
          <div key={l} style={{
            display: "flex", justifyContent: "space-between", fontSize: 30, marginBottom: 14,
            opacity: ramp(f, 6 + i * 3, 12 + i * 3),
          }}>
            <span>{l}</span><span style={{ fontWeight: 700 }}>{naira(v)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 38, fontWeight: 850, marginTop: 14 }}>
          <span>Total</span><span>{naira(260000)}</span>
        </div>
      </Card>
      {[["#1043", "Emeka Obi", "8 crates"], ["#1044", "Ngozi Eze", "2 gas cylinders"], ["#1045", "Fatima Yusuf", "5 bags rice"]].map(
        ([id, n, what], i) => {
          const p = pop(f, 22 + i * 7, 13);
          return (
            <div key={id} style={{
              marginTop: 18, display: "flex", alignItems: "center", gap: 18, background: "#fff", borderRadius: 24,
              border: `2px solid ${C.line}`, padding: "20px 26px", fontSize: 30, opacity: p,
              transform: `translateY(${(1 - p) * 60}px)`,
            }}>
              <span style={{ fontWeight: 800 }}>{id}</span><span style={{ flex: 1 }}>{n} · {what}</span>
              <Chip bg="#e3effa" fg={C.chart} size={22}>Auto</Chip>
            </div>
          );
        },
      )}
    </div>
  );
}

/* Dispatch ---------------------------------------------------------------- */
function Dispatch({ f }: { f: number }) {
  const rows = [
    { k: "Released by", v: "Musa Ibrahim", sub: "Storekeeper", av: "#1f6fb2" },
    { k: "Driver", v: "Tunde Bakare", sub: "Truck LAG 482 KJ", av: "#17643a" },
  ];
  const stamp = pop(f, 34, 9, 0.7);
  const truckX = interpolate(f, [4, 70], [-320, 760], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div>
      <ScreenTitle title="Dispatch" right={<Chip bg={C.chip} fg={C.ink}>#D-2207</Chip>} />
      <div style={{ height: 150, position: "relative", overflow: "hidden", marginBottom: 10 }}>
        <div style={{ position: "absolute", left: truckX, top: 0, transform: "scale(0.7)", transformOrigin: "left top" }}>
          <Truck label="BOOKAM" />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 2, height: 6, borderRadius: 3, background: C.line }} />
      </div>
      <Card>
        {rows.map((r, i) => {
          const p = pop(f, 6 + i * 6, 14);
          return (
            <div key={r.k} style={{
              display: "flex", alignItems: "center", gap: 22, marginBottom: 28, opacity: p,
              transform: `translateX(${(1 - p) * 80}px)`,
            }}>
              <Avatar name={r.v} color={r.av} size={92} />
              <div>
                <div style={{ fontSize: 26, color: C.inkSoft, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{r.k}</div>
                <div style={{ fontSize: 42, fontWeight: 800 }}>{r.v}</div>
                <div style={{ fontSize: 28, color: C.inkSoft }}>{r.sub}</div>
              </div>
            </div>
          );
        })}
        <div style={{ height: 2, background: C.line, margin: "4px 0 24px" }} />
        {[["Order", "#1042 · Aisha Bello"], ["Items", "20 crates · 4 cylinders"], ["Time", "Today, 10:42 AM"]].map(([k, v], i) => (
          <div key={k} style={{
            display: "flex", justifyContent: "space-between", fontSize: 32, marginBottom: 14,
            opacity: ramp(f, 18 + i * 3, 24 + i * 3),
          }}>
            <span style={{ color: C.inkSoft }}>{k}</span><span style={{ fontWeight: 750 }}>{v}</span>
          </div>
        ))}
        <div style={{ height: 130, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 10 }}>
          <div style={{
            border: `8px solid ${C.success}`, color: C.success, borderRadius: 22,
            padding: "6px 26px", fontSize: 44, fontWeight: 900, letterSpacing: "0.06em",
            transform: `rotate(-5deg) scale(${2.2 - stamp * 1.2})`, opacity: stamp, background: "rgba(230,244,234,0.85)",
          }}>✓ SIGNED OFF</div>
        </div>
      </Card>
    </div>
  );
}

/* Stock ------------------------------------------------------------------- */
function Stock({ f }: { f: number }) {
  const items = [
    { n: "Crate of drinks", v: 312, out: 48, pct: 0.78 },
    { n: "Gas cylinder 12.5kg", v: 64, out: 16, pct: 0.55 },
    { n: "Bag of rice 50kg", v: 210, out: 0, pct: 0.9 },
  ];
  const ret = pop(f, 40, 12);
  const returned = Math.round(interpolate(f, [44, 64], [0, 12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <div>
      <ScreenTitle title="Stock" right={<Chip bg={C.successSoft} fg={C.success}>All counted</Chip>} />
      {items.map((it, i) => {
        const p = pop(f, 4 + i * 5, 14);
        const v = Math.round(interpolate(f, [4 + i * 5, 30 + i * 5], [0, it.v], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
        return (
          <Card key={it.n} style={{ marginBottom: 18, padding: 28, opacity: p, transform: `translateY(${(1 - p) * 60}px)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 34, fontWeight: 750 }}>{it.n}</div>
              <div style={{ fontSize: 54, fontWeight: 900 }}>{v}</div>
            </div>
            <div style={{ height: 16, borderRadius: 8, background: C.chip, marginTop: 14, overflow: "hidden" }}>
              <div style={{ width: `${it.pct * ramp(f, 6 + i * 5, 30 + i * 5) * 100}%`, height: "100%", background: C.accent, borderRadius: 8 }} />
            </div>
            <div style={{ fontSize: 26, color: C.inkSoft, marginTop: 10 }}>
              In store · {it.out ? `${it.out} out with customers` : "nothing outstanding"}
            </div>
          </Card>
        );
      })}
      <div style={{
        display: "flex", alignItems: "center", gap: 20, background: C.successSoft, border: `2px solid #bfe3cb`,
        borderRadius: 28, padding: "22px 26px", transform: `scale(${ret})`, opacity: ret,
      }}>
        <div style={{ fontSize: 46, width: 76, height: 76, borderRadius: 38, background: C.success, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>↩</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.success }}>{returned} crates returned</div>
          <div style={{ fontSize: 26, color: C.inkSoft }}>Chinedu Okafor · received by Musa</div>
        </div>
      </div>
    </div>
  );
}

/* Real-time + transparency ---------------------------------------------- */
function Realtime({ f }: { f: number }) {
  const bars = [0.42, 0.55, 0.48, 0.7, 0.62, 0.8, 1];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const sales = interpolate(f, [4, 40], [0, 1240500], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const log = [
    ["10:42", "Musa dispatched #1042 → Tunde"],
    ["10:55", "Chinedu returned 12 crates"],
    ["11:03", "New order #1046 · Emeka Obi"],
  ];
  return (
    <div>
      <ScreenTitle title="Daily report" right={<Chip bg={C.chip} fg={C.ink}>Live</Chip>} />
      <Card style={{ padding: 30 }}>
        <div style={{ fontSize: 28, color: C.inkSoft, fontWeight: 600 }}>Today's sales</div>
        <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: "-0.02em" }}>{naira(sales)}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 200, marginTop: 18 }}>
          {bars.map((b, i) => {
            const p = pop(f, 6 + i * 3, 14);
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: "100%", height: 160 * b * p, borderRadius: 10,
                  background: i === bars.length - 1 ? C.accent : C.chart, opacity: i === bars.length - 1 ? 1 : 0.85,
                }} />
                <div style={{ fontSize: 22, color: C.inkSoft, fontWeight: 700 }}>{days[i]}</div>
              </div>
            );
          })}
        </div>
      </Card>
      <div style={{ fontSize: 30, fontWeight: 800, margin: "28px 0 14px" }}>Activity</div>
      {log.map(([t, txt], i) => {
        const p = pop(f, 30 + i * 8, 13);
        return (
          <div key={t} style={{
            display: "flex", gap: 18, alignItems: "center", background: "#fff", border: `2px solid ${C.line}`,
            borderRadius: 22, padding: "18px 22px", marginBottom: 12, fontSize: 28, opacity: p,
            transform: `translateX(${(1 - p) * 100}px)`,
          }}>
            <span style={{ fontWeight: 800, color: C.chart }}>{t}</span><span>{txt}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Push-style alerts that drop in over the screen during the real-time feature. */
const Notifications: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < 0) return null;
  const alerts = [
    { at: 12, title: "Order #1042 dispatched", body: "By Musa Ibrahim · Driver: Tunde Bakare" },
    { at: 46, title: "12 crates returned", body: "Chinedu Okafor · Stock updated" },
  ];
  return (
    <>
      {alerts.map((a, i) => {
        const p = pop(frame, a.at, 13);
        const gone = ramp(frame, a.at + 30, a.at + 38);
        return (
          <div key={a.title} style={{
            position: "absolute", left: 24, right: 24, top: 90 + (1 - p) * -260 - gone * 260,
            background: "rgba(255,255,255,0.97)", borderRadius: 34, padding: "22px 26px", display: "flex", gap: 20,
            boxShadow: "0 20px 50px rgba(11,31,51,0.35)", opacity: p * (1 - gone), zIndex: 10 + i,
            fontFamily: FONT,
          }}>
            <div style={{ width: 76, height: 76, borderRadius: 20, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="44" height="44" viewBox="0 0 24 24"><path d="M2 11 22 3l-4 18-6-6-4 4 1-6 9-8-11 7z" fill={C.accent} /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: C.inkSoft, fontWeight: 600 }}>
                <span>BOOKAM ALERTS</span><span>now</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: C.ink }}>{a.title}</div>
              <div style={{ fontSize: 26, color: C.inkSoft }}>{a.body}</div>
            </div>
          </div>
        );
      })}
    </>
  );
};
