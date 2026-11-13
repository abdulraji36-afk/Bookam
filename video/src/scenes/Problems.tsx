import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { NavyBackdrop, PaperBackdrop } from "../components/PaperBackdrop";
import { pop, ramp, rand, shake } from "../components/anim";
import { useScene } from "../timeline";
import { C, FONT, HAND } from "../theme";

const CAPTION_TOP = 210;

const Shaky: React.FC<{ children: React.ReactNode; amount?: number }> = ({ children, amount = 4 }) => {
  const frame = useCurrentFrame();
  const s = shake(frame, amount);
  return (
    <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px) rotate(${s.r}deg)` }}>
      {children}
    </AbsoluteFill>
  );
};

/** Slow push-in so still scenes never feel frozen. */
const PushIn: React.FC<{ dur: number; children: React.ReactNode; amount?: number }> = ({ dur, children, amount = 0.05 }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ transform: `scale(${1 + (frame / dur) * amount})` }}>{children}</AbsoluteFill>;
};

/* 1. Hook: a notebook filling up with messy entries ----------------------- */
const ENTRIES: { t: string; red?: boolean; strike?: boolean }[] = [
  { t: "12/11  Mama Ngozi – 5 crates" },
  { t: "Alhaji Musa – 3 bags rice" },
  { t: "Chinedu – 10 crates ??", strike: true },
  { t: "Paid ₦45,000 … or ₦54,000?", red: true },
  { t: "Emeka – gas 12.5kg x4" },
  { t: "Aisha – 20 crates, owes?" },
  { t: "who collected??", red: true },
];
const ROW = 104;
const INK_SIZE = 66;

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useScene("hook");
  const enter = pop(frame, 0, 15);
  const per = Math.max(5, Math.floor((S.dur - 12) / ENTRIES.length));
  const writing = Math.min(ENTRIES.length - 1, Math.max(0, Math.floor((frame - 3) / per)));
  const tip = ramp(frame, 3 + writing * per, 3 + writing * per + per);
  const tipX = ENTRIES[writing].t.length * INK_SIZE * 0.37 * tip;
  return (
    <AbsoluteFill>
      <PaperBackdrop />
      <PushIn dur={S.dur}>
        <Shaky amount={2.5}>
          <AbsoluteFill style={{ alignItems: "center", paddingTop: 470 }}>
            <div style={{
              width: 920, height: 1080, background: "#fbf8ef", borderRadius: 20, position: "relative",
              transform: `translateY(${(1 - enter) * 700}px) rotate(${-3 + (1 - enter) * 6}deg)`,
              boxShadow: "0 40px 90px rgba(40,25,0,0.35), 0 5px 0 #e2d8c0",
            }}>
              <div style={{ position: "absolute", left: 120, top: 0, bottom: 0, width: 4, background: "#e59a9a" }} />
              <div style={{ position: "absolute", left: 150, right: 40, top: 110 }}>
                {ENTRIES.map((e, i) => {
                  const start = 3 + i * per;
                  const reveal = ramp(frame, start, start + per);
                  const strike = e.strike ? ramp(frame, start + per * 2, start + per * 2 + 5) : 0;
                  return (
                    <div key={i} style={{
                      height: ROW, borderBottom: "3px solid #bdd0e4", position: "relative",
                      display: "flex", alignItems: "flex-end", paddingBottom: 10,
                      fontFamily: HAND, fontSize: INK_SIZE, color: e.red ? C.danger : C.pencil,
                    }}>
                      <span style={{ clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`, whiteSpace: "nowrap" }}>{e.t}</span>
                      {e.strike ? (
                        <div style={{
                          position: "absolute", left: -10, bottom: 38, height: 8, borderRadius: 4,
                          width: `${strike * 82}%`, background: C.danger, transform: "rotate(-2deg)",
                        }} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {/* the pen, riding the line being written */}
              <svg width="150" height="150" viewBox="0 0 100 100" style={{
                position: "absolute", left: 150 + tipX - 8, top: 110 + writing * ROW + ROW - 140,
                transform: `rotate(${Math.sin(frame * 1.7) * 6}deg)`, transformOrigin: "8px 92px",
                opacity: frame < 3 + ENTRIES.length * per ? 1 : 0,
              }}>
                <path d="M8 92 L18 70 L78 10 L90 22 L30 82 Z" fill={C.ink} />
                <path d="M8 92 L18 70 L30 82 Z" fill="#f2d3a2" />
                <path d="M78 10 L90 22 L95 17 L83 5 Z" fill={C.danger} />
              </svg>
            </div>
          </AbsoluteFill>
        </Shaky>
      </PushIn>
      <Caption text="Still booking orders on *paper?*" color={C.ink} highlight={C.danger} delay={S.vo - 6} top={CAPTION_TOP} />
    </AbsoluteFill>
  );
};

/* 2. Orders mixed up, or lost ------------------------------------------- */
const PILE = Array.from({ length: 12 }, (_, i) => ({
  x: 40 + (i % 4) * 250 + rand(i + 1) * 60, y: 1180 + Math.floor(i / 4) * 150 + rand(i + 9) * 50,
  rot: (rand(i + 7) - 0.5) * 50,
  label: ["Order", "Order #?", "Rice x3", "5 crates", "Gas x2", "Paid?", "Order", "Owes ₦", "Order #?", "10 crates", "Order", "??"][i],
}));

const Slip: React.FC<{ title: string; lines: string[]; style?: React.CSSProperties }> = ({ title, lines, style }) => (
  <div style={{
    position: "absolute", width: 450, height: 500, background: "#fffdf5", borderRadius: 10, padding: "36px 40px",
    boxShadow: "0 30px 70px rgba(40,25,0,0.4)", fontFamily: HAND, color: C.pencil,
    backgroundImage: "repeating-linear-gradient(180deg, transparent 0 74px, #cfdbe8 74px 77px)", backgroundPositionY: 30,
    ...style,
  }}>
    <div style={{ fontSize: 72, fontWeight: 700 }}>{title}</div>
    {lines.map((l) => <div key={l} style={{ fontSize: 58, lineHeight: "77px" }}>{l}</div>)}
  </div>
);

export const ManualBooking: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useScene("manual");
  const swap = S.has("mixed");
  const mixAt = S.cue("mixed", 0.1);
  const lostAt = S.cue("lost", 0.35);
  const m = swap ? pop(frame, mixAt, 16) : 0;
  const arc = Math.sin(Math.PI * Math.min(1, m)) * 160;
  const lost = ramp(frame, lostAt, lostAt + 14);
  const A = { x: 70, y: 560 }, B = { x: 560, y: 610 };
  const enterA = pop(frame, 2, 13), enterB = pop(frame, 7, 13);
  // after the swap, slip A sits where B was; the one on the right gets lost
  const ax = A.x + (B.x - A.x) * m, ay = A.y + (B.y - A.y) * m - arc;
  const bx = B.x + (A.x - B.x) * m, by = B.y + (A.y - B.y) * m + arc * 0.4;
  const stamp = swap ? pop(frame, mixAt + 6, 10) * (1 - ramp(frame, lostAt + 2, lostAt + 8)) : 0;
  return (
    <AbsoluteFill>
      <PaperBackdrop />
      <Shaky amount={2.5}>
        {PILE.map((s, i) => {
          const p = pop(frame, i * 1.5, 14);
          return (
            <div key={i} style={{
              position: "absolute", left: s.x, top: interpolate(p, [0, 1], [-600, s.y]), width: 260, height: 300,
              background: "#fffdf5", borderRadius: 6, padding: "20px 24px", fontFamily: HAND, fontSize: 50, color: C.pencil,
              transform: `rotate(${s.rot * p}deg)`, boxShadow: "0 14px 30px rgba(40,25,0,0.28)",
              backgroundImage: "repeating-linear-gradient(180deg, transparent 0 50px, #cfdbe8 50px 52px)",
            }}>{s.label}</div>
          );
        })}
        <Slip title="ORDER" lines={["Aisha Bello", "20 crates", "₦92,000"]} style={{
          left: bx, top: by + (1 - enterB) * 1200, transform: `rotate(${3 - m * 7}deg)`,
        }} />
        <Slip title="ORDER" lines={["Emeka Obi", "8 crates", "₦36,800"]} style={{
          left: ax + lost * 900, top: ay + (1 - enterA) * 1200 - lost * 300,
          transform: `rotate(${-4 + m * 8 + lost * 70}deg)`, opacity: 1 - lost,
        }} />
        {/* where the lost order used to be */}
        <div style={{
          position: "absolute", left: swap ? B.x : A.x, top: swap ? B.y : A.y, width: 450, height: 500, borderRadius: 10,
          border: `6px dashed ${C.danger}`, opacity: ramp(frame, lostAt + 8, lostAt + 14),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONT, fontWeight: 900, fontSize: 200, color: C.danger,
        }}>?</div>
        <div style={{
          position: "absolute", left: 300, top: 1000, padding: "14px 36px", border: `8px solid ${C.danger}`, borderRadius: 18,
          color: C.danger, fontFamily: FONT, fontWeight: 900, fontSize: 76, letterSpacing: "0.05em", background: "rgba(253,236,234,0.92)",
          transform: `rotate(-8deg) scale(${1.8 - stamp * 0.8})`, opacity: stamp,
        }}>MIXED UP</div>
      </Shaky>
      <Caption
        text={swap ? "Orders *mixed up,* or *lost*" : "Orders *lost* in notebooks"}
        color={C.ink} highlight={C.danger} delay={S.vo - 2} top={CAPTION_TOP}
      />
    </AbsoluteFill>
  );
};

/* 3. Accounts that never balance ----------------------------------------- */
export const Accounting: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useScene("accounting");
  const enter = pop(frame, 0, 14);
  const fail = S.cue("balance", 0.7);
  const settled = frame >= fail;
  const digits = settled
    ? "₦ ???,???"
    : `₦ ${Math.floor(rand(Math.floor(frame / 2)) * 900 + 100)},${String(Math.floor(rand(frame * 3) * 999)).padStart(3, "0")}`;
  const blink = settled && Math.floor((frame - fail) / 4) % 2 === 0;
  const ledger = pop(frame, 8, 14);
  const circle = ramp(frame, fail + 2, fail + 12);
  const rows: [string, string, boolean][] = [
    ["Sales today", "₦1,240,500", false], ["Cash counted", "₦1,179,500", false], ["Difference", "₦61,000 ??", true],
  ];
  return (
    <AbsoluteFill>
      <PaperBackdrop tint={settled ? "rgba(180,35,24,0.08)" : undefined} />
      <Shaky amount={settled ? 5 : 2.5}>
        <AbsoluteFill style={{ alignItems: "center", paddingTop: 440 }}>
          <div style={{
            width: 700, background: "#2a2f38", borderRadius: 52, padding: 46,
            transform: `translateY(${(1 - enter) * 900}px) rotate(${-3 + enter * 3}deg)`,
            boxShadow: "0 40px 90px rgba(0,0,0,0.45)",
          }}>
            <div style={{
              background: blink ? "#f6c9c4" : "#c8d8b4", borderRadius: 20, height: 170,
              display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 36px",
              fontFamily: "'Courier New', monospace", fontWeight: 700, fontSize: 96,
              color: settled ? C.danger : "#1d2a12", letterSpacing: "-0.04em",
            }}>{digits}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 22, marginTop: 36 }}>
              {Array.from({ length: 16 }, (_, i) => {
                const pressed = !settled && Math.floor(frame / 3) % 16 === (i * 7) % 16;
                return (
                  <div key={i} style={{
                    height: 98, borderRadius: 22, background: i % 4 === 3 ? C.accent : "#454c58",
                    transform: `translateY(${pressed ? 6 : 0}px)`, boxShadow: pressed ? "none" : "0 6px 0 #1a1d23",
                    color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 44,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{"789÷456×123−0.=+"[i]}</div>
                );
              })}
            </div>
          </div>
        </AbsoluteFill>
        {/* ledger strip under the calculator */}
        <div style={{
          position: "absolute", left: 90, right: 90, top: 1290, background: "#fffdf5", borderRadius: 14,
          padding: "26px 44px", boxShadow: "0 20px 50px rgba(40,25,0,0.3)", fontFamily: HAND, fontSize: 64,
          transform: `translateY(${(1 - ledger) * 700}px) rotate(1.5deg)`,
        }}>
          {rows.map(([a, b, red]) => (
            <div key={a} style={{
              display: "flex", justifyContent: "space-between", color: red ? C.danger : C.pencil,
              borderBottom: red ? "none" : "3px solid #cfdbe8", padding: "6px 0", position: "relative",
            }}>
              <span>{a}</span><span>{b}</span>
              {red ? (
                <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{
                  position: "absolute", right: -26, top: -10, width: 400, height: 110, overflow: "visible",
                }}>
                  <ellipse cx="50" cy="20" rx="48" ry="18" fill="none" stroke={C.danger} strokeWidth={1.4}
                    pathLength={1} strokeDasharray={1} strokeDashoffset={1 - circle} />
                </svg>
              ) : null}
            </div>
          ))}
        </div>
      </Shaky>
      <Caption text="Accounts that never *balance*" color={C.ink} highlight={C.danger} delay={S.vo - 2} top={CAPTION_TOP} />
    </AbsoluteFill>
  );
};

/* 4. Theft: a hand sneaks crates off the shelf ------------------------- */
export const Crate: React.FC<{ color?: string }> = ({ color = "#c0392b" }) => (
  <div style={{
    width: 200, height: 140, background: color, borderRadius: 14, position: "relative",
    boxShadow: "inset 0 -16px 0 rgba(0,0,0,0.25), 0 8px 0 rgba(0,0,0,0.2)",
  }}>
    <div style={{ position: "absolute", left: 20, right: 20, top: 22, height: 30, borderRadius: 8, background: "rgba(0,0,0,0.25)" }} />
    <div style={{ position: "absolute", left: 22, right: 22, top: -28, display: "flex", justifyContent: "space-between" }}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ width: 32, height: 32, borderRadius: 16, background: "#2d6a35", border: "5px solid #1d4a24" }} />
      ))}
    </div>
  </div>
);

const SHELF_TOP = 520;
const crateAt = (id: number) => ({ x: 80 + (id % 4) * 240, y: SHELF_TOP + Math.floor(id / 4) * 250 });
const STOLEN = [3, 6, 1, 11, 7];
const COUNTS = [120, 115, 110, 105, 101, 97];

const Hand: React.FC<{ x: number; y: number; grip: number }> = ({ x, y, grip }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 1300, height: 160, pointerEvents: "none" }}>
    <svg width="1300" height="160" viewBox="0 0 1300 160" style={{ overflow: "visible", filter: "drop-shadow(0 18px 20px rgba(0,0,0,0.45))" }}>
      <rect x="120" y="45" width="1180" height="78" rx="36" fill="#15161d" />
      <rect x="140" y="40" width="200" height="88" rx="40" fill="#23252e" />
      <ellipse cx="110" cy="84" rx="78" ry="62" fill="#15161d" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={20 - grip * 24} y={36 + i * 26} width={90} height={22} rx={11} fill="#15161d"
          transform={`rotate(${grip * 30 - 10} ${100} ${46 + i * 26})`} />
      ))}
      <rect x="70" y="130" width="70" height="26" rx="13" fill="#15161d" transform={`rotate(${-20 - grip * 30} 120 135)`} />
    </svg>
  </div>
);

export const Theft: React.FC<{ k?: string }> = ({ k = "theft" }) => {
  const frame = useCurrentFrame();
  const S = useScene(k);
  const span = S.dur - 14;
  const L = Math.min(30, span * 0.42);
  const win = STOLEN.map((_, i) => 2 + (i * (span - L)) / (STOLEN.length - 1));
  const taken = win.filter((w) => frame >= w + L * 0.85).length;
  const tag = pop(frame, win[win.length - 1] + L * 0.85, 10);
  const count = COUNTS[taken];
  const bump = taken > 0 ? pop(frame, win[taken - 1] + L * 0.85, 8) : 1;
  return (
    <AbsoluteFill>
      <PaperBackdrop tint="rgba(12,18,34,0.42)" />
      <AbsoluteFill style={{ background: "radial-gradient(circle at 45% 50%, rgba(255,230,160,0.22) 0%, rgba(0,0,0,0) 45%)" }} />
      <Shaky amount={1.5}>
        <div style={{ position: "absolute", left: 40, right: 40, top: SHELF_TOP - 80, height: 800, background: "#5b412a", borderRadius: 18 }} />
        {[0, 1, 2].map((r) => (
          <div key={r} style={{
            position: "absolute", left: 30, right: 30, top: SHELF_TOP + r * 250 + 150, height: 32, background: "#3e2b18", borderRadius: 6,
          }} />
        ))}
        {Array.from({ length: 12 }, (_, id) => {
          const k = STOLEN.indexOf(id);
          const pos = crateAt(id);
          let dx = 0, dy = 0, rot = 0;
          if (k !== -1) {
            const p = (frame - win[k]) / L;
            if (p > 0.45) {
              const out = Math.min(1, (p - 0.45) / 0.55);
              dx = (1200 - pos.x) * out * out; dy = -30 * Math.sin(Math.PI * out); rot = out * 12;
            }
            if (p >= 1) return null;
          }
          return (
            <div key={id} style={{ position: "absolute", left: pos.x + dx, top: pos.y + dy, transform: `rotate(${rot}deg)` }}>
              <Crate color={Math.floor(id / 4) === 1 ? "#d35400" : "#c0392b"} />
            </div>
          );
        })}
        {STOLEN.map((id, k) => {
          const p = (frame - win[k]) / L;
          if (p < 0 || p > 1) return null;
          const pos = crateAt(id);
          const reach = p < 0.4 ? 1 - Math.pow(1 - p / 0.4, 2) : 1;
          const back = p > 0.45 ? Math.pow(Math.min(1, (p - 0.45) / 0.55), 2) : 0;
          const x = 1150 - (1150 - (pos.x + 150)) * reach + (1200 - pos.x) * back;
          return <Hand key={k} x={x} y={pos.y - 10} grip={ramp(p, 0.35, 0.45)} />;
        })}
      </Shaky>
      <div style={{
        position: "absolute", top: 1380, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 30,
        fontFamily: FONT, alignItems: "center",
      }}>
        <div style={{
          background: C.ink, color: "#fff", borderRadius: 30, padding: "26px 48px", fontSize: 78, fontWeight: 850,
          transform: `scale(${1 + (1 - bump) * 0.12})`, boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
        }}>
          STOCK <span style={{ color: count < 120 ? "#ff8a80" : "#fff" }}>{count}</span>
        </div>
        <div style={{
          background: C.danger, color: "#fff", borderRadius: 30, padding: "26px 44px", fontSize: 70, fontWeight: 850,
          transform: `scale(${tag}) rotate(-5deg)`, boxShadow: "0 20px 50px rgba(180,35,24,0.4)",
        }}>23 missing</div>
      </div>
      <Caption
        text={S.caption ?? (S.has("missing") ? "Goods go *missing* from your store" : "Goods *vanishing* from your store")}
        color="#fff" highlight="#ff8a80" delay={S.vo - 2} top={CAPTION_TOP}
      />
    </AbsoluteFill>
  );
};

/* 5. Nobody knows who dispatched what --------------------------------- */
const Person: React.FC<{ delay: number; name: string }> = ({ delay, name }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, delay, 12);
  const q = pop(frame, delay + 8, 8);
  const bob = Math.sin((frame + delay * 3) * 0.3) * 10;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${p})`, width: 300 }}>
      <div style={{
        fontFamily: FONT, fontWeight: 900, fontSize: 110, color: "#fff", background: C.danger, width: 140, height: 140,
        borderRadius: 70, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18,
        transform: `scale(${q}) translateY(${bob}px)`, boxShadow: "0 12px 30px rgba(180,35,24,0.4)",
      }}>?</div>
      <svg width="230" height="290" viewBox="0 0 170 220">
        <circle cx="85" cy="60" r="48" fill={C.inkSoft} />
        <path d="M10 220 C10 140 50 115 85 115 C120 115 160 140 160 220 Z" fill={C.inkSoft} />
      </svg>
      <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 800, color: C.ink, marginTop: 12 }}>{name}</div>
    </div>
  );
};

export const NoControl: React.FC<{ k?: string }> = ({ k = "nocontrol" }) => {
  const frame = useCurrentFrame();
  const S = useScene(k);
  const dur = S.dur;
  const truckX = interpolate(frame, [0, dur * 0.55], [-520, 1200], { extrapolateRight: "clamp" });
  const note = pop(frame, 10, 14);
  const fields: [string, number][] = [
    ["Released by", S.cue("dispatched", 0.5)], ["Driver", S.cue("driver", 0.8)],
    S.has("vehicle") ? ["Vehicle", S.cue("vehicle")] : ["Time", S.cue("took", 0.9)],
  ];
  const c = ramp(frame, dur - 16, dur);
  const cEase = c * c;
  return (
    <AbsoluteFill>
      <NavyBackdrop />
      <AbsoluteFill style={{
        transform: `scale(${1 - cEase * 0.92}) rotate(${cEase * 220}deg)`,
        borderRadius: `${cEase * 50}%`, overflow: "hidden",
        filter: `brightness(${1 - c * 0.3}) contrast(${1 + c * 0.6})`, opacity: 1 - ramp(frame, dur - 3, dur),
      }}>
        <PaperBackdrop />
        <Shaky amount={2.5}>
          <div style={{ position: "absolute", top: 440, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 20 }}>
            <Person delay={2} name="Staff?" />
            <Person delay={7} name="Driver?" />
            <Person delay={12} name="Who?" />
          </div>
          <div style={{ position: "absolute", top: 1180, left: 0, right: 0, height: 12, background: "rgba(40,25,0,0.25)" }} />
          <div style={{ position: "absolute", top: 960, left: truckX }}><Truck color="#7d8a99" /></div>
          {/* the delivery note nobody filled in */}
          <div style={{
            position: "absolute", left: 110, right: 110, top: 1240, background: "#fffdf5", borderRadius: 16,
            padding: "26px 44px", boxShadow: "0 24px 60px rgba(40,25,0,0.35)", transform: `translateY(${(1 - note) * 800}px) rotate(-1.5deg)`,
          }}>
            <div style={{ fontFamily: FONT, fontWeight: 850, fontSize: 40, color: C.inkSoft, letterSpacing: "0.08em" }}>DELIVERY NOTE</div>
            {fields.map(([k, at]) => (
              <div key={k} style={{
                display: "flex", alignItems: "center", gap: 24, fontFamily: HAND, fontSize: 62, color: C.pencil,
                borderBottom: "3px solid #cfdbe8", padding: "4px 0",
              }}>
                <span>{k}:</span>
                <span style={{ flex: 1 }} />
                <span style={{
                  fontFamily: FONT, fontWeight: 900, color: C.danger, fontSize: 60,
                  transform: `scale(${pop(frame, at, 9)})`, display: "inline-block",
                }}>???</span>
              </div>
            ))}
          </div>
        </Shaky>
        <Caption text={S.caption ?? "Who *dispatched* what?"} color={C.ink} highlight={C.danger} delay={S.vo} top={CAPTION_TOP} />
        <AbsoluteFill style={{
          background: "repeating-linear-gradient(35deg, rgba(0,0,0,0.25) 0 3px, transparent 3px 40px)", opacity: c,
        }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Truck: React.FC<{ color?: string; cab?: string; label?: string; scale?: number }> = ({
  color = C.accent, cab = C.ink, label, scale = 1,
}) => (
  <svg width={420 * scale} height={210 * scale} viewBox="0 0 420 210">
    <rect x="0" y="10" width="270" height="150" rx="12" fill={color} />
    {label ? (
      <text x="135" y="100" textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={40} fill={C.ink}>{label}</text>
    ) : null}
    <path d="M280 50 h70 l55 55 v55 h-125 z" fill={cab} />
    <path d="M300 65 h42 l38 40 h-80 z" fill="#9fc3e6" />
    <circle cx="70" cy="170" r="32" fill="#1b1b1f" /><circle cx="70" cy="170" r="13" fill="#888" />
    <circle cx="340" cy="170" r="32" fill="#1b1b1f" /><circle cx="340" cy="170" r="13" fill="#888" />
  </svg>
);
