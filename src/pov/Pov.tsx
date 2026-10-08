import React, { useMemo } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import {
  AbsoluteFill,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Html5Audio as Audio,
} from "remotion";
import { loadFont as loadDMSerif } from "@remotion/google-fonts/DMSerifDisplay";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";
import { CLAMP } from "../lib/anim";
import { BUILDINGS as BUILDINGS_NEAR } from "../whatif/World";
import { city } from "./city";
import { SPHERES } from "./crowd";
import { PovWorld } from "./PovWorld";
import { Post } from "./Post";
import { GravityCaptions } from "./Captions";
import { CLOUD_BASE, CLOUD_TOP, SUN_DIR, spaceness } from "./Sky";
import { T, camAt, gravity, lastPulse } from "./timeline";

const SERIF = loadDMSerif("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
const MONO = loadMono("normal", { weights: ["500"], subsets: ["latin"] }).fontFamily;
const W = 1080;
const H = 1920;

/* ------------------------------------------------------------------ */
/* Sun visibility (ray vs building boxes) + screen position             */
/* ------------------------------------------------------------------ */

const BOXES = [
  ...BUILDINGS_NEAR.map((b) => ({
    x0: b.x - b.w / 2,
    x1: b.x + b.w / 2,
    z0: b.z - b.d / 2,
    z1: b.z + b.d / 2,
    y1: b.h,
  })),
  ...city.buildings.map((b) => ({
    x0: b.x - b.w / 2,
    x1: b.x + b.w / 2,
    z0: b.z - b.d / 2,
    z1: b.z + b.d / 2,
    y1: b.h,
  })),
];
const rayHits = (o: THREE.Vector3, d: THREE.Vector3) => {
  for (const b of BOXES) {
    let tmin = 0;
    let tmax = 4000;
    const ax: [number, number, number, number][] = [
      [o.x, d.x, b.x0, b.x1],
      [o.y, d.y, -1, b.y1],
      [o.z, d.z, b.z0, b.z1],
    ];
    let hit = true;
    for (const [oo, dd, lo, hi] of ax) {
      if (Math.abs(dd) < 1e-9) {
        if (oo < lo || oo > hi) {
          hit = false;
          break;
        }
      } else {
        let t1 = (lo - oo) / dd;
        let t2 = (hi - oo) / dd;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) {
          hit = false;
          break;
        }
      }
    }
    if (hit) return true;
  }
  // tree canopies and lamp globes
  for (const sp of SPHERES) {
    const ox = o.x - sp.x;
    const oy = o.y - sp.y;
    const oz = o.z - sp.z;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const c = ox * ox + oy * oy + oz * oz - sp.r * sp.r * 0.8;
    if (b < 0 && b * b - c > 0) return true;
  }
  return false;
};

const sunState = (frame: number) => {
  const c = camAt(frame);
  const cam = new THREE.PerspectiveCamera(c.fov, W / H, 0.04, 1e7);
  cam.position.set(c.x, c.y, c.z);
  cam.rotation.order = "YXZ";
  cam.rotation.set(c.pitch, c.yaw, c.roll);
  cam.updateMatrixWorld();
  const p = new THREE.Vector3(c.x, c.y, c.z).addScaledVector(SUN_DIR, 1e6).project(cam);
  const onScreen = p.z < 1 && Math.abs(p.x) < 1.3 && Math.abs(p.y) < 1.3;
  // soft occlusion: a few rays across the sun disc
  let vis = 0;
  if (onScreen && c.y < 400) {
    const o = new THREE.Vector3(c.x, c.y, c.z);
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(SUN_DIR, up).normalize();
    for (const [a, b] of [
      [0, 0],
      [0.012, 0],
      [-0.012, 0],
      [0, 0.012],
      [0, -0.012],
    ]) {
      const d = SUN_DIR.clone().addScaledVector(side, a).addScaledVector(up, b).normalize();
      if (!rayHits(o, d)) vis += 0.2;
    }
  } else if (onScreen) vis = 1;
  return {
    x: (p.x * 0.5 + 0.5) * W,
    y: (1 - (p.y * 0.5 + 0.5)) * H,
    vis: onScreen ? vis : 0,
    edge: Math.max(Math.abs(p.x), Math.abs(p.y)),
  };
};

/* ------------------------------------------------------------------ */
/* Overlays                                                             */
/* ------------------------------------------------------------------ */

const Flare: React.FC<{ frame: number; dim: number }> = ({ frame, dim }) => {
  const prev = useMemo(() => [frame - 2, frame - 1, frame].map(sunState), [frame]);
  const s = prev[2];
  const vis =
    ((prev[0].vis + prev[1].vis + s.vis) / 3) * dim * 0.75 * Math.max(0, 1 - Math.max(0, s.edge - 1) / 0.3);
  if (vis < 0.02) return null;
  const cx = W / 2;
  const cy = H / 2;
  const ghosts = [0.35, 0.6, 1.25, 1.6, 2.1];
  return (
    <svg
      width={W}
      height={H}
      style={{ position: "absolute", inset: 0, mixBlendMode: "screen", opacity: vis }}
    >
      <defs>
        <radialGradient id="fl-core">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
          <stop offset="0.2" stopColor="#FFE9C4" stopOpacity={0.5} />
          <stop offset="1" stopColor="#FFB070" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="fl-ghost">
          <stop offset="0.6" stopColor="#9FD0FF" stopOpacity={0} />
          <stop offset="0.85" stopColor="#B8E0FF" stopOpacity={0.22} />
          <stop offset="1" stopColor="#FFC27A" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={s.x} cy={s.y} r={420} fill="url(#fl-core)" />
      <rect x={s.x - 700} y={s.y - 3} width={1400} height={6} fill="#FFE2B8" opacity={0.35} />
      {ghosts.map((g, i) => {
        const gx = s.x + (cx - s.x) * g;
        const gy = s.y + (cy - s.y) * g;
        return (
          <circle key={i} cx={gx} cy={gy} r={[38, 70, 26, 120, 54][i]} fill="url(#fl-ghost)" opacity={0.9} />
        );
      })}
    </svg>
  );
};

const Grain: React.FC<{ frame: number }> = ({ frame }) => (
  <svg
    width={W}
    height={H}
    style={{ position: "absolute", inset: 0, opacity: 0.07, mixBlendMode: "overlay" }}
  >
    <filter id="pov-grain">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.8"
        numOctaves={1}
        seed={Math.floor(frame / 2) % 50}
      />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#pov-grain)" />
  </svg>
);

/** Ice crystals growing in from the corners of your eyes in the thin, freezing air. */
const Frost: React.FC<{ k: number }> = ({ k }) => {
  if (k <= 0.01) return null;
  const reach = 0.12 + k * 0.26; // how far the crystals have grown in from each corner (fraction of width)
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
      <defs>
        <filter id="frost-x" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="turbulence" baseFrequency="0.035 0.05" numOctaves={3} seed={11} result="n" />
          <feColorMatrix in="n" values="0 0 0 0 0.85  0 0 0 0 0.93  0 0 0 0 1  0 0 0 6 -2.6" result="c" />
          <feGaussianBlur in="c" stdDeviation="0.6" />
        </filter>
        <radialGradient id="fr-g" cx="0" cy="0" r="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.75" stopColor="#fff" stopOpacity={0.35} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
        <mask id="fr-m">
          {[
            [0, 0],
            [W, 0],
            [0, H],
            [W, H],
          ].map(([x, y], i) => (
            <ellipse
              key={i}
              cx={x}
              cy={y}
              rx={W * reach * 1.25}
              ry={H * reach * 0.8}
              fill="url(#fr-g)"
              style={{ transformOrigin: `${x}px ${y}px` }}
            />
          ))}
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        filter="url(#frost-x)"
        mask="url(#fr-m)"
        opacity={Math.min(0.9, k * 1.2)}
      />
    </svg>
  );
};

/** Eyelids: soft-edged top and bottom, open = 0..1. */
const Lids: React.FC<{ open: number }> = ({ open }) => {
  if (open >= 0.999) return null;
  const h = (1 - open) * (H / 2 + 140);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: -40,
          right: -40,
          top: -140,
          height: h + 140,
          background: "#030203",
          borderRadius: "0 0 50% 50% / 0 0 160px 160px",
          filter: "blur(18px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -40,
          right: -40,
          bottom: -140,
          height: h + 140,
          background: "#030203",
          borderRadius: "50% 50% 0 0 / 160px 160px 0 0",
          filter: "blur(18px)",
        }}
      />
    </>
  );
};

const lidsOpen = (t: number) => {
  // waking: half open, a heavy blink, then open
  if (t < 1.0)
    return interpolate(t, [0, 0.22, 0.36, 0.5, 0.56, 0.72, 1.0], [0.05, 0.75, 0.7, 0.1, 0.1, 0.8, 1], CLAMP);
  // one blink right as the last leap leaves the ground
  if (t > 29.3 && t < 29.75) return interpolate(t, [29.3, 29.45, 29.55, 29.75], [1, 0, 0, 1], CLAMP);
  // the end: heavy lids, a last flutter, closed
  if (t > 63.2) return interpolate(t, [63.2, 64.2, 64.5, 64.9, 65.7], [1, 0.55, 0.75, 0.3, 0], CLAMP);
  return 1;
};

export const Pov: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const c = camAt(frame);
  const alt = c.y;
  const s = spaceness(alt);
  const g = gravity(t);

  // cloud whiteout while inside the deck: a plateau with smoothstep shoulders (a sharp peak would flash the
  // single frame at the top), wide enough to cover both deck planes as we pass through them
  const mid = (CLOUD_BASE + CLOUD_TOP) / 2;
  const u = Math.min(1, Math.max(0, (300 - Math.abs(alt - mid)) / 150));
  const white = u * u * (3 - 2 * u) * 0.92;
  // chromatic aberration: hard landings, the updraft surge
  let ca = interpolate(t, [38, 40, 44, 47], [0, 6, 6, 0], CLAMP);
  for (const [f0, v] of T.landings) {
    const d = frame - f0;
    if (d >= 0 && d < 10) ca = Math.max(ca, (v / 3.2) * 9 * Math.exp(-d / 3));
  }
  ca += s * 2.5;
  const frost = interpolate(t, [56.5, 65], [0, 1], CLAMP);
  const beats = [59.6, 60.7, 61.75, 62.75, 63.7, 64.6, 65.4];
  let pulse = 0;
  for (const b of beats) {
    const d = t - b;
    if (d >= 0 && d < 0.5)
      pulse = Math.max(pulse, Math.exp(-d * 9) + 0.6 * Math.exp(-Math.abs(d - 0.18) * 14));
  }
  const vign = 0.42 + s * 0.2 + pulse * 0.25 + interpolate(t, [62, 66], [0, 0.25], CLAMP);
  // the title slams in on the first pulse
  const title = interpolate(t, [0.95, 1.08, 4.4, 5.0], [0, 1, 1, 0], CLAMP);
  const slam = Math.max(0, t - 0.95);
  // gravity pulses: a ripple through the picture, an impact flash, the readout jumping
  const lp = lastPulse(t);
  const ripple =
    lp && lp.age < 1.4
      ? {
          radius: lp.age * 1.05 - 0.04,
          strength: lp.k * 0.04 * Math.exp(-lp.age * 1.5),
          flash: lp.k * 0.9 * Math.min(1, lp.age / 0.06) * Math.exp(-lp.age * 2.6),
        }
      : { radius: 0, strength: 0, flash: 0 };
  const hit = lp && lp.age < 0.5 ? lp.k * Math.min(1, lp.age / 0.06) * Math.exp(-lp.age * 9) : 0;
  const tick = lp && lp.age < 1.2 ? Math.exp(-lp.age * 5) : 0;
  const outro = interpolate(t, [62.4, 63.2, 65.0, 65.6], [0, 1, 1, 0], CLAMP);
  const readout = interpolate(t, [2.4, 3.2, 63, 64], [0, 1, 1, 0], CLAMP);
  const altText = alt < 1000 ? `${alt.toFixed(0)} m` : `${(alt / 1000).toFixed(alt < 10000 ? 2 : 1)} km`;

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ filter: ca > 0.3 ? `url(#pov-ca)` : undefined }}>
        <ThreeCanvas
          width={W}
          height={H}
          shadows
          camera={{ fov: 72, near: 0.04, far: 2e7, position: [9, 1.7, 24] }}
          gl={{ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
        >
          <PovWorld />
          <Post strength={0.62} radius={0.55} threshold={1.0} ripple={ripple} />
        </ThreeCanvas>
      </AbsoluteFill>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id="pov-ca" x="0" y="0" width="100%" height="100%">
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="r"
          />
          <feOffset in="r" dx={ca} dy={0} result="r2" />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="g"
          />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="b"
          />
          <feOffset in="b" dx={-ca} dy={0} result="b2" />
          <feBlend in="r2" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="b2" mode="screen" />
        </filter>
      </svg>

      <Flare frame={frame} dim={1 - white} />
      {hit > 0.01 ? (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(255,250,240,0.9), rgba(255,240,220,0.35) 70%, rgba(255,240,220,0.1))",
            opacity: Math.min(0.45, hit * 0.4),
            mixBlendMode: "screen",
          }}
        />
      ) : null}
      {white > 0.01 ? <AbsoluteFill style={{ background: "#F4F6FA", opacity: white }} /> : null}
      <Frost k={frost} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 70% at 50% 50%, transparent 52%, rgba(0,0,0,${vign}) 100%)`,
        }}
      />
      <Grain frame={frame} />

      {/* minimal text: where this much gravity is real */}
      <GravityCaptions t={t} serif={SERIF} mono={MONO} />
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 140,
          top: 320,
          textAlign: "center",
          opacity: title,
          fontFamily: SERIF,
          fontSize: 68,
          lineHeight: 1.08,
          color: "#fff",
          transform: `scale(${1 + 0.22 * Math.exp(-slam * 9)})`,
          textShadow: `${12 * Math.exp(-slam * 7)}px 0 0 rgba(255,40,120,0.75), ${-12 * Math.exp(-slam * 7)}px 0 0 rgba(40,220,255,0.75), 0 3px 22px rgba(0,0,0,0.7)`,
        }}
      >
        POV: gravity is switching off
      </div>
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 1480,
          opacity: readout * (0.85 + 0.15 * tick),
          fontFamily: MONO,
          fontSize: 34,
          color: tick > 0.05 ? `rgb(${255 - 112 * tick},${255 - 12 * tick},255)` : "#fff",
          transform: `scale(${1 + 0.35 * tick})`,
          transformOrigin: "left center",
          textShadow: "0 1px 8px rgba(0,0,0,0.7)",
          letterSpacing: "0.04em",
        }}
      >
        <div>{g.toFixed(2)} g</div>
        {t > 29 ? <div style={{ opacity: interpolate(t, [29, 30], [0, 1], CLAMP) }}>{altText}</div> : null}
      </div>
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 140,
          top: 860,
          textAlign: "center",
          opacity: outro,
          fontFamily: SERIF,
          fontSize: 60,
          color: "#fff",
          textShadow: "0 2px 18px rgba(0,0,0,0.8)",
        }}
      >
        how long would you last?
      </div>

      <Lids open={lidsOpen(t)} />
      <Audio src={staticFile("pov/bed.mp3")} />
    </AbsoluteFill>
  );
};
