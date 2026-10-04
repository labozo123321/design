import React from "react";
import { APP, PFONTS } from "../promo/fonts";

/**
 * FourFig UI, rebuilt as vector components (screen space 572 × 1212).
 * Modelled on the real app's layout and palette, driven by animation props.
 */

export const UI = {
  bg: APP.bg,
  card: "#141924",
  line: "#252C3A",
  muted: "#8A93A6",
  lime: APP.lime,
  gold: APP.gold,
  blue: APP.blue,
  node: "#102537",
};
const font = PFONTS.app;

export type Tab = "Journey" | "Jobs" | "Money" | "You";

const TabIcon: React.FC<{ tab: Tab; color: string }> = ({ tab, color }) => {
  const p = {
    fill: "none",
    stroke: color,
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg width={30} height={30} viewBox="0 0 24 24">
      {tab === "Journey" && (
        <>
          <circle cx={5} cy={18} r={2} {...p} />
          <circle cx={11} cy={13} r={2} {...p} />
          <path d="M16 20 V4 L21 6 L16 8" {...p} />
        </>
      )}
      {tab === "Jobs" && (
        <>
          <rect x={3} y={7} width={18} height={13} rx={3} {...p} />
          <path d="M9 7 V5 h6 v2 M3 12 h18" {...p} />
        </>
      )}
      {tab === "Money" && (
        <>
          <rect x={3} y={5} width={18} height={14} rx={3} {...p} />
          <path d="M15 12 h6" {...p} />
        </>
      )}
      {tab === "You" && (
        <>
          <circle cx={12} cy={8} r={4} {...p} />
          <path d="M4 21 c1-5 15-5 16 0" {...p} />
        </>
      )}
    </svg>
  );
};

/** Status bar, big title, two square buttons, stats pills, tab bar. */
export const AppShell: React.FC<{
  title: string;
  tab: Tab;
  streak?: number;
  today?: string;
  children?: React.ReactNode;
  stats?: boolean;
}> = ({ title, tab, streak = 0, today = "0/3 today", children, stats = true }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: UI.bg,
      fontFamily: font,
      color: "#fff",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        top: 26,
        display: "flex",
        justifyContent: "space-between",
        fontWeight: 800,
        fontSize: 22,
      }}
    >
      <span>9:41</span>
      <svg width={84} height={22} viewBox="0 0 84 22">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 7} y={14 - i * 4} width={5} height={6 + i * 4} rx={1.5} fill="#fff" />
        ))}
        <rect
          x={44}
          y={3}
          width={34}
          height={17}
          rx={5}
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth={2}
        />
        <rect x={47} y={6} width={24} height={11} rx={3} fill="#fff" />
      </svg>
    </div>
    <div
      style={{
        position: "absolute",
        left: 30,
        right: 30,
        top: 84,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 52, letterSpacing: "-0.01em" }}>{title}</div>
      <div style={{ display: "flex", gap: 10 }}>
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              width: 62,
              height: 62,
              borderRadius: 16,
              border: `2px solid ${UI.line}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {i === 0 ? (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: UI.lime,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  gap: 3,
                  paddingBottom: 8,
                  boxSizing: "border-box",
                }}
              >
                <div style={{ width: 5, height: 7, background: UI.bg, borderRadius: 1 }} />
                <div style={{ width: 5, height: 12, background: UI.bg, borderRadius: 1 }} />
              </div>
            ) : (
              <svg width={28} height={28} viewBox="0 0 24 24">
                <path d="M6 16 V11 a6 6 0 0 1 12 0 V16 l1.5 2 h-15 Z M10 20 a2 2 0 0 0 4 0" fill="#fff" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 170, height: 2, background: UI.line }} />
    {stats ? (
      <div
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          top: 196,
          height: 64,
          borderRadius: 32,
          border: `2px solid ${UI.line}`,
          display: "flex",
          alignItems: "center",
          gap: 26,
          padding: "0 22px",
          fontWeight: 800,
          fontSize: 21,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width={18} height={22} viewBox="0 0 12 16">
            <path
              d="M6 0 C7 4 12 6 12 10 A6 6 0 0 1 0 10 C0 7 2 6 3 4 C3.5 6 4.5 7 5.5 7 C5.5 4.5 5 2 6 0 Z"
              fill={streak > 0 ? UI.gold : "#6B7385"}
            />
          </svg>
          {streak}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 18, height: 18, borderRadius: 4, background: "#6B7385" }} />
          {today}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width={22} height={22} viewBox="0 0 24 24">
            <path d="M12 2 l3 4 l5 1 l-3 4 l1 5 l-6-2 l-6 2 l1-5 l-3-4 l5-1 z" fill={UI.blue} />
          </svg>
          Diamond
        </span>
      </div>
    ) : null}
    {children}
    {/* tab bar */}
    <div
      style={{
        position: "absolute",
        left: 22,
        right: 22,
        bottom: 34,
        height: 96,
        borderRadius: 40,
        border: `2px solid ${UI.line}`,
        background: UI.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        padding: "0 10px",
      }}
    >
      {(["Journey", "Jobs", "Money", "You"] as Tab[]).map((t) => {
        const active = t === tab;
        return (
          <div
            key={t}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "8px 18px",
              borderRadius: 26,
              background: active ? "#14273D" : "transparent",
              color: active ? UI.blue : UI.muted,
              fontWeight: 800,
              fontSize: 17,
            }}
          >
            <TabIcon tab={t} color={active ? UI.blue : UI.muted} />
            {t}
          </div>
        );
      })}
    </div>
  </div>
);

/** A node on the journey path. state: 0 locked, 1 done, 2 current. pop 0..1 */
export const PathNode: React.FC<{ x: number; y: number; state: 0 | 1 | 2; pop?: number; glow?: number }> = ({
  x,
  y,
  state,
  pop = 1,
  glow = 0,
}) => {
  const r = state === 2 ? 58 : 44;
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        transform: `scale(${0.6 + 0.4 * pop})`,
      }}
    >
      {state === 2 ? (
        <div
          style={{
            position: "absolute",
            inset: -14 - glow * 10,
            borderRadius: "50%",
            border: `5px solid ${UI.lime}`,
            opacity: 0.35 + glow * 0.4,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: state === 2 ? UI.lime : state === 1 ? UI.node : UI.card,
          border: `4px solid ${state === 2 ? "#B6F06A" : state === 1 ? "#1E4A6E" : UI.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: state === 2 ? `0 0 ${30 + glow * 30}px rgba(136,204,45,0.6)` : undefined,
        }}
      >
        {state === 1 ? (
          <svg width={40} height={40} viewBox="0 0 24 24">
            <path
              d="M5 12.5 L10 17 L19 7"
              fill="none"
              stroke={UI.blue}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={24}
              strokeDashoffset={24 * (1 - pop)}
            />
          </svg>
        ) : state === 2 ? (
          <svg width={50} height={50} viewBox="0 0 24 24">
            <path d="M3 11 L21 4 L15 21 L11 13 Z" fill="#fff" />
          </svg>
        ) : (
          <svg width={34} height={34} viewBox="0 0 24 24" opacity={0.55}>
            <rect x={5} y={11} width={14} height={10} rx={2} fill="none" stroke="#fff" strokeWidth={2} />
            <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" fill="none" stroke="#fff" strokeWidth={2} />
          </svg>
        )}
      </div>
    </div>
  );
};

/** Stage card: blue left rule, label, title, subtitle. */
export const StageCard: React.FC<{
  label: string;
  title: string;
  sub: string;
  width?: number;
  scale?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ label, title, sub, width = 520, style, children }) => (
  <div
    style={{
      width,
      background: UI.card,
      borderRadius: 26,
      border: `2px solid ${UI.line}`,
      borderLeft: `6px solid ${UI.blue}`,
      padding: "26px 28px",
      boxSizing: "border-box",
      fontFamily: font,
      color: "#fff",
      ...style,
    }}
  >
    <div style={{ color: UI.blue, fontWeight: 900, fontSize: 18, letterSpacing: "0.12em" }}>{label}</div>
    <div style={{ fontWeight: 900, fontSize: 36, marginTop: 8, lineHeight: 1.1 }}>{title}</div>
    <div style={{ color: UI.muted, fontWeight: 700, fontSize: 22, marginTop: 8 }}>{sub}</div>
    {children}
  </div>
);

/** Lime pill button (the app's primary CTA). */
export const LimeButton: React.FC<{
  label: string;
  pressed?: number;
  width?: number | string;
  size?: number;
}> = ({ label, pressed = 0, width = "100%", size = 26 }) => (
  <div
    style={{
      width,
      height: size * 2.6,
      borderRadius: size * 1.3,
      background: UI.lime,
      boxShadow: `0 ${6 - pressed * 5}px 0 #5E9A16`,
      transform: `translateY(${pressed * 5}px)`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: font,
      fontWeight: 900,
      fontSize: size,
      letterSpacing: "0.1em",
      color: "#0E1119",
    }}
  >
    {label}
  </div>
);

/** Rounded dark input with placeholder or typed text. */
export const Field: React.FC<{
  value: string;
  placeholder: string;
  caret?: boolean;
  style?: React.CSSProperties;
  prefix?: string;
}> = ({ value, placeholder, caret, style, prefix }) => (
  <div
    style={{
      height: 74,
      borderRadius: 20,
      border: `2px solid ${UI.line}`,
      display: "flex",
      alignItems: "center",
      padding: "0 22px",
      gap: 10,
      fontFamily: font,
      fontWeight: 800,
      fontSize: 28,
      color: value ? "#fff" : "#5A6375",
      boxSizing: "border-box",
      ...style,
    }}
  >
    {prefix ? <span style={{ color: UI.muted, fontSize: 34 }}>{prefix}</span> : null}
    <span>{value || placeholder}</span>
    {caret ? <span style={{ width: 3, height: 34, background: UI.lime, marginLeft: -6 }} /> : null}
  </div>
);

/** Row in a list card (icon tile + label + chevron). */
export const ListRow: React.FC<{ label: string; color: string; glyph: React.ReactNode; last?: boolean }> = ({
  label,
  color,
  glyph,
  last,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 20,
      padding: "18px 20px",
      borderBottom: last ? undefined : `2px solid ${UI.line}`,
      fontFamily: font,
      fontWeight: 800,
      fontSize: 28,
      color: "#fff",
    }}
  >
    <div
      style={{
        width: 58,
        height: 58,
        borderRadius: 14,
        background: `${color}33`,
        border: `2px solid ${color}88`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {glyph}
    </div>
    <span style={{ flex: 1 }}>{label}</span>
    <svg width={20} height={28} viewBox="0 0 10 16">
      <path
        d="M2 2 L8 8 L2 14"
        fill="none"
        stroke={UI.muted}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

/** Simple solid glyphs for list rows. */
export const Glyph: React.FC<{ kind: "map" | "case" | "bolt"; color: string }> = ({ kind, color }) => (
  <svg width={32} height={32} viewBox="0 0 24 24">
    {kind === "map" && <path d="M3 6 L9 3 L15 6 L21 3 V18 L15 21 L9 18 L3 21 Z" fill={color} />}
    {kind === "case" && (
      <>
        <rect x={3} y={7} width={18} height={13} rx={3} fill={color} />
        <path d="M9 7 V5 h6 v2" fill="none" stroke={color} strokeWidth={2} />
      </>
    )}
    {kind === "bolt" && <path d="M13 2 L4 14 h7 l-1 8 l9-12 h-7 z" fill={color} />}
  </svg>
);
