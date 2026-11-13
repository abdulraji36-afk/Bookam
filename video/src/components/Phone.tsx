import React from "react";
import { C, FONT } from "../theme";
import { LogoMark } from "./LogoMark";

export const PHONE_W = 880;
export const PHONE_H = 1560;

/** A phone with the BukAm app chrome: navy header, business name, light body. */
export const Phone: React.FC<{ children: React.ReactNode; overlay?: React.ReactNode; bare?: boolean }> = ({ children, overlay, bare }) => (
  <div style={{
    width: PHONE_W, height: PHONE_H, borderRadius: 96, background: "#05080c", padding: 20,
    boxShadow: "0 60px 120px rgba(0,0,0,0.55), 0 0 0 4px #2b3440 inset",
  }}>
    <div style={{
      width: "100%", height: "100%", borderRadius: 78, overflow: "hidden", position: "relative",
      background: C.paper, fontFamily: FONT, color: C.ink,
    }}>
      {bare ? null : <div style={{
        height: 220, background: C.ink, padding: "92px 46px 0", display: "flex", alignItems: "center", gap: 18,
      }}>
        <LogoMark size={70} frame={0} built />
        <div style={{ color: "#fff", fontWeight: 900, fontSize: 46, letterSpacing: "-0.01em" }}>BukAm</div>
        <div style={{
          marginLeft: "auto", color: C.nav, fontSize: 32, fontWeight: 600, background: "rgba(255,255,255,0.08)",
          borderRadius: 30, padding: "10px 22px",
        }}>Kano Road Depot</div>
      </div>}
      <div style={{ position: "absolute", top: 26, left: "50%", width: 200, height: 50, marginLeft: -100, borderRadius: 30, background: "#05080c", zIndex: 30 }} />
      <div style={{ position: "absolute", top: bare ? 0 : 220, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>{children}</div>
      {overlay}
    </div>
  </div>
);

export const Chip: React.FC<{ bg: string; fg: string; children: React.ReactNode; size?: number }> = ({
  bg, fg, children, size = 32,
}) => (
  <span style={{
    background: bg, color: fg, borderRadius: 999, padding: `${size * 0.3}px ${size * 0.7}px`,
    fontSize: size, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8,
  }}>{children}</span>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    background: "#fff", borderRadius: 36, padding: 36, border: `2px solid ${C.line}`,
    boxShadow: "0 10px 30px rgba(11,31,51,0.08)", ...style,
  }}>{children}</div>
);

export const Avatar: React.FC<{ name: string; color: string; size?: number }> = ({ name, color, size = 90 }) => (
  <div style={{
    width: size, height: size, borderRadius: size / 2, background: color, color: "#fff", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.38,
  }}>{name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div>
);

export const ScreenTitle: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
    <div style={{ fontSize: 70, fontWeight: 850, letterSpacing: "-0.02em" }}>{title}</div>
    {right}
  </div>
);

export const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
