import React from "react";

/**
 * Stickman rig. Angles in degrees.
 *  t        torso lean from vertical, + toward the facing side
 *  hd       head tilt
 *  fs / bs  front / back shoulder: 0 = arm hanging down, 90 = straight forward, 180 = straight up
 *  fe / be  elbow, relative to the upper arm (+ keeps rotating forward/up)
 *  fh / bh  front / back hip: 0 = leg straight down, 90 = straight forward
 *  fk / bk  knee, relative to the thigh (negative = shin folds back)
 *  y        hip height above the floor
 */
export type Pose = {
  t: number;
  hd: number;
  fs: number;
  fe: number;
  bs: number;
  be: number;
  fh: number;
  fk: number;
  bh: number;
  bk: number;
  y: number;
};

const P = (
  t: number,
  hd: number,
  fs: number,
  fe: number,
  bs: number,
  be: number,
  fh: number,
  fk: number,
  bh: number,
  bk: number,
  y: number,
): Pose => ({
  t,
  hd,
  fs,
  fe,
  bs,
  be,
  fh,
  fk,
  bh,
  bk,
  y,
});

export const POSES = {
  guard: P(8, 0, 40, 110, 20, 120, 28, -22, -22, -12, 96),
  bounce: P(10, 4, 44, 106, 24, 116, 32, -34, -24, -22, 88),
  jab: P(22, 0, 90, 0, -10, 120, 35, -10, -35, -5, 92),
  cross: P(30, 0, 30, 110, 95, 0, 30, -25, -42, 0, 90),
  kick: P(-30, -6, 30, 100, -40, 60, 96, 0, -8, 0, 100),
  highkick: P(-42, -10, 10, 120, -55, 40, 138, 0, -4, 0, 102),
  uppercut: P(-14, -12, 168, -12, 10, 100, 22, -10, -32, -8, 104),
  crouch: P(26, 8, 50, 100, 30, 110, 82, -138, 10, -118, 52),
  dash: P(46, 10, -52, 22, -72, 12, 72, -62, -52, -44, 88),
  tuck: P(14, 6, 70, 100, 50, 112, 104, -132, 74, -122, 96),
  hurt: P(-30, -26, 130, 40, -40, -30, 20, -40, -26, -10, 92),
  fly: P(-76, -30, 160, 22, 122, 32, 42, -32, 12, -42, 96),
  down: P(-90, -8, 172, 0, 150, 10, 86, -8, 96, 0, 14),
  kneel: P(14, 14, 60, 30, 18, 20, 86, -92, -58, -104, 60),
  block: P(4, 6, 82, 82, 70, 92, 28, -22, -22, -12, 94),
  power: P(0, 16, 22, 26, -22, -26, 32, 0, -32, 0, 104),
  superpunch: P(36, 0, 92, 0, -62, 22, 52, -44, -52, 0, 80),
  cast: P(16, 0, 86, 0, 86, 4, 30, -20, -30, -10, 94),
  windup: P(-20, -22, 172, 0, 162, 10, 32, -10, -32, -10, 100),
  slam: P(40, 10, 62, 0, 52, 0, 64, -80, -30, -40, 76),
  victory: P(0, -10, 170, 10, 20, 100, 22, 0, -22, 0, 104),
  sit: P(-4, 8, 56, 64, 46, 70, 88, -86, 84, -90, 54),
  type: P(10, 14, 64, 48, 56, 52, 88, -86, 84, -90, 54),
  thumbs: P(0, 6, 72, 92, 12, 6, 18, 0, -18, 0, 104),
};
export type PoseName = keyof typeof POSES;

const KEYS = Object.keys(POSES.guard) as (keyof Pose)[];
export const mix = (a: Pose, b: Pose, t: number): Pose => {
  const o = {} as Pose;
  for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
};

const L = { torso: 78, neck: 14, head: 19, ua: 44, fa: 42, th: 52, sh: 52 };
const rad = (d: number) => (d * Math.PI) / 180;

export type Joints = {
  hip: [number, number];
  neck: [number, number];
  head: [number, number];
  fElbow: [number, number];
  fHand: [number, number];
  bElbow: [number, number];
  bHand: [number, number];
  fKnee: [number, number];
  fFoot: [number, number];
  bKnee: [number, number];
  bFoot: [number, number];
};

/** Forward kinematics. Local space: hip at (0, -y), floor at 0, up is negative y. face = +1 right, -1 left. */
export const solve = (p: Pose, face: number): Joints => {
  const limb = (o: [number, number], a: number, len: number): [number, number] => [
    o[0] + Math.sin(rad(a)) * face * len,
    o[1] + Math.cos(rad(a)) * len,
  ];
  const hip: [number, number] = [0, -p.y];
  const neck: [number, number] = [
    hip[0] + Math.sin(rad(p.t)) * face * L.torso,
    hip[1] - Math.cos(rad(p.t)) * L.torso,
  ];
  const ht = p.t + p.hd;
  const head: [number, number] = [
    neck[0] + Math.sin(rad(ht)) * face * (L.neck + L.head),
    neck[1] - Math.cos(rad(ht)) * (L.neck + L.head),
  ];
  // arms hang relative to the torso lean
  const fElbow = limb(neck, p.fs + p.t, L.ua);
  const fHand = limb(fElbow, p.fs + p.fe + p.t, L.fa);
  const bElbow = limb(neck, p.bs + p.t, L.ua);
  const bHand = limb(bElbow, p.bs + p.be + p.t, L.fa);
  const fKnee = limb(hip, p.fh, L.th);
  const fFoot = limb(fKnee, p.fh + p.fk, L.sh);
  const bKnee = limb(hip, p.bh, L.th);
  const bFoot = limb(bKnee, p.bh + p.bk, L.sh);
  return { hip, neck, head, fElbow, fHand, bElbow, bHand, fKnee, fFoot, bKnee, bFoot };
};

const line = (pts: [number, number][]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");

/** Draws one stickman. Back limbs are slightly darker so the silhouette reads in fast poses. */
export const Stick: React.FC<{
  pose: Pose;
  face: number;
  color: string;
  back?: string;
  width?: number;
  glow?: string;
  eyes?: string;
  band?: string;
  bandPhase?: number;
  opacity?: number;
}> = ({ pose, face, color, back, width = 11, glow, eyes, band, bandPhase = 0, opacity = 1 }) => {
  const j = solve(pose, face);
  const stroke = {
    strokeWidth: width,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  // headband tails stream behind the head
  const tail = band
    ? (() => {
        const bx = j.head[0] - face * 16;
        const by = j.head[1] - 6;
        const pts: [number, number][] = [[bx, by]];
        for (let i = 1; i <= 4; i++) {
          pts.push([bx - face * i * 20, by + Math.sin(bandPhase + i * 0.9) * (4 + i * 3) + i * 3]);
        }
        return line(pts);
      })()
    : null;
  return (
    <g
      opacity={opacity}
      style={glow ? { filter: `drop-shadow(0 0 10px ${glow}) drop-shadow(0 0 22px ${glow})` } : undefined}
    >
      <path d={line([j.neck, j.bElbow, j.bHand])} stroke={back ?? color} {...stroke} />
      <path d={line([j.hip, j.bKnee, j.bFoot])} stroke={back ?? color} {...stroke} />
      <path d={line([j.hip, j.neck])} stroke={color} {...stroke} strokeWidth={width * 1.15} />
      <path d={line([j.hip, j.fKnee, j.fFoot])} stroke={color} {...stroke} />
      <path d={line([j.neck, j.fElbow, j.fHand])} stroke={color} {...stroke} />
      <circle cx={j.head[0]} cy={j.head[1]} r={19} fill={color} />
      {eyes ? (
        <g>
          <ellipse cx={j.head[0] + face * 8} cy={j.head[1] - 3} rx={5} ry={2.6} fill={eyes} />
          <ellipse cx={j.head[0] + face * -2} cy={j.head[1] - 3} rx={4} ry={2.4} fill={eyes} />
        </g>
      ) : null}
      {band && tail ? (
        <g>
          <path d={tail} stroke={band} strokeWidth={6} fill="none" strokeLinecap="round" />
          <path
            d={`M${j.head[0] - 18} ${j.head[1] - 7} L${j.head[0] + 18} ${j.head[1] - 7}`}
            stroke={band}
            strokeWidth={7}
            strokeLinecap="round"
          />
        </g>
      ) : null}
    </g>
  );
};
