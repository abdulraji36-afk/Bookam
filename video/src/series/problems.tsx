import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { PaperBackdrop } from "../components/PaperBackdrop";
import { pop, ramp, rand, shake } from "../components/anim";
import { Crate, Truck } from "../scenes/Problems";
import { useScene } from "../timeline";
import { C, FONT, HAND } from "../theme";

const CAPTION_TOP = 210;

const Shaky: React.FC<{ children: React.ReactNode; amount?: number }> = ({ children, amount = 2.5 }) => {
  const frame = useCurrentFrame();
  const s = shake(frame, amount);
  return <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px) rotate(${s.r}deg)` }}>{children}</AbsoluteFill>;
};

const Page: React.FC<{ lines: { t: string; red?: boolean }[]; num: string; style?: React.CSSProperties; reveal?: number }> = ({
  lines, num, style, reveal = 1,
}) => (
  <div style={{
    position: "absolute", width: 440, height: 860, background: "#fbf8ef", padding: "70px 36px 0 40px",
    backgroundImage: "repeating-linear-gradient(180deg, transparent 0 86px, #bdd0e4 86px 89px)", backgroundPositionY: 60,
    fontFamily: HAND, fontSize: 46, color: C.pencil, boxShadow: "0 30px 70px rgba(40,25,0,0.3)", ...style,
  }}>
    {lines.map((l, i) => (
      <div key={i} style={{
        height: 89, display: "flex", alignItems: "flex-end", paddingBottom: 8, color: l.red ? C.danger : C.pencil,
        clipPath: `inset(0 ${(1 - ramp(reveal * lines.length, i, i + 1)) * 100}% 0 0)`, whiteSpace: "nowrap",
      }}>{l.t}</div>
    ))}
    <div style={{ position: "absolute", bottom: 26, left: 0, right: 0, textAlign: "center", fontSize: 44, color: C.inkSoft }}>{num}</div>
  </div>
);

/* Ep 3: a page torn out of the order book ------------------------------- */
const zig = (n: number, w: number, h: number) =>
  Array.from({ length: n + 1 }, (_, i) => `${(i % 2 ? w : w * 0.35) + rand(i + 3) * 8},${(i * h) / n}`).join(" ");

export const TornPage: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useScene("problem");
  const tearAt = 6;
  const tear = ramp(frame, tearAt, tearAt + 22);
  const tearE = tear * tear;
  const missing = pop(frame, S.cue("missing", 0.3), 11);
  const nobody = pop(frame, S.cue("nobody", 0.6), 11);
  const L = { left: 80, top: 520 }, R = { left: 560, top: 520 };
  return (
    <AbsoluteFill>
      <PaperBackdrop />
      <Shaky>
        {/* the open book */}
        <div style={{ position: "absolute", left: 60, top: 500, width: 960, height: 900, background: "#7a5a3a", borderRadius: 24 }} />
        <Page num="Page 14" style={L} lines={[
          { t: "40 Chinedu – 5 cr" }, { t: "41 Fatima – rice 5" }, { t: "42 Ngozi – gas 2" },
          { t: "43 Aisha – 20 cr" }, { t: "44 Bola – 6 cr" }, { t: "" }, { t: "" }, { t: "" },
        ]} />
        <Page num="Page 16" style={R} lines={[
          { t: "51 Emeka – 8 cr" }, { t: "52 Tunde – 3 cr" }, { t: "", }, { t: "" }, { t: "" }, { t: "" }, { t: "" }, { t: "" },
        ]} />
        {/* torn stub left at the spine */}
        <svg width="60" height="860" viewBox="0 0 60 860" style={{ position: "absolute", left: 540, top: 520, opacity: tear > 0.05 ? 1 : 0 }}>
          <polygon points={`0,0 ${zig(34, 46, 860)} 0,860`} fill="#f4efe2" />
        </svg>
        {/* spiral */}
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} style={{ position: "absolute", left: 526, top: 548 + i * 60, width: 48, height: 22, borderRadius: 11, border: "6px solid #8b8f99" }} />
        ))}
        {/* the page being ripped away */}
        <div style={{
          position: "absolute", left: R.left, top: R.top, transformOrigin: "0% 100%", opacity: 1 - ramp(frame, tearAt + 16, tearAt + 24),
          transform: `translate(${tearE * 700}px, ${-tearE * 900}px) rotate(${tear * 40}deg)`,
        }}>
          <Page num="Page 15" style={{ position: "relative" }} lines={[
            { t: "45 Bola – 12 cr" }, { t: "46 Emeka – 30 cr" }, { t: "47 Aisha – 9 cr" }, { t: "48 ......" },
            { t: "" }, { t: "" }, { t: "" }, { t: "" },
          ]} />
        </div>
        <div style={{
          position: "absolute", left: 640, top: 1050, background: C.danger, color: "#fff", fontFamily: FONT, fontWeight: 900, fontSize: 64,
          padding: "16px 34px", borderRadius: 20, transform: `rotate(-6deg) scale(${missing})`, boxShadow: "0 20px 50px rgba(180,35,24,0.4)",
        }}>Page 15?</div>
        <div style={{
          position: "absolute", left: 0, right: 0, top: 1460, textAlign: "center", fontFamily: FONT, fontWeight: 850, fontSize: 60, color: C.ink,
          opacity: nobody, transform: `translateY(${(1 - nobody) * 40}px)`,
        }}>Orders 45 to 50: <span style={{ color: C.danger }}>gone.</span></div>
      </Shaky>
      <Caption text="A page is *missing*" color={C.ink} highlight={C.danger} delay={S.vo - 2} top={CAPTION_TOP} />
    </AbsoluteFill>
  );
};

/* Ep 4: 9pm, still adding up ---------------------------------------------- */
const SUMS = ["₦92,000", "₦36,800", "₦27,600", "₦184,000", "₦72,000", "₦48,300", "₦96,000"];
export const LateNight: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useScene("problem");
  // clock runs from 6:00 to 9:04, fast then slowing down
  const t = 1 - Math.pow(1 - ramp(frame, 0, S.dur * 0.55), 3);
  const minutes = 18 * 60 + t * (3 * 60 + 4);
  const hourAng = ((minutes / 60) % 12) * 30;
  const minAng = (minutes % 60) * 6;
  const per = Math.max(4, (S.dur - 30) / SUMS.length);
  const yawn = Math.sin(frame * 0.05) * 0.5 + 0.5;
  return (
    <AbsoluteFill>
      <PaperBackdrop tint="rgba(10,16,32,0.55)" />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 70%, rgba(255,214,140,${0.32 + yawn * 0.05}) 0%, rgba(0,0,0,0) 50%)` }} />
      {/* wall clock */}
      <div style={{ position: "absolute", left: 390, top: 420, width: 300, height: 300 }}>
        <svg width="300" height="300" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="47" fill="#fbf8ef" stroke={C.ink} strokeWidth="4" />
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x="49" y="7" width="2" height={i % 3 ? 4 : 8} fill={C.ink} transform={`rotate(${i * 30} 50 50)`} />
          ))}
          <rect x="48" y="24" width="4" height="28" rx="2" fill={C.ink} transform={`rotate(${hourAng} 50 50)`} />
          <rect x="49" y="12" width="2" height="40" rx="1" fill={C.danger} transform={`rotate(${minAng} 50 50)`} />
          <circle cx="50" cy="50" r="3.5" fill={C.ink} />
        </svg>
      </div>
      <div style={{
        position: "absolute", left: 0, right: 0, top: 740, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: 64,
        color: t > 0.98 ? "#ff8a80" : "#fff",
      }}>{`${Math.floor(minutes / 60) - 12}:${String(Math.floor(minutes % 60)).padStart(2, "0")} PM`}</div>
      {/* the notebook being added up */}
      <div style={{
        position: "absolute", left: 140, right: 140, top: 860, height: 760, background: "#fbf8ef", borderRadius: 16, padding: "30px 50px",
        transform: "rotate(-2deg)", boxShadow: "0 30px 80px rgba(0,0,0,0.5)", fontFamily: HAND, fontSize: 56, color: C.pencil,
        backgroundImage: "repeating-linear-gradient(180deg, transparent 0 74px, #bdd0e4 74px 77px)", backgroundPositionY: 20,
      }}>
        {SUMS.map((v, i) => (
          <div key={v} style={{
            height: 77, display: "flex", justifyContent: "flex-end", alignItems: "flex-end", paddingBottom: 6,
            clipPath: `inset(0 0 0 ${(1 - ramp(frame, 6 + i * per, 6 + i * per + per)) * 100}%)`,
          }}>{v}</div>
        ))}
        <div style={{ borderTop: `4px solid ${C.pencil}`, marginTop: 8, paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
          <span>Total</span>
          <span style={{ color: C.danger, opacity: ramp(frame, 6 + SUMS.length * per, 10 + SUMS.length * per) }}>
            {frame % 20 < 10 ? "₦556,700?" : "₦565,700?"}
          </span>
        </div>
      </div>
      <Caption text="*9pm.* Still adding up." color="#fff" highlight="#ff8a80" delay={S.vo - 2} top={CAPTION_TOP} />
    </AbsoluteFill>
  );
};

/* Ep 5: away from the depot ----------------------------------------------- */
const Warehouse: React.FC = () => (
  <svg width="520" height="330" viewBox="0 0 520 330">
    <path d="M20 120 L260 20 L500 120 V320 H20 Z" fill="#6b7a8c" />
    <path d="M20 120 L260 20 L500 120" fill="none" stroke="#4a5666" strokeWidth="14" strokeLinejoin="round" />
    <rect x="150" y="170" width="220" height="150" fill="#3d4756" />
    {[0, 1, 2, 3, 4].map((i) => <rect key={i} x="150" y={175 + i * 30} width="220" height="6" fill="#55606f" />)}
    <rect x="200" y="60" width="120" height="40" rx="6" fill={C.accent} />
    <text x="260" y="88" textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize="26" fill={C.ink}>DEPOT</text>
  </svg>
);

export const Away: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useScene("problem");
  const you = pop(frame, 2, 13);
  const depot = pop(frame, 8, 13);
  const path = ramp(frame, 10, 34);
  const q = (i: number) => pop(frame, S.cue("happening", 0.6) + i * 5, 9);
  const truckX = interpolate(frame, [20, S.dur], [520, 1150], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <PaperBackdrop />
      <Shaky amount={1.5}>
        {/* you, far away, phone in hand */}
        <div style={{ position: "absolute", left: 90, top: 460, transform: `scale(${you})`, transformOrigin: "left top", display: "flex", alignItems: "center", gap: 30 }}>
          <svg width="200" height="260" viewBox="0 0 170 220">
            <circle cx="85" cy="60" r="48" fill={C.ink} />
            <path d="M10 220 C10 140 50 115 85 115 C120 115 160 140 160 220 Z" fill={C.ink} />
          </svg>
          <div style={{ width: 230, height: 420, borderRadius: 40, background: "#111", padding: 12 }}>
            <div style={{
              width: "100%", height: "100%", borderRadius: 30, background: "#f2f4f7", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.field, fontSize: 30, fontWeight: 700, textAlign: "center", gap: 12,
            }}>
              <div style={{ fontSize: 60 }}>…</div>No new<br />messages
            </div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 120, top: 920, fontFamily: FONT, fontWeight: 850, fontSize: 52, color: C.ink, opacity: you }}>You, at the market</div>
        {/* dashed road between you and the depot */}
        <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
          <path d="M600 700 C 900 760, 980 980, 760 1150" fill="none" stroke={C.inkSoft} strokeWidth="10" strokeDasharray="26 22"
            strokeDashoffset={-frame * 2} opacity={path} />
        </svg>
        <div style={{
          position: "absolute", left: 820, top: 900, background: C.ink, color: "#fff", fontFamily: FONT, fontWeight: 850, fontSize: 44,
          padding: "10px 24px", borderRadius: 18, opacity: path,
        }}>12 km</div>
        {/* the depot, busy without you */}
        <div style={{ position: "absolute", left: 120, top: 1130, transform: `scale(${depot})`, transformOrigin: "center bottom" }}><Warehouse /></div>
        <div style={{ position: "absolute", top: 1330, left: truckX, transform: "scale(0.62)", transformOrigin: "left top" }}><Truck color="#7d8a99" /></div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 1465, height: 10, background: "rgba(40,25,0,0.25)" }} />
        {[[200, 1080], [420, 1040], [640, 1110]].map(([x, y], i) => (
          <div key={i} style={{
            position: "absolute", left: x, top: y, width: 110, height: 110, borderRadius: 55, background: C.danger, color: "#fff",
            fontFamily: FONT, fontWeight: 900, fontSize: 80, display: "flex", alignItems: "center", justifyContent: "center",
            transform: `scale(${q(i)}) translateY(${Math.sin((frame + i * 9) * 0.3) * 8}px)`, boxShadow: "0 12px 30px rgba(180,35,24,0.4)",
          }}>?</div>
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, top: 1520, textAlign: "center", fontFamily: FONT, fontWeight: 850, fontSize: 52, color: C.ink, opacity: depot }}>
          Your depot, right now
        </div>
      </Shaky>
      <Caption text="Away from the *depot?*" color={C.ink} highlight={C.danger} delay={S.vo - 2} top={CAPTION_TOP} />
    </AbsoluteFill>
  );
};

/* Returnables 1: the crate argument --------------------------------------- */
export const Argument: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useScene("argument");
  const says = pop(frame, S.cue("says", 0.15), 12);
  const book = pop(frame, S.cue("book", 0.5), 12);
  const who = pop(frame, S.cue("who", 0.8), 10);
  const bob = Math.sin(frame * 0.25) * 6;
  return (
    <AbsoluteFill>
      <PaperBackdrop />
      <Shaky>
        {/* the customer */}
        <div style={{ position: "absolute", left: 80, top: 470, display: "flex", alignItems: "flex-start", gap: 26, transform: `scale(${says})`, transformOrigin: "left top" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <svg width="200" height="260" viewBox="0 0 170 220">
              <circle cx="85" cy="60" r="48" fill="#d35400" />
              <path d="M10 220 C10 140 50 115 85 115 C120 115 160 140 160 220 Z" fill="#d35400" />
            </svg>
            <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 40, color: C.ink, marginTop: 8 }}>Emeka, customer</div>
          </div>
          <div style={{
            position: "relative", background: "#fff", borderRadius: 40, padding: "34px 40px", marginTop: 20,
            fontFamily: FONT, fontWeight: 900, fontSize: 64, color: C.ink, boxShadow: "0 20px 50px rgba(40,25,0,0.25)",
            transform: `translateY(${bob}px)`, lineHeight: 1.05,
          }}>
            “I returned<br /><span style={{ color: C.success }}>20 crates!</span>”
            <div style={{ position: "absolute", left: -26, top: 70, width: 0, height: 0, borderTop: "22px solid transparent", borderBottom: "22px solid transparent", borderRight: "30px solid #fff" }} />
          </div>
        </div>
        {/* your book */}
        <div style={{
          position: "absolute", left: 160, right: 160, top: 1030, background: "#fbf8ef", borderRadius: 16, padding: "30px 46px",
          transform: `translateY(${(1 - book) * 900}px) rotate(2deg)`, boxShadow: "0 30px 70px rgba(40,25,0,0.35)",
          fontFamily: HAND, fontSize: 60, color: C.pencil,
          backgroundImage: "repeating-linear-gradient(180deg, transparent 0 80px, #bdd0e4 80px 83px)", backgroundPositionY: 22,
        }}>
          <div style={{ fontSize: 40, fontFamily: FONT, fontWeight: 800, color: C.inkSoft, letterSpacing: "0.06em" }}>YOUR BOOK</div>
          <div>Emeka – took 20 crates</div>
          <div>Emeka – returned: <span style={{ color: C.danger, fontWeight: 700 }}>12</span></div>
        </div>
        <div style={{
          position: "absolute", left: 0, right: 0, top: 1450, display: "flex", justifyContent: "center",
          transform: `scale(${who})`, opacity: who,
        }}>
          <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 140, color: C.danger, letterSpacing: "-0.03em" }}>20 ≠ 12</div>
        </div>
      </Shaky>
      <Caption text="He says *20.* Your book says *12.*" color={C.ink} highlight={C.danger} delay={S.vo - 2} top={CAPTION_TOP} />
    </AbsoluteFill>
  );
};

/* Returnables 2: every item not returned is money lost --------------------- */
const Cylinder: React.FC = () => (
  <svg width="150" height="260" viewBox="0 0 60 104">
    <rect x="22" y="0" width="16" height="10" rx="2" fill="#555" />
    <rect x="18" y="8" width="24" height="8" rx="3" fill="#777" />
    <path d="M8 30 Q8 16 30 16 Q52 16 52 30 V96 Q52 104 44 104 H16 Q8 104 8 96 Z" fill="#2e7d32" />
    <rect x="8" y="50" width="44" height="18" fill="#f5f5f5" />
    <text x="30" y="63" textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize="10" fill="#2e7d32">GAS</text>
  </svg>
);
const Pallet: React.FC = () => (
  <svg width="280" height="150" viewBox="0 0 140 75">
    {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={i * 28 + 2} y="0" width="24" height="14" rx="2" fill="#c49a6c" />)}
    <rect x="0" y="14" width="140" height="10" fill="#8d6e4a" />
    {[0, 1, 2].map((i) => <rect key={i} x={i * 61 + 2} y="24" width="16" height="30" fill="#a07850" />)}
    <rect x="0" y="54" width="140" height="12" fill="#8d6e4a" />
  </svg>
);

export const Loss: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useScene("loss");
  const items = [
    { el: <Crate />, word: "crates", label: "Crates", x: 70 },
    { el: <Cylinder />, word: "gas", label: "Gas cylinders", x: 430 },
    { el: <Pallet />, word: "pallets", label: "Pallets", x: 730 },
  ];
  const goAt = S.cue("every", 0.55);
  return (
    <AbsoluteFill>
      <PaperBackdrop />
      {items.map((it, i) => {
        const p = pop(frame, S.cue(it.word, i * 0.15), 12);
        const go = ramp(frame, goAt + i * 6, goAt + i * 6 + 22);
        return (
          <div key={it.word} style={{
            position: "absolute", left: it.x, top: 760, width: 280, display: "flex", flexDirection: "column", alignItems: "center",
            transform: `scale(${p}) translate(${go * go * 900}px, ${-go * 260}px) rotate(${go * 30}deg)`, opacity: 1 - go,
          }}>
            <div style={{ height: 270, display: "flex", alignItems: "flex-end" }}>{it.el}</div>
            <div style={{ fontFamily: FONT, fontWeight: 850, fontSize: 44, color: C.ink, marginTop: 20 }}>{it.label}</div>
          </div>
        );
      })}
      {/* naira coins dropping out as they go */}
      {Array.from({ length: 14 }, (_, i) => {
        const at = goAt + 4 + i * 2.2;
        const t = (frame - at) / 26;
        if (t < 0 || t > 1) return null;
        const x0 = 160 + (i % 3) * 330 + rand(i) * 120;
        return (
          <div key={i} style={{
            position: "absolute", left: x0 + t * 160, top: 820 + t * t * 760, width: 86, height: 86, borderRadius: 43,
            background: C.accent, border: `6px solid ${C.accentStrong}`, color: C.ink, fontFamily: FONT, fontWeight: 900, fontSize: 48,
            display: "flex", alignItems: "center", justifyContent: "center", opacity: 1 - t, transform: `rotate(${t * 200}deg)`,
          }}>₦</div>
        );
      })}
      <div style={{
        position: "absolute", left: 0, right: 0, top: 1420, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: 92, color: C.danger,
        opacity: pop(frame, goAt + 16, 12), transform: `scale(${pop(frame, goAt + 16, 12)})`,
      }}>= money lost</div>
      <Caption text="Not returned? That's *money.*" color={C.ink} highlight={C.danger} delay={S.vo - 2} top={CAPTION_TOP} />
    </AbsoluteFill>
  );
};
