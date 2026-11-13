import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { NavyBackdrop, PaperBackdrop } from "../components/PaperBackdrop";
import { pop, ramp, rand, shake } from "../components/anim";
import { C, FONT, HAND } from "../theme";

const Shaky: React.FC<{ children: React.ReactNode; amount?: number }> = ({ children, amount = 4 }) => {
  const frame = useCurrentFrame();
  const s = shake(frame, amount);
  return (
    <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px) rotate(${s.r}deg)` }}>
      {children}
    </AbsoluteFill>
  );
};

/** A line of handwriting that "writes" itself left to right. */
const Written: React.FC<{
  text: string; start: number; speed?: number; size?: number; color?: string; strike?: number;
}> = ({ text, start, speed = 9, size = 64, color = C.pencil, strike }) => {
  const frame = useCurrentFrame();
  const reveal = ramp(frame, start, start + speed);
  const strikeP = strike === undefined ? 0 : ramp(frame, strike, strike + 5);
  return (
    <div style={{ position: "relative", height: size * 1.25, fontFamily: HAND, fontSize: size, color }}>
      <span style={{ clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`, display: "inline-block", whiteSpace: "nowrap" }}>
        {text}
      </span>
      {strike !== undefined ? (
        <div style={{
          position: "absolute", left: -10, top: "52%", height: 7, borderRadius: 4,
          width: `${strikeP * 104}%`, background: C.danger, transform: "rotate(-2deg)",
        }} />
      ) : null}
    </div>
  );
};

const Notebook: React.FC<{ children: React.ReactNode; rotate?: number; width?: number; height?: number }> = ({
  children, rotate = -4, width = 820, height = 980,
}) => (
  <div style={{
    width, height, transform: `rotate(${rotate}deg)`, background: "#fbf8ef", borderRadius: 18,
    boxShadow: "0 40px 80px rgba(40,25,0,0.35), 0 4px 0 #e2d8c0",
    backgroundImage: "repeating-linear-gradient(180deg, transparent 0 78px, #b9cbe0 78px 80px)",
    backgroundPositionY: 110, position: "relative", overflow: "hidden",
  }}>
    <div style={{ position: "absolute", left: 110, top: 0, bottom: 0, width: 3, background: "#e59a9a" }} />
    <div style={{ position: "absolute", left: 140, right: 40, top: 124 }}>{children}</div>
  </div>
);

/* 1. Hook ---------------------------------------------------------------- */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = pop(frame, 0, 15);
  return (
    <AbsoluteFill>
      <PaperBackdrop />
      <Shaky amount={3}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: 260 }}>
          <div style={{ transform: `translateY(${(1 - enter) * 500}px) scale(${0.9 + enter * 0.1})` }}>
            <Notebook>
              <Written text="12/11  Mama Ngozi – 5 crates" start={4} />
              <Written text="Alhaji Musa – 3 bags rice" start={12} />
              <Written text="Chinedu – 10 crates ??" start={20} strike={40} />
              <Written text="Paid ₦45,000 … or ₦54,000?" start={28} color={C.danger} />
              <Written text="Emeka – gas 12.5kg x4" start={36} />
              <Written text="who collected??" start={44} color={C.danger} />
            </Notebook>
          </div>
        </AbsoluteFill>
      </Shaky>
      <Caption text="Still booking orders on *paper?*" color={C.ink} highlight={C.danger} delay={6} top={170} />
    </AbsoluteFill>
  );
};

/* 2. Manual booking ------------------------------------------------------ */
const SLIPS = Array.from({ length: 11 }, (_, i) => ({
  x: 140 + rand(i + 1) * 560, rot: (rand(i + 7) - 0.5) * 50, delay: i * 2.6,
  label: ["Order", "Order #?", "Order", "Rice x3", "5 crates", "Order", "Gas x2", "Order #?", "Paid?", "Order", "Owes ₦"][i],
}));

export const ManualBooking: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <PaperBackdrop />
      <Shaky amount={3}>
        {SLIPS.map((s, i) => {
          const p = pop(frame, s.delay, 13);
          const y = interpolate(p, [0, 1], [-500, 820 + (i % 4) * 90 - Math.floor(i / 4) * 70]);
          return (
            <div key={i} style={{
              position: "absolute", left: s.x, top: y, width: 300, height: 360, background: "#fffdf5",
              transform: `rotate(${s.rot * p}deg)`, boxShadow: "0 18px 40px rgba(40,25,0,0.3)", borderRadius: 6,
              padding: "26px 28px", fontFamily: HAND, fontSize: 54, color: C.pencil,
              backgroundImage: "repeating-linear-gradient(180deg, transparent 0 52px, #cfdbe8 52px 54px)",
            }}>
              {s.label}
              <div style={{ fontSize: 40, opacity: 0.75 }}>________</div>
              <div style={{ fontSize: 40, opacity: 0.75 }}>____ ₦___</div>
            </div>
          );
        })}
        {/* the one that matters, crossed out */}
        <BigSlip />
      </Shaky>
      <Caption text="Orders *lost* in notebooks" color={C.ink} highlight={C.danger} delay={2} top={170} />
    </AbsoluteFill>
  );
};

const BigSlip: React.FC = () => {
  const frame = useCurrentFrame();
  const p = pop(frame, 20, 12);
  const x = ramp(frame, 32, 40);
  return (
    <div style={{
      position: "absolute", left: 250, top: 640, width: 580, height: 520, background: "#fffdf5",
      transform: `translateY(${(1 - p) * 900}px) rotate(${4 - p * 8}deg)`, borderRadius: 8,
      boxShadow: "0 30px 70px rgba(40,25,0,0.4)", padding: 44, fontFamily: HAND, color: C.pencil,
    }}>
      <div style={{ fontSize: 84 }}>ORDER #???</div>
      <div style={{ fontSize: 60 }}>Aisha – 20 crates</div>
      <div style={{ fontSize: 60 }}>Delivered by: ?</div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: "absolute", inset: 30, width: "calc(100% - 60px)", height: "calc(100% - 60px)" }}>
        <path d="M5 8 L95 92" stroke={C.danger} strokeWidth={4} strokeLinecap="round" fill="none"
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - x} />
        <path d="M95 8 L5 92" stroke={C.danger} strokeWidth={4} strokeLinecap="round" fill="none"
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ramp(frame, 38, 46)} />
      </svg>
    </div>
  );
};

/* 3. Accounting ---------------------------------------------------------- */
export const Accounting: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = pop(frame, 0, 14);
  const settled = frame > 30;
  const digits = settled ? "₦ ???,???" : `₦ ${Math.floor(rand(Math.floor(frame / 2)) * 900 + 100)},${String(Math.floor(rand(frame * 3) * 999)).padStart(3, "0")}`;
  const blink = settled && Math.floor(frame / 4) % 2 === 0;
  const rows = [
    ["Sales", "₦ 1,240,500"], ["Paid in", "₦ 1,180,000"], ["Owed", "₦ 46,000"], ["Missing", "₦ 14,500 ?"],
  ];
  return (
    <AbsoluteFill>
      <PaperBackdrop tint={settled ? "rgba(180,35,24,0.08)" : undefined} />
      <Shaky amount={settled ? 6 : 3}>
        <AbsoluteFill style={{ alignItems: "center", paddingTop: 560 }}>
          <div style={{
            width: 640, background: "#2a2f38", borderRadius: 48, padding: 44,
            transform: `translateY(${(1 - enter) * 700}px) rotate(${-3 + enter * 3}deg)`,
            boxShadow: "0 40px 90px rgba(0,0,0,0.45)",
          }}>
            <div style={{
              background: blink ? "#f6c9c4" : "#c8d8b4", borderRadius: 18, height: 170,
              display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 36px",
              fontFamily: "'Courier New', monospace", fontWeight: 700, fontSize: 92,
              color: settled ? C.danger : "#1d2a12", letterSpacing: "-0.04em",
            }}>{digits}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 22, marginTop: 36 }}>
              {Array.from({ length: 16 }, (_, i) => {
                const pressed = Math.floor(frame / 3) % 16 === (i * 7) % 16 && !settled;
                return (
                  <div key={i} style={{
                    height: 96, borderRadius: 20, background: i % 4 === 3 ? C.accent : "#454c58",
                    transform: `translateY(${pressed ? 6 : 0}px)`, boxShadow: pressed ? "none" : "0 6px 0 #1a1d23",
                    color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 40,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{"789÷456×123−0.=+"[i]}</div>
                );
              })}
            </div>
          </div>
        </AbsoluteFill>
        {/* ledger scraps floating around */}
        {rows.map(([a, b], i) => {
          const p = pop(frame, 8 + i * 5, 12);
          const left = i % 2 === 0 ? 40 : 600;
          return (
            <div key={a} style={{
              position: "absolute", left, top: 420 + i * 300 + (i % 2) * 60, width: 440,
              background: "#fffdf5", borderRadius: 8, padding: "16px 24px", fontFamily: HAND, fontSize: 52,
              color: i === 3 ? C.danger : C.pencil, boxShadow: "0 14px 30px rgba(40,25,0,0.28)",
              transform: `scale(${p}) rotate(${(rand(i + 3) - 0.5) * 16}deg)`, opacity: p,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>{a}</span><span>{b}</span>
            </div>
          );
        })}
      </Shaky>
      <Caption text="Accounts that never *balance*" color={C.ink} highlight={C.danger} delay={2} top={170} />
    </AbsoluteFill>
  );
};

/* 4. Theft --------------------------------------------------------------- */
const Crate: React.FC<{ color?: string }> = ({ color = "#c0392b" }) => (
  <div style={{
    width: 190, height: 130, background: color, borderRadius: 12, position: "relative",
    boxShadow: "inset 0 -14px 0 rgba(0,0,0,0.25), 0 8px 0 rgba(0,0,0,0.2)",
  }}>
    <div style={{ position: "absolute", left: 18, right: 18, top: 18, height: 26, borderRadius: 8, background: "rgba(0,0,0,0.25)" }} />
    <div style={{ position: "absolute", left: 22, right: 22, top: -26, display: "flex", justifyContent: "space-between" }}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ width: 30, height: 30, borderRadius: 15, background: "#2d6a35", border: "4px solid #1d4a24" }} />
      ))}
    </div>
  </div>
);

const STOLEN = [1, 6, 10, 3, 8];
export const Theft: React.FC = () => {
  const frame = useCurrentFrame();
  const count = Math.round(interpolate(frame, [6, 36], [120, 97], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const tag = pop(frame, 32, 10);
  return (
    <AbsoluteFill>
      <PaperBackdrop tint="rgba(20,20,30,0.18)" />
      <Shaky amount={2}>
        <AbsoluteFill style={{ alignItems: "center", paddingTop: 560 }}>
          <div style={{ width: 920, background: "#6b4f32", borderRadius: 16, padding: "70px 30px 10px", position: "relative" }}>
            {[0, 1, 2].map((row) => (
              <div key={row} style={{ display: "flex", justifyContent: "space-around", marginBottom: 76, position: "relative" }}>
                {[0, 1, 2, 3].map((col) => {
                  const id = row * 4 + col;
                  const order = STOLEN.indexOf(id);
                  const t = order === -1 ? 0 : ramp(frame, 6 + order * 6, 12 + order * 6);
                  return (
                    <div key={col} style={{ position: "relative" }}>
                      <div style={{ opacity: 1 - t, transform: `translate(${t * 160}px, ${-t * 40}px) rotate(${t * 18}deg)` }}>
                        <Crate color={row === 1 ? "#d35400" : "#c0392b"} />
                      </div>
                      {order !== -1 ? (
                        <div style={{
                          position: "absolute", top: -10, left: 60, fontFamily: FONT, fontWeight: 900, fontSize: 56,
                          color: C.danger, opacity: t > 0 && t < 1 ? 1 : t >= 1 ? 1 - ramp(frame, 14 + order * 6, 22 + order * 6) : 0,
                          transform: `translateY(${-t * 60}px)`,
                        }}>−1</div>
                      ) : null}
                    </div>
                  );
                })}
                <div style={{ position: "absolute", left: -30, right: -30, bottom: -40, height: 28, background: "#4a3520", borderRadius: 6 }} />
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 60, display: "flex", gap: 30, alignItems: "center", fontFamily: FONT,
          }}>
            <div style={{
              background: C.ink, color: "#fff", borderRadius: 24, padding: "22px 40px", fontSize: 60, fontWeight: 800,
            }}>
              STOCK <span style={{ color: count < 120 ? "#ff8a80" : "#fff" }}>{count}</span>
            </div>
            <div style={{
              background: C.danger, color: "#fff", borderRadius: 24, padding: "22px 36px", fontSize: 56, fontWeight: 800,
              transform: `scale(${tag}) rotate(-4deg)`,
            }}>23 missing</div>
          </div>
        </AbsoluteFill>
      </Shaky>
      <Caption text="Goods *vanishing* from your store" color={C.ink} highlight={C.danger} delay={2} top={170} />
    </AbsoluteFill>
  );
};

/* 5. No control + crumple into the reveal ------------------------------- */
const Person: React.FC<{ delay: number; name: string }> = ({ delay, name }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, delay, 12);
  const q = pop(frame, delay + 8, 8);
  const bob = Math.sin((frame + delay * 3) * 0.35) * 8;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${p})` }}>
      <div style={{
        fontFamily: FONT, fontWeight: 900, fontSize: 96, color: "#fff", background: C.danger, width: 120, height: 120,
        borderRadius: 60, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
        transform: `scale(${q}) translateY(${bob}px)`,
      }}>?</div>
      <svg width="170" height="220" viewBox="0 0 170 220">
        <circle cx="85" cy="60" r="48" fill={C.inkSoft} />
        <path d="M10 220 C10 140 50 115 85 115 C120 115 160 140 160 220 Z" fill={C.inkSoft} />
      </svg>
      <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 700, color: C.inkSoft, marginTop: 10 }}>{name}</div>
    </div>
  );
};

export const NoControl: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const truckX = interpolate(frame, [0, 34], [-200, 1300], { extrapolateRight: "clamp" });
  // crumple: the whole paper world squeezes into a ball and flies off
  const c = ramp(frame, dur - 14, dur);
  const cEase = c * c;
  return (
    <AbsoluteFill>
      <NavyBackdrop />
      <AbsoluteFill style={{
        transform: `scale(${1 - cEase * 0.92}) rotate(${cEase * 220}deg)`,
        borderRadius: `${cEase * 50}%`, overflow: "hidden",
        filter: `brightness(${1 - c * 0.3}) contrast(${1 + c * 0.6})`,
        opacity: 1 - ramp(frame, dur - 3, dur),
      }}>
        <PaperBackdrop />
        <Shaky amount={3}>
          <AbsoluteFill style={{ alignItems: "center", paddingTop: 660 }}>
            <div style={{ display: "flex", gap: 60 }}>
              <Person delay={4} name="Staff?" />
              <Person delay={9} name="Driver?" />
              <Person delay={14} name="Who?" />
            </div>
          </AbsoluteFill>
          <div style={{ position: "absolute", top: 1330, left: truckX, transform: "scaleX(1)" }}>
            <Truck color="#7d8a99" />
          </div>
          <div style={{ position: "absolute", top: 1535, left: 0, right: 0, height: 10, background: "rgba(40,25,0,0.25)" }} />
        </Shaky>
        <Caption text="Who *dispatched* what?" color={C.ink} highlight={C.danger} delay={0} top={170} />
        <AbsoluteFill style={{
          background: "repeating-linear-gradient(35deg, rgba(0,0,0,0.25) 0 3px, transparent 3px 40px)",
          opacity: c,
        }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Truck: React.FC<{ color?: string; cab?: string; label?: string }> = ({
  color = C.accent, cab = C.ink, label,
}) => (
  <svg width="420" height="210" viewBox="0 0 420 210">
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
