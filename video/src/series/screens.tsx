import React from "react";
import { interpolate } from "remotion";
import { Avatar, Card, Chip, ScreenTitle, naira } from "../components/Phone";
import { pop, ramp } from "../components/anim";
import { ScreenProps } from "../scenes/Showcase";
import { Truck } from "../scenes/Problems";
import { useScene } from "../timeline";
import { C, FONT } from "../theme";

/*
 * Phone screens for the "Sound familiar?" episodes and the returnables video.
 * They mirror what BukAm actually records (see supabase/migrations): stock
 * movements with who did them, trips with driver and vehicle, voids that keep
 * the record with a reason, the daily report, Telegram messages ending
 * "By <name>", and returnable balances per customer. The data is made up.
 */

const clampLerp = (f: number, a: number, b: number, from: number, to: number) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const Row: React.FC<{ k: string; v: React.ReactNode; p: number; strong?: boolean }> = ({ k, v, p, strong }) => (
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, fontSize: 36, padding: "14px 0",
    borderBottom: `2px solid ${C.line}`, opacity: p, transform: `translateX(${(1 - p) * 80}px)`,
  }}>
    <span style={{ color: C.inkSoft }}>{k}</span>
    <span style={{ fontWeight: strong ? 850 : 750, textAlign: "right" }}>{v}</span>
  </div>
);

/* Ep 1: every crate in and out, with a name ------------------------------- */
export function StockLedger({ f }: ScreenProps) {
  const S = useScene("fix");
  const nameAt = S.cue("name", 0.8);
  const moves = [
    { q: "+120", what: "Delivery received", who: "Bola Adeyemi", when: "Mon 8:02 AM", in: true },
    { q: "−20", what: "ORD-0042 · Aisha Bello", who: "Musa Ibrahim", when: "Tue 10:15 AM" },
    { q: "−3", what: "ORD-0043 · Emeka Obi", who: "Bola Adeyemi", when: "Wed 9:40 AM" },
  ];
  const flash = pop(f, nameAt, 10);
  const total = pop(f, S.vo + S.voLen - 6, 12);
  return (
    <div>
      <ScreenTitle title="Crate of drinks" right={<Chip bg={C.chip} fg={C.ink}>Stock</Chip>} />
      <div style={{ fontSize: 32, color: C.inkSoft, fontWeight: 700, margin: "-10px 0 20px" }}>Every movement, in and out</div>
      {moves.map((m, i) => {
        const p = pop(f, 6 + i * 9, 14);
        return (
          <Card key={m.what} style={{ marginBottom: 18, padding: 28, opacity: p, transform: `translateY(${(1 - p) * 60}px)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{
                minWidth: 150, fontSize: 56, fontWeight: 900, color: m.in ? C.success : C.danger, textAlign: "center",
              }}>{m.q}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 36, fontWeight: 800 }}>{m.what}</div>
                <div style={{ fontSize: 30, color: C.inkSoft, marginTop: 6 }}>
                  <span style={{
                    background: `rgba(245,163,10,${0.85 * flash})`, color: flash > 0.5 ? C.ink : C.inkSoft, fontWeight: flash > 0.5 ? 850 : 500,
                    borderRadius: 10, padding: "2px 10px",
                  }}>{m.who}</span> · {m.when}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", background: C.successSoft, border: "3px solid #bfe3cb",
        borderRadius: 30, padding: "26px 32px", transform: `scale(${total})`, opacity: total,
      }}>
        <div>
          <div style={{ fontSize: 30, color: C.inkSoft, fontWeight: 700 }}>In store now</div>
          <div style={{ fontSize: 72, fontWeight: 900 }}>97</div>
        </div>
        <Chip bg={C.success} fg="#fff" size={32}>✓ Matches the count</Chip>
      </div>
    </div>
  );
}

/* Ep 2: the trip record ---------------------------------------------------- */
export function TripRecord({ f }: ScreenProps) {
  const S = useScene("fix");
  const park = pop(f, 2, 18, 1.1);
  const at = (w: string, fb: number) => pop(f, S.cue(w, fb), 13);
  return (
    <div>
      <ScreenTitle title="TRP-0007" right={<Chip bg={C.successSoft} fg={C.success}>Dispatched</Chip>} />
      <div style={{ height: 160, position: "relative", overflow: "hidden", marginBottom: 10 }}>
        <div style={{ position: "absolute", left: -430 + park * 470, top: 4 }}><Truck label="BukAm" scale={0.7} /></div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 2, height: 6, borderRadius: 3, background: C.line }} />
      </div>
      <Card>
        <Row k="Driver" v={<span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}><Avatar name="Tunde Bakare" color="#17643a" size={60} />Tunde Bakare</span>} p={at("driver", 0.25)} strong />
        <Row k="Vehicle" v="LAG 482 KJ" p={at("vehicle", 0.4)} strong />
        <div style={{ opacity: at("orders", 0.6), transform: `translateX(${(1 - at("orders", 0.6)) * 80}px)`, padding: "14px 0", borderBottom: `2px solid ${C.line}` }}>
          <div style={{ fontSize: 36, color: C.inkSoft, marginBottom: 8 }}>Orders on board</div>
          {[["ORD-0042", "Aisha Bello", "20 crates"], ["ORD-0043", "Emeka Obi", "8 crates"]].map(([n, c, q]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", fontSize: 34, padding: "6px 0" }}>
              <span><b>{n}</b> · {c}</span><span style={{ fontWeight: 750 }}>{q}</span>
            </div>
          ))}
        </div>
        <Row k="Sent out by" v="Musa Ibrahim · 10:42 AM" p={at("sent", 0.85)} strong />
      </Card>
    </div>
  );
}

/* Ep 3: a voided order stays on record --------------------------------------- */
export function VoidedOrder({ f }: ScreenProps) {
  const S = useScene("fix");
  const voidAt = S.cue("cancelled", 0.5);
  const v = ramp(f, voidAt, voidAt + 6);
  const reason = pop(f, S.cue("reason", 0.7), 12);
  const name = pop(f, S.cue("name", 0.85), 12);
  const others = [["ORD-0038", "Chinedu Okafor · 5 crates", "Completed"], ["ORD-0040", "Fatima Yusuf · 5 bags rice", "Dispatched"]];
  return (
    <div>
      <ScreenTitle title="Orders" right={<Chip bg={C.chip} fg={C.ink}>Today</Chip>} />
      <div style={{ fontSize: 30, color: C.inkSoft, padding: "16px 26px", background: "#fff", borderRadius: 22, border: `3px solid ${C.line}`, marginBottom: 18, opacity: pop(f, 4, 14) }}>
        <b>{others[0][0]}</b> · {others[0][1]} <span style={{ float: "right", color: C.success, fontWeight: 800 }}>{others[0][2]}</span>
      </div>
      <Card style={{ border: `3px solid ${v > 0.5 ? C.danger : C.line}`, transform: `scale(${0.92 + pop(f, 6, 14) * 0.08})` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 30, color: C.inkSoft, fontWeight: 600 }}>ORD-0039</div>
            <div style={{ fontSize: 48, fontWeight: 850 }}>Ngozi Eze</div>
          </div>
          {v > 0.5 ? <Chip bg={C.dangerSoft} fg={C.danger} size={34}>Voided</Chip> : <Chip bg="#fff4dc" fg={C.accentStrong} size={34}>Pending</Chip>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 36, marginTop: 20, position: "relative" }}>
          <span>6 × Crate of drinks</span><span style={{ fontWeight: 800 }}>{naira(27600)}</span>
          <div style={{ position: "absolute", left: -6, top: "50%", height: 5, background: C.danger, width: `${v * 103}%`, borderRadius: 3 }} />
        </div>
        <div style={{
          marginTop: 24, background: C.dangerSoft, borderRadius: 22, padding: "20px 24px", fontSize: 34,
          opacity: reason, transform: `translateY(${(1 - reason) * 30}px)`,
        }}>
          <b>Reason:</b> customer cancelled, wants it next week
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 20, opacity: name, transform: `translateY(${(1 - name) * 30}px)` }}>
          <Avatar name="Bola Adeyemi" color="#8e44ad" size={72} />
          <div style={{ fontSize: 32 }}>
            <div><b>Voided by Bola Adeyemi</b> (Admin)</div>
            <div style={{ color: C.inkSoft }}>Today, 2:14 PM · 6 crates put back in stock</div>
          </div>
        </div>
      </Card>
      <div style={{
        marginTop: 22, textAlign: "center", fontSize: 34, fontWeight: 850, color: C.ink,
        background: C.accent, borderRadius: 999, padding: "20px 0", opacity: name, transform: `scale(${0.9 + name * 0.1})`,
      }}>Still on record. Nothing deleted.</div>
    </div>
  );
}

/* Ep 4: the daily report ------------------------------------------------------ */
export function DailyReport({ f }: ScreenProps) {
  const S = useScene("fix");
  const at = (w: string, fb: number) => pop(f, S.cue(w, fb), 13);
  const value = clampLerp(f, S.cue("orders", 0.3), S.cue("orders", 0.3) + 24, 0, 1240500);
  const stockRows = [["Crate of drinks", 120, 23, 97], ["Gas cylinder 12.5kg", 80, 16, 64], ["Bag of rice 50kg", 230, 20, 210]] as const;
  const head: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: C.inkSoft, textTransform: "uppercase", letterSpacing: "0.05em" };
  return (
    <div>
      <ScreenTitle title="Daily report" right={<Chip bg={C.successSoft} fg={C.success}>Ready · 6:02 PM</Chip>} />
      <Card style={{ padding: 28, opacity: at("orders", 0.3), marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div><div style={head}>Orders recorded</div><div style={{ fontSize: 60, fontWeight: 900 }}>14</div></div>
          <div style={{ textAlign: "right" }}><div style={head}>Order value</div><div style={{ fontSize: 60, fontWeight: 900 }}>{naira(value)}</div></div>
        </div>
      </Card>
      <Card style={{ padding: 28, opacity: at("stock", 0.45), marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr 1fr", rowGap: 10, fontSize: 30 }}>
          <span style={head}>Stock</span><span style={{ ...head, textAlign: "right" }}>Open</span><span style={{ ...head, textAlign: "right" }}>Out</span><span style={{ ...head, textAlign: "right" }}>Close</span>
          {stockRows.map(([n, o, out, c]) => (
            <React.Fragment key={n}>
              <span style={{ fontWeight: 700 }}>{n}</span><span style={{ textAlign: "right" }}>{o}</span>
              <span style={{ textAlign: "right" }}>{out}</span><span style={{ textAlign: "right", fontWeight: 850 }}>{c}</span>
            </React.Fragment>
          ))}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card style={{ padding: 28, opacity: at("trips", 0.6) }}>
          <div style={head}>Trips sent out</div><div style={{ fontSize: 60, fontWeight: 900 }}>4</div>
        </Card>
        <Card style={{ padding: 28, opacity: at("returns", 0.7) }}>
          <div style={head}>Crates owed</div><div style={{ fontSize: 60, fontWeight: 900 }}>48</div>
        </Card>
      </div>
    </div>
  );
}

/* Ep 5: Telegram messages, each ending with who did it -------------------- */
const MSGS = [
  { word: "order", lines: ["New order ORD-0046", "Emeka Obi · 8 crates of drinks"], by: "Bola Adeyemi", time: "10:58" },
  { word: "trip", lines: ["Trip TRP-0007 dispatched", "Driver Tunde Bakare (LAG 482 KJ): 2 orders, 28 items", "Returns to collect on this trip."], by: "Musa Ibrahim", time: "11:04" },
  { word: "return", lines: ["Returns recorded for trip TRP-0007", "20 came back of 28 expected", "Short by 8. It stays on the customers' balances."], by: "Musa Ibrahim", time: "4:20" },
];
export function TelegramChat({ f }: ScreenProps) {
  const S = useScene("fix");
  const whoAt = S.cue("who", 0.9);
  const hl = pop(f, whoAt, 10);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#dfe8f0", fontFamily: FONT }}>
      <div style={{ background: "#fff", padding: "100px 34px 24px", display: "flex", alignItems: "center", gap: 22, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 48, color: C.chart }}>‹</div>
        <div style={{ width: 84, height: 84, borderRadius: 42, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="46" height="46" viewBox="0 0 24 24"><path d="M2 11 22 3l-4 18-6-6-4 4 1-6 9-8-11 7z" fill={C.accent} /></svg>
        </div>
        <div>
          <div style={{ fontSize: 38, fontWeight: 850, color: C.ink }}>Kano Road Depot</div>
          <div style={{ fontSize: 28, color: C.inkSoft }}>Telegram · BukAm alerts</div>
        </div>
      </div>
      <div style={{ padding: "26px 30px", display: "flex", flexDirection: "column", gap: 20 }}>
        {MSGS.map((m, i) => {
          const p = pop(f, S.cue(m.word, 0.25 + i * 0.25), 13);
          return (
            <div key={m.time} style={{
              alignSelf: "flex-start", maxWidth: "92%", background: "#fff", borderRadius: "34px 34px 34px 10px", padding: "22px 28px",
              boxShadow: "0 6px 16px rgba(11,31,51,0.1)", opacity: p, transform: `translateY(${(1 - p) * 50}px) scale(${0.94 + p * 0.06})`,
              transformOrigin: "left bottom", fontSize: 31, lineHeight: 1.32, color: C.ink,
            }}>
              <div style={{ fontWeight: 850 }}>Kano Road Depot</div>
              {m.lines.map((l) => <div key={l}>{l}</div>)}
              <div style={{
                marginTop: 6, display: "inline-block", fontWeight: 850, borderRadius: 10, padding: "2px 10px", marginLeft: -10,
                background: `rgba(245,163,10,${0.9 * hl})`,
              }}>By {m.by}</div>
              <div style={{ textAlign: "right", fontSize: 24, color: C.field, marginTop: -30 }}>{m.time}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Returnables: dispatching an order puts crates on the customer's balance --- */
export function OwesScreen({ f }: ScreenProps) {
  const S = useScene("owes");
  const goAt = S.cue("goes", 0.2);
  const knowsAt = S.cue("knows", 0.45);
  const owed = Math.round(clampLerp(f, knowsAt, knowsAt + 22, 0, 20));
  const card = pop(f, knowsAt - 4, 13);
  return (
    <div>
      <ScreenTitle title="ORD-0042" right={f >= goAt ? <Chip bg={C.successSoft} fg={C.success}>Dispatched</Chip> : <Chip bg="#fff4dc" fg={C.accentStrong}>Assigned</Chip>} />
      <Card style={{ transform: `scale(${0.92 + pop(f, 2, 14) * 0.08})` }}>
        <div style={{ fontSize: 30, color: C.inkSoft, fontWeight: 600 }}>Customer</div>
        <div style={{ fontSize: 50, fontWeight: 850, marginBottom: 18 }}>Emeka Obi</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 36 }}>
          <span>20 × Crate of drinks</span><span style={{ fontWeight: 800 }}>{naira(92000)}</span>
        </div>
        <div style={{ marginTop: 14 }}><Chip bg="#e3effa" fg={C.chart} size={28}>↩ Crates come back</Chip></div>
      </Card>
      <div style={{
        marginTop: 26, background: C.ink, color: "#fff", borderRadius: 36, padding: "34px 36px", display: "flex", alignItems: "center", gap: 28,
        opacity: card, transform: `translateY(${(1 - card) * 80}px)`,
      }}>
        <div style={{ fontSize: 120, fontWeight: 900, color: C.accent, minWidth: 170, textAlign: "center" }}>{owed}</div>
        <div>
          <div style={{ fontSize: 40, fontWeight: 850 }}>crates to bring back</div>
          <div style={{ fontSize: 32, color: C.nav }}>Added to Emeka Obi's balance</div>
        </div>
      </div>
    </div>
  );
}

/* Returnables: recording what came back, order by order -------------------- */
export function TripBack({ f }: ScreenProps) {
  const S = useScene("tripback");
  const cameAt = S.cue("came", 0.45);
  const back = Math.round(clampLerp(f, cameAt, cameAt + 20, 0, 12));
  const back2 = Math.round(clampLerp(f, cameAt + 8, cameAt + 22, 0, 8));
  const sum = pop(f, S.cue("order", 0.8, 1), 12);
  const rows = [
    { c: "Emeka Obi", exp: 20, got: back },
    { c: "Aisha Bello", exp: 8, got: back2 },
  ];
  return (
    <div>
      <ScreenTitle title="Record returns" right={<Chip bg={C.chip} fg={C.ink}>TRP-0007</Chip>} />
      {rows.map((r, i) => {
        const p = pop(f, 4 + i * 6, 14);
        const done = r.got === r.exp;
        return (
          <Card key={r.c} style={{ marginBottom: 18, padding: 30, opacity: p, transform: `translateX(${(1 - p) * 90}px)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 42, fontWeight: 850 }}>{r.c}</div>
                <div style={{ fontSize: 30, color: C.inkSoft }}>Crate of drinks · expected {r.exp}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 64, height: 64, borderRadius: 18, background: C.chip, fontSize: 44, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>−</div>
                <div style={{ fontSize: 64, fontWeight: 900, minWidth: 90, textAlign: "center", color: done ? C.success : C.ink }}>{r.got}</div>
                <div style={{ width: 64, height: 64, borderRadius: 18, background: C.accent, fontSize: 44, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>+</div>
              </div>
            </div>
          </Card>
        );
      })}
      <div style={{
        marginTop: 8, background: "#fff4dc", border: `3px solid ${C.accent}`, borderRadius: 30, padding: "26px 30px", fontSize: 34,
        opacity: sum, transform: `scale(${0.9 + sum * 0.1})`,
      }}>
        <div style={{ fontWeight: 850 }}>20 came back of 28 expected</div>
        <div style={{ color: C.inkSoft }}>Short by 8. It stays on Emeka Obi's balance.</div>
      </div>
    </div>
  );
}

/* Returnables: who still owes, and what's in store ------------------------- */
export function Balances({ f }: ScreenProps) {
  const S = useScene("balances");
  const owesAt = S.cue("owes", 0.35);
  const storeAt = S.cue("store", 0.8);
  const list = [
    { c: "Emeka Obi", item: "Crate of drinks", n: 8, col: "#d35400" },
    { c: "Ngozi Eze", item: "Gas cylinder 12.5kg", n: 2, col: "#c0392b" },
    { c: "Chinedu Okafor", item: "Pallet", n: 5, col: "#1f6fb2" },
    { c: "Aisha Bello", item: "Crate of drinks", n: 3, col: "#8e44ad" },
  ];
  const tile = (label: string, v: number, at: number, hot?: boolean) => {
    const p = pop(f, at, 12);
    return (
      <Card style={{ padding: 28, background: hot ? C.ink : "#fff", color: hot ? "#fff" : C.ink, opacity: p, transform: `scale(${0.85 + p * 0.15})` }}>
        <div style={{ fontSize: 26, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: hot ? C.nav : C.inkSoft }}>{label}</div>
        <div style={{ fontSize: 76, fontWeight: 900, color: hot ? C.accent : C.ink }}>{Math.round(clampLerp(f, at, at + 18, 0, v))}</div>
      </Card>
    );
  };
  return (
    <div>
      <ScreenTitle title="Returns" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 24 }}>
        {tile("Owed by customers", 48, owesAt, true)}
        {tile("In store", 312, storeAt)}
      </div>
      <div style={{ fontSize: 36, fontWeight: 850, marginBottom: 14, opacity: pop(f, owesAt + 4, 12) }}>Customer balances</div>
      {list.map((r, i) => {
        const p = pop(f, owesAt + 6 + i * 4, 13);
        return (
          <div key={r.c} style={{
            display: "flex", alignItems: "center", gap: 20, background: "#fff", border: `3px solid ${C.line}`, borderRadius: 26,
            padding: "18px 24px", marginBottom: 14, opacity: p, transform: `translateX(${(1 - p) * 110}px)`, fontFamily: FONT,
          }}>
            <Avatar name={r.c} color={r.col} size={70} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 36, fontWeight: 800 }}>{r.c}</div>
              <div style={{ fontSize: 28, color: C.inkSoft }}>{r.item}</div>
            </div>
            <Chip bg="#fff4dc" fg={C.accentStrong} size={30}>owes {r.n}</Chip>
          </div>
        );
      })}
    </div>
  );
}
