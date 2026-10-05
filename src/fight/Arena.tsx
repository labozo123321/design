import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP } from "../lib/anim";
import { PFONTS } from "../promo/fonts";
import { BOSS_KEYS, Body, COMBOS, FB, HITS, IMPACTS, ME_KEYS, SHOTS, evalTrack, healthAt } from "./choreo";
import { Stick, solve } from "./rig";

const ME_S = 1.25;
const BOSS_S = 1.6;
const FLOOR_Y = 1400;
/** Global framing: the vertical frame wants big fighters. */
const BASE_ZOOM = 1.35;
export const FX = {
  me: "#F4F4F4",
  meBack: "#A9AAB8",
  lime: "#9BE33A",
  boss: "#E0303F",
  bossBack: "#8E1B28",
  gold: "#FFC93C",
  sky1: "#07060F",
  sky2: "#2A0E2C",
};

const bodyAt = (who: "me" | "boss", f: number) => evalTrack(who === "me" ? ME_KEYS : BOSS_KEYS, f);
const faceOf = (who: "me" | "boss") => (who === "me" ? 1 : -1);

/** Torso centre of a fighter in world space (for sparks, aura, aim). */
const core = (who: "me" | "boss", b: Body) => {
  const s = who === "me" ? ME_S : BOSS_S;
  return { x: b.x, y: -(b.air + (b.pose.y + 40) * s) };
};

/* ------------------------------------------------------------------ */
/* Camera                                                               */
/* ------------------------------------------------------------------ */

const camera = (f: number) => {
  let cx = 0;
  let air = 0;
  for (let k = 0; k < 5; k++) {
    const m = bodyAt("me", f - k);
    const b = bodyAt("boss", f - k);
    cx += (m.x + b.x) / 2 / 5;
    air += (m.air + b.air) / 2 / 5;
  }
  cx = Math.max(-140, Math.min(140, cx));
  const low = interpolate(f, [345, 400, 470, 488], [0, 1, 1, 0], CLAMP);
  cx = cx * (1 - low) + -100 * low;
  let zoom = interpolate(
    f,
    [0, 44, 60, 345, 452, 470, 520, 536, 544, 556, 600],
    [1.0, 1.0, 1.0, 1.0, 1.12, 1.05, 1.0, 1.08, 1.42, 1.18, 1.34],
    CLAMP,
  );
  let shake = 0;
  for (const h of HITS) {
    const d = f - h.f;
    if (d >= 0 && d < 14) {
      zoom += 0.07 * h.power * Math.exp(-d / 3);
      shake += h.power * 26 * Math.exp(-d / 3.2);
    }
  }
  const sx = (random(`sx${f}`) - 0.5) * 2 * shake;
  const sy = (random(`sy${f}`) - 0.5) * 2 * shake;
  return { cx, lift: Math.min(300, air * 0.6), zoom: zoom * BASE_ZOOM, sx, sy };
};

/* ------------------------------------------------------------------ */
/* Backdrop                                                             */
/* ------------------------------------------------------------------ */

const Backdrop: React.FC<{ cx: number }> = ({ cx }) => {
  const frame = useCurrentFrame();
  const buildings = Array.from({ length: 14 }).map((_, i) => ({
    x: i * 120 - 300 + random(`bx${i}`) * 40,
    w: 80 + random(`bw${i}`) * 70,
    h: 220 + random(`bh${i}`) * 380,
  }));
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{ background: `linear-gradient(${FX.sky1} 0%, #170A22 45%, ${FX.sky2} 72%, #3B1424 100%)` }}
      />
      {/* moon */}
      <div
        style={{
          position: "absolute",
          left: 610 - cx * 0.05,
          top: 520,
          width: 330,
          height: 330,
          borderRadius: "50%",
          background: "radial-gradient(circle at 40% 38%, #FFF6E6 0%, #F2D6C2 55%, #C99A93 100%)",
          boxShadow: "0 0 120px 30px rgba(255,190,170,0.25)",
        }}
      />
      {/* skyline, parallax */}
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(${-cx * 0.25} 0)`}>
          {buildings.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={FLOOR_Y - 60 - b.h} width={b.w} height={b.h + 60} fill="#0D0816" />
              {Array.from({ length: Math.floor(b.h / 46) }).map((_, r) =>
                [0, 1].map((c) =>
                  random(`win${i}-${r}-${c}`) > 0.62 ? (
                    <rect
                      key={`${r}-${c}`}
                      x={b.x + 14 + c * (b.w / 2)}
                      y={FLOOR_Y - 40 - b.h + r * 46}
                      width={b.w / 2 - 26}
                      height={18}
                      fill="#E8A65A"
                      opacity={0.35}
                    />
                  ) : null,
                ),
              )}
            </g>
          ))}
        </g>
      </svg>
      {/* rooftop floor */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: FLOOR_Y,
          bottom: 0,
          background: "linear-gradient(#1A1322 0%, #0B0910 100%)",
          borderTop: "4px solid #3A2C44",
        }}
      />
      {/* rain */}
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        {Array.from({ length: 70 }).map((_, i) => {
          const sp = 60 + random(`rs${i}`) * 40;
          const x0 = random(`rx${i}`) * 1300 - 100;
          const y = ((random(`ry${i}`) * 1920 + frame * sp) % 2100) - 100;
          const x = x0 - y * 0.18;
          return <line key={i} x1={x} y1={y} x2={x - 9} y2={y + 48} stroke="#9FB3D9" strokeWidth={2} />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Fighters                                                             */
/* ------------------------------------------------------------------ */

const Fighter: React.FC<{ who: "me" | "boss"; f: number; opacity?: number; aura?: number }> = ({
  who,
  f,
  opacity = 1,
  aura = 0,
}) => {
  const b = bodyAt(who, f);
  const s = who === "me" ? ME_S : BOSS_S;
  const face = faceOf(who);
  const hipY = -b.air - b.pose.y * s;
  const color = who === "me" ? FX.me : FX.boss;
  return (
    <g
      transform={`translate(${b.x} ${-b.air}) rotate(${b.rot} 0 ${hipY + b.air}) scale(${s})`}
      opacity={opacity}
    >
      <Stick
        pose={b.pose}
        face={face}
        color={color}
        back={who === "me" ? FX.meBack : FX.bossBack}
        width={who === "me" ? 11 : 12}
        eyes={who === "boss" ? "#FFE36A" : undefined}
        band={who === "me" ? FX.lime : undefined}
        bandPhase={f * 0.7}
        glow={aura > 0.05 ? (who === "me" ? FX.lime : FX.boss) : undefined}
      />
    </g>
  );
};

/** Afterimages when a fighter moves fast. */
const Trails: React.FC<{ who: "me" | "boss"; f: number }> = ({ who, f }) => {
  const now = bodyAt(who, f);
  const prev = bodyAt(who, f - 2);
  const jn = solve(now.pose, faceOf(who));
  const jp = solve(prev.pose, faceOf(who));
  const speed =
    Math.abs(now.x - prev.x) +
    Math.abs(now.air - prev.air) +
    Math.hypot(jn.fHand[0] - jp.fHand[0], jn.fHand[1] - jp.fHand[1]) * 2;
  if (speed < 26) return null;
  const k = Math.min(1, (speed - 26) / 60);
  return (
    <>
      {[3, 2, 1].map((d) => (
        <Fighter key={d} who={who} f={f - d} opacity={k * (0.42 - d * 0.11)} />
      ))}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Effects                                                              */
/* ------------------------------------------------------------------ */

const Spark: React.FC<{ x: number; y: number; t: number; power: number; color: string; seed: number }> = ({
  x,
  y,
  t,
  power,
  color,
  seed,
}) => {
  const r = 50 + 130 * power;
  const k = 1 - t;
  const spikes = 10;
  const pts = Array.from({ length: spikes * 2 })
    .map((_, i) => {
      const a = (i / (spikes * 2)) * Math.PI * 2 + seed;
      const rr = (i % 2 ? 0.28 : 1) * r * (0.7 + 0.6 * t) * (0.8 + random(`sp${seed}${i}`) * 0.5);
      return `${x + Math.cos(a) * rr},${y + Math.sin(a) * rr}`;
    })
    .join(" ");
  return (
    <g opacity={k}>
      <circle cx={x} cy={y} r={r * (0.4 + t * 1.4)} fill="none" stroke={color} strokeWidth={10 * k} />
      <polygon points={pts} fill={color} />
      <polygon
        points={pts}
        fill="#fff"
        transform={`translate(${x} ${y}) scale(0.5) translate(${-x} ${-y})`}
      />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = random(`pa${seed}${i}`) * Math.PI * 2;
        const d = r * (0.6 + t * 2.2) * (0.6 + random(`pd${seed}${i}`));
        return <circle key={i} cx={x + Math.cos(a) * d} cy={y + Math.sin(a) * d} r={6 * k} fill={color} />;
      })}
    </g>
  );
};

const Dust: React.FC<{ x: number; t: number; size: number }> = ({ x, t, size }) => (
  <g opacity={(1 - t) * 0.75}>
    {Array.from({ length: 9 }).map((_, i) => {
      const dir = i - 4;
      return (
        <circle
          key={i}
          cx={x + dir * (30 + t * 80) * size}
          cy={-10 - Math.abs(dir) * 4 - t * 40 * size * (1 - Math.abs(dir) / 6)}
          r={(26 + t * 40) * size * (1 - Math.abs(dir) * 0.08)}
          fill="#5B4A63"
          opacity={0.7}
        />
      );
    })}
  </g>
);

const Orb: React.FC<{ x: number; y: number; size: number; text: string; f: number }> = ({
  x,
  y,
  size,
  text,
  f,
}) => {
  const r = 100 * size;
  const flick = 1 + Math.sin(f * 1.3) * 0.05;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r * 1.5 * flick} fill="url(#orbGlow)" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2 + f * 0.35;
        const l = r * (1.1 + 0.25 * Math.sin(f + i * 2));
        return (
          <polygon
            key={i}
            points={`${Math.cos(a - 0.16) * r * 0.9},${Math.sin(a - 0.16) * r * 0.9} ${Math.cos(a) * l * 1.18},${Math.sin(a) * l * 1.18} ${Math.cos(a + 0.16) * r * 0.9},${Math.sin(a + 0.16) * r * 0.9}`}
            fill="#FF5A2B"
          />
        );
      })}
      <circle r={r} fill="url(#orbCore)" />
      <foreignObject x={-r * 1.6} y={-r * 0.75} width={r * 3.2} height={r * 1.5}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontFamily: PFONTS.comic,
            fontSize: 50 * Math.min(size, 1.6),
            lineHeight: 0.95,
            color: "#fff",
            letterSpacing: "0.03em",
            textShadow: OUTLINE,
          }}
        >
          {text}
        </div>
      </foreignObject>
    </g>
  );
};

/** Thick black outline that keeps comic text readable over fire. */
export const OUTLINE = [
  [3, 0],
  [-3, 0],
  [0, 3],
  [0, -3],
  [2, 2],
  [-2, 2],
  [2, -2],
  [-2, -2],
  [0, 6],
]
  .map(([x, y]) => `${x}px ${y}px 0 #12060C`)
  .join(", ");

const Shards: React.FC<{ x: number; y: number; t: number; size: number; text: string; seed: number }> = ({
  x,
  y,
  t,
  size,
  text,
  seed,
}) => (
  <g opacity={1 - t}>
    {text
      .replace(/ /g, "")
      .split("")
      .map((ch, i) => {
        const a = random(`sa${seed}${i}`) * Math.PI * 2;
        const d = (80 + random(`sd${seed}${i}`) * 260) * size * t;
        return (
          <text
            key={i}
            x={x + Math.cos(a) * d}
            y={y + Math.sin(a) * d + t * t * 300}
            fontFamily={PFONTS.comic}
            fontSize={40 * size}
            fill="#FFB199"
            textAnchor="middle"
            transform={`rotate(${t * 400 * (random(`sr${seed}${i}`) - 0.5)} ${x + Math.cos(a) * d} ${y + Math.sin(a) * d})`}
          >
            {ch}
          </text>
        );
      })}
  </g>
);

/* ------------------------------------------------------------------ */
/* HUD                                                                  */
/* ------------------------------------------------------------------ */

const Bar: React.FC<{ side: "l" | "r"; who: "me" | "boss"; name: string; color: string }> = ({
  side,
  who,
  name,
  color,
}) => {
  const frame = useCurrentFrame();
  const hp = healthAt(who, frame);
  const lag = Math.max(hp, healthAt(who, frame - 14));
  const w = 370;
  const left = side === "l" ? 90 : 570;
  const anchor = side === "l" ? "right" : "left";
  const danger = hp <= 15 && Math.floor(frame / 5) % 2 === 0;
  return (
    <div style={{ position: "absolute", left, top: 312, width: w }}>
      <div
        style={{
          height: 40,
          background: "#1B1220",
          border: "4px solid #F4F4F4",
          transform: `skewX(${side === "l" ? -14 : 14}deg)`,
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 6px 0 rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            [anchor]: 0,
            width: `${lag}%`,
            background: "#FFF2C2",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            [anchor]: 0,
            width: `${hp}%`,
            background: danger ? "#FF3B3B" : `linear-gradient(${color}, ${color}AA)`,
          }}
        />
      </div>
      <div
        style={{
          marginTop: 10,
          textAlign: side === "l" ? "left" : "right",
          fontFamily: PFONTS.comic,
          fontSize: 40,
          letterSpacing: "0.04em",
          color: "#fff",
          WebkitTextStroke: "1.5px #000",
        }}
      >
        {name}
      </div>
    </div>
  );
};

const Slam: React.FC<{
  at: number;
  until: number;
  text: string;
  color: string;
  size: number;
  y?: number;
  sub?: string;
}> = ({ at, until, text, color, size, y = 780, sub }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at || frame > until) return null;
  const s = spring({ frame: frame - at, fps, config: { damping: 9, stiffness: 260, mass: 0.6 } });
  const out = interpolate(frame, [until - 6, until], [1, 0], CLAMP);
  const jit = frame - at < 8 ? (random(`j${frame}`) - 0.5) * 14 : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: y,
        textAlign: "center",
        transform: `translate(${jit}px, ${-jit}px) scale(${(2.6 - 1.6 * s) * (1 + (1 - out) * 0.4)}) rotate(-4deg)`,
        opacity: Math.min(1, s * 2) * out,
      }}
    >
      <div
        style={{
          fontFamily: PFONTS.comic,
          fontSize: size,
          lineHeight: 0.9,
          color,
          WebkitTextStroke: "6px #12060C",
          textShadow: "0 10px 0 #12060C, 0 0 60px rgba(255,255,255,0.35)",
          letterSpacing: "0.03em",
        }}
      >
        {text}
      </div>
      {sub ? (
        <div
          style={{
            fontFamily: PFONTS.comic,
            fontSize: size * 0.28,
            color: "#fff",
            WebkitTextStroke: "2px #12060C",
            marginTop: 10,
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
};

const Combo: React.FC = () => {
  const frame = useCurrentFrame();
  for (const [a, b, n] of COMBOS) {
    if (frame >= a && frame < b + 30) {
      const hits = HITS.filter(
        (h) => h.on === "boss" && h.f >= a && h.f <= Math.min(frame, b) && h.dmg > 0,
      ).length;
      const last = HITS.filter((h) => h.on === "boss" && h.f <= frame && h.f >= a).slice(-1)[0];
      const pop = last ? Math.max(0, 1 - (frame - last.f) / 5) : 0;
      const out = interpolate(frame, [b + 22, b + 30], [1, 0], CLAMP);
      return (
        <div
          style={{
            position: "absolute",
            left: 96,
            top: 430,
            opacity: out,
            transform: `scale(${1 + pop * 0.3}) rotate(-6deg)`,
            transformOrigin: "0 50%",
            fontFamily: PFONTS.comic,
            color: FX.gold,
            WebkitTextStroke: "3px #12060C",
            textShadow: "0 6px 0 #12060C",
          }}
        >
          <span style={{ fontSize: 110 }}>{Math.min(hits, n)}</span>
          <span style={{ fontSize: 52, marginLeft: 10 }}>HITS</span>
        </div>
      );
    }
  }
  return null;
};

/** Anime speed lines converging on the centre. */
const SpeedLines: React.FC<{ amount: number; color?: string }> = ({ amount, color = "#fff" }) => {
  const frame = useCurrentFrame();
  if (amount <= 0.01) return null;
  const f2 = Math.floor(frame / 2);
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, opacity: amount }}>
      {Array.from({ length: 46 }).map((_, i) => {
        const a = (i / 46) * Math.PI * 2 + random(`sl${i}${f2}`) * 0.12;
        const r0 = 560 + random(`slr${i}${f2}`) * 380;
        const cx = 540;
        const cy = 900;
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * r0}
            y1={cy + Math.sin(a) * r0}
            x2={cx + Math.cos(a) * 1500}
            y2={cy + Math.sin(a) * 1500}
            stroke={color}
            strokeWidth={4 + random(`slw${i}${f2}`) * 10}
          />
        );
      })}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* Arena                                                                */
/* ------------------------------------------------------------------ */

export const Arena: React.FC = () => {
  const frame = useCurrentFrame();
  const cam = camera(frame);
  const me = bodyAt("me", frame);
  const boss = bodyAt("boss", frame);
  const meAura = interpolate(frame, [456, 470, 600], [0, 1, 0.7], CLAMP);
  const bossAura = Math.max(
    interpolate(frame, [264, 270, 284], [0, 1, 0], CLAMP),
    interpolate(frame, [404, 420, 462, 470], [0, 1, 1, 0], CLAMP),
  );
  const impact = IMPACTS.find(([f, len]) => frame >= f && frame < f + len);
  const low = interpolate(frame, [345, 360, 452, 458], [0, 1, 1, 0], CLAMP);
  const dashLines = Math.max(
    interpolate(frame, [86, 88, 91, 94], [0, 0.5, 0.5, 0], CLAMP),
    interpolate(frame, [194, 196, 201, 204], [0, 0.5, 0.5, 0], CLAMP),
    interpolate(frame, [478, 482, 500, 506], [0, 0.9, 0.7, 0], CLAMP),
    interpolate(frame, [536, 540, 548, 556], [0, 0.8, 0.8, 0], CLAMP),
  );
  const charge = frame >= 408 && frame < 462 ? interpolate(frame, [408, 460], [0.2, 2.3], CLAMP) : 0;

  return (
    <AbsoluteFill
      style={{
        filter: impact
          ? "invert(1) grayscale(1) contrast(3)"
          : low > 0
            ? `grayscale(${low * 0.8}) brightness(${1 - low * 0.25})`
            : undefined,
      }}
    >
      <Backdrop cx={cam.cx} />
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <radialGradient id="orbCore">
            <stop offset="0" stopColor="#FFE7B0" />
            <stop offset="0.45" stopColor="#FF7A2F" />
            <stop offset="1" stopColor="#C4142E" />
          </radialGradient>
          <radialGradient id="orbGlow">
            <stop offset="0" stopColor="#FF6A2A" stopOpacity={0.55} />
            <stop offset="1" stopColor="#FF2A2A" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="auraMe">
            <stop offset="0" stopColor={FX.lime} stopOpacity={0.6} />
            <stop offset="1" stopColor={FX.lime} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="auraBoss">
            <stop offset="0" stopColor={FX.boss} stopOpacity={0.6} />
            <stop offset="1" stopColor={FX.boss} stopOpacity={0} />
          </radialGradient>
        </defs>
        <g
          transform={`translate(${540 + cam.sx} ${FLOOR_Y + cam.sy + cam.lift * cam.zoom}) scale(${cam.zoom}) translate(${-cam.cx} 0)`}
        >
          {/* shadows */}
          {[me, boss].map((b, i) => (
            <ellipse
              key={i}
              cx={b.x}
              cy={4}
              rx={(i ? 90 : 70) / (1 + b.air / 300)}
              ry={12}
              fill="#000"
              opacity={0.45}
            />
          ))}
          {/* auras */}
          {meAura > 0
            ? (() => {
                const c = core("me", me);
                return (
                  <g>
                    <ellipse
                      cx={c.x}
                      cy={c.y}
                      rx={190 * meAura * (1 + Math.sin(frame) * 0.05)}
                      ry={300 * meAura}
                      fill="url(#auraMe)"
                    />
                    {Array.from({ length: 10 }).map((_, i) => {
                      const h = ((frame * 18 + i * 53) % 260) / 260;
                      return (
                        <line
                          key={i}
                          x1={c.x - 110 + i * 24}
                          y1={c.y + 160 - h * 360}
                          x2={c.x - 110 + i * 24}
                          y2={c.y + 120 - h * 360}
                          stroke={FX.lime}
                          strokeWidth={6}
                          opacity={(1 - h) * meAura}
                        />
                      );
                    })}
                  </g>
                );
              })()
            : null}
          {bossAura > 0 ? (
            <ellipse
              cx={core("boss", boss).x}
              cy={core("boss", boss).y}
              rx={240 * bossAura}
              ry={360 * bossAura}
              fill="url(#auraBoss)"
            />
          ) : null}

          <Trails who="boss" f={frame} />
          <Fighter who="boss" f={frame} aura={bossAura} />
          <Trails who="me" f={frame} />
          <Fighter who="me" f={frame} aura={meAura} />

          {/* charging ball over the boss */}
          {charge > 0 ? (
            <Orb x={boss.x - 10} y={-560} size={charge} text="WHAT IF THEY SAY NO" f={frame} />
          ) : null}
          {/* projectiles */}
          {SHOTS.map((s, i) => {
            if (frame < s.from) return null;
            const t = (frame - s.from) / (s.to - s.from);
            if (t <= 1) {
              const x = s.x0 + (s.x1 - s.x0) * t;
              const y = -(s.y0 + (s.y1 - s.y0) * t);
              return <Orb key={i} x={x} y={y} size={s.size} text={s.text} f={frame} />;
            }
            const bt = (frame - s.to) / 16;
            if (s.fate === "miss" || bt > 1) return null;
            return <Shards key={i} x={s.x1} y={-s.y1} t={bt} size={s.size} text={s.text} seed={i} />;
          })}
          {/* sparks + dust */}
          {HITS.map((h, i) => {
            const d = frame - h.f;
            if (d < 0 || d > 9) return null;
            const b = bodyAt(h.on, h.f);
            const c = core(h.on, b);
            return (
              <Spark
                key={i}
                x={c.x}
                y={c.y}
                t={d / 9}
                power={h.power}
                color={h.on === "boss" ? FX.gold : "#FF6B6B"}
                seed={i}
              />
            );
          })}
          {(
            [
              [150, -380, 0.6],
              [240, 360, 1.2],
              [345, -330, 1],
              [553, 130, 1.6],
            ] as [number, number, number][]
          ).map(([f, x, size]) => {
            const d = frame - f;
            if (d < 0 || d > 20) return null;
            return <Dust key={f} x={x} t={d / 20} size={size} />;
          })}
        </g>
      </svg>

      <SpeedLines amount={dashLines} color={frame > 470 ? FX.lime : "#fff"} />
      {/* low-point vignette */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 35% 60%, transparent 30%, rgba(0,0,0,${0.75 * low}) 100%)`,
        }}
      />

      {/* HUD */}
      <Bar side="l" who="me" name="ME" color={FX.lime} />
      <Bar side="r" who="boss" name="OVERTHINKING" color={FX.boss} />
      <div
        style={{
          position: "absolute",
          left: 475,
          top: 296,
          width: 80,
          textAlign: "center",
          fontFamily: PFONTS.comic,
          fontSize: 64,
          color: FX.gold,
          WebkitTextStroke: "2px #000",
        }}
      >
        {Math.max(0, 99 - Math.floor(frame / 30))}
      </div>
      <Combo />
      <Slam at={8} until={44} text="ROUND 1" color={FX.gold} size={170} />
      <Slam at={FB.fightSlam} until={66} text="FIGHT" color="#FF3B3B" size={230} />
      <Slam at={FB.sendIt} until={506} text="SEND IT" color={FX.lime} size={210} sub="SUPER MOVE" />
      <Slam at={FB.koText} until={604} text="K.O." color="#FF3B3B" size={300} y={700} />
    </AbsoluteFill>
  );
};
