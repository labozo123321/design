import * as THREE from "three";
import { LAY } from "./timeline";

/**
 * Printed artwork, drawn once per tab on canvases.
 *
 * The playfield is 4096 x 8192 (8 pixels a millimetre: the ball sees the floor from 13.5 mm up). Cartoon
 * monster theme: a purple night, a sunburst behind the pop bumpers, tentacles and slime from the monster's
 * corner, printed eyeballs watching you everywhere, road markings for a reader who is a ball ("YOU GOT
 * THIS", "NO BRAKES"), honest labels on the outlanes and the drain, and the soft shadows of everything that
 * stands on the playfield (baked in: none of it moves). The lamp inserts are printed unlit; Lights.tsx
 * lights them.
 *
 * Also: the side walls' art (eyes peeking out of the dark), a detail tile for the clear coat (scratches
 * and dust: what makes the highlights look real up close), and the trough's circuit board.
 */

const CW = 4096;
const CH = 8192;
const K = CW / 2048;
const W = LAY.W;
const L = LAY.L;
const XC = LAY.XC;
export const px = (x: number) => (x / W) * CW;
export const py = (y: number) => (1 - y / L) * CH;
const pr = (r: number) => (r / W) * CW;

let rng = 1;
const rnd = () => {
  rng = (rng * 16807) % 2147483647;
  return (rng - 1) / 2147483646;
};

let ART_FONT = "sans-serif";
/** The display font the printed labels use (must be loaded before the first draw). */
export const setArtFont = (f: string) => {
  ART_FONT = f;
};
const font = (size: number) => `${size}px "${ART_FONT}", "Arial Black", sans-serif`;

const outlinedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke = "#14051F",
  rot = 0,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = font(size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  // a drop shadow, a thick outline, the fill
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillText(text, size * 0.04, size * 0.06);
  ctx.lineWidth = size * 0.2;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
};

/**
 * Road markings: letters stretched along the table so that a reader at ball height sees them in
 * proportion. `y` is the bottom of the word (table metres), `h` its length along the table, `w` its width
 * across. `down`: for a ball rolling down the table (turned round, its bottom edge at `y`'s far side).
 */
const roadText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke = "#14051F",
  down = false,
) => {
  ctx.save();
  ctx.font = font(200);
  const m = ctx.measureText(text);
  const sx = pr(w) / m.width;
  const sy = pr(h) / 150;
  ctx.translate(px(x), py(down ? y + h : y));
  if (down) ctx.rotate(Math.PI);
  ctx.scale(sx, sy);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = 26;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
};

/** Insert shapes (positions in table metres), shared with Lights.tsx so the lamps sit on their prints. */
export type Insert = {
  id: string;
  shape: "circle" | "arrow" | "tri" | "star" | "rect";
  x: number;
  y: number;
  r: number;
  rot: number; // radians, 0 = pointing up the table
  color: string;
  group: string;
};

export const INSERTS: Insert[] = (() => {
  const out: Insert[] = [];
  // shoot again, bonus multipliers
  out.push({
    id: "again",
    shape: "circle",
    x: XC,
    y: 0.185,
    r: 0.016,
    rot: 0,
    color: "#FF3355",
    group: "again",
  });
  [2, 3, 4, 5].forEach((m, i) => {
    const a = (-0.9 + (i * 1.8) / 3) * 0.6;
    out.push({
      id: `x${m}`,
      shape: "circle",
      x: XC + Math.sin(a) * 0.075,
      y: 0.275 + Math.cos(a) * 0.03,
      r: 0.011,
      rot: 0,
      color: "#FFC93C",
      group: "bonus",
    });
  });
  // arrows: to the tongue (left), up the middle to the teeth, to the right lane
  out.push({
    id: "arrowTongue1",
    shape: "arrow",
    x: 0.122,
    y: 0.52,
    r: 0.02,
    rot: -0.05,
    color: "#FF5FA2",
    group: "tongue",
  });
  out.push({
    id: "arrowTongue2",
    shape: "arrow",
    x: 0.124,
    y: 0.465,
    r: 0.017,
    rot: -0.05,
    color: "#FF5FA2",
    group: "tongue",
  });
  out.push({
    id: "arrowTeeth",
    shape: "arrow",
    x: XC,
    y: 0.405,
    r: 0.02,
    rot: 0,
    color: "#7CFF6B",
    group: "teeth",
  });
  out.push({
    id: "arrowRight",
    shape: "arrow",
    x: 0.452,
    y: 0.4,
    r: 0.016,
    rot: 0,
    color: "#3FD8FF",
    group: "right",
  });
  // jackpot in the middle
  out.push({
    id: "jackpot",
    shape: "star",
    x: XC,
    y: 0.345,
    r: 0.024,
    rot: 0,
    color: "#FFE95C",
    group: "jackpot",
  });
  // multiball lights beside it
  out.push({
    id: "mb1",
    shape: "tri",
    x: XC - 0.06,
    y: 0.36,
    r: 0.014,
    rot: 0,
    color: "#FF4B3E",
    group: "multiball",
  });
  out.push({
    id: "mb2",
    shape: "tri",
    x: XC + 0.06,
    y: 0.36,
    r: 0.014,
    rot: 0,
    color: "#FF4B3E",
    group: "multiball",
  });
  // top lanes
  const g = LAY.laneGuides;
  for (let i = 0; i < 3; i++) {
    out.push({
      id: `lane${i}`,
      shape: "circle",
      x: (g[i] + g[i + 1]) / 2,
      y: 0.865,
      r: 0.0085,
      rot: 0,
      color: "#6CF0FF",
      group: "lanes",
    });
  }
  // inlane / outlane lamps
  out.push({
    id: "inL",
    shape: "rect",
    x: 0.072,
    y: 0.175,
    r: 0.009,
    rot: 0.75,
    color: "#B57CFF",
    group: "lanesLow",
  });
  out.push({
    id: "inR",
    shape: "rect",
    x: 2 * XC - 0.072,
    y: 0.175,
    r: 0.009,
    rot: -0.75,
    color: "#B57CFF",
    group: "lanesLow",
  });
  out.push({
    id: "outL",
    shape: "rect",
    x: 0.022,
    y: 0.17,
    r: 0.009,
    rot: 0,
    color: "#FF5050",
    group: "lanesLow",
  });
  out.push({
    id: "outR",
    shape: "rect",
    x: 2 * XC - 0.022,
    y: 0.17,
    r: 0.009,
    rot: 0,
    color: "#FF5050",
    group: "lanesLow",
  });
  // a ring of small lights round the bumpers
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    out.push({
      id: `ring${i}`,
      shape: "circle",
      x: 0.26 + Math.cos(a) * 0.13,
      y: 0.74 + Math.sin(a) * 0.11,
      r: 0.006,
      rot: 0,
      color: ["#FF5FA2", "#FFC93C", "#6CF0FF"][i % 3],
      group: "ring",
    });
  }
  // a trail of small dots up the centre
  for (let i = 0; i < 6; i++) {
    out.push({
      id: `dot${i}`,
      shape: "circle",
      x: XC,
      y: 0.55 + i * 0.03,
      r: 0.005,
      rot: 0,
      color: "#FFFFFF",
      group: "trail",
    });
  }
  return out;
})();

const shapePath = (ctx: CanvasRenderingContext2D, ins: Insert, grow = 1) => {
  const r = pr(ins.r) * grow;
  ctx.save();
  ctx.translate(px(ins.x), py(ins.y));
  ctx.rotate(-ins.rot);
  ctx.beginPath();
  if (ins.shape === "circle") ctx.arc(0, 0, r, 0, Math.PI * 2);
  else if (ins.shape === "rect") ctx.roundRect(-r * 0.7, -r * 1.6, r * 1.4, r * 3.2, r * 0.4);
  else if (ins.shape === "tri") {
    ctx.moveTo(0, -r * 1.2);
    ctx.lineTo(r * 1.1, r * 0.8);
    ctx.lineTo(-r * 1.1, r * 0.8);
    ctx.closePath();
  } else if (ins.shape === "arrow") {
    ctx.moveTo(0, -r * 1.5);
    ctx.lineTo(r * 1.0, -r * 0.2);
    ctx.lineTo(r * 0.42, -r * 0.2);
    ctx.lineTo(r * 0.42, r * 1.3);
    ctx.lineTo(-r * 0.42, r * 1.3);
    ctx.lineTo(-r * 0.42, -r * 0.2);
    ctx.lineTo(-r * 1.0, -r * 0.2);
    ctx.closePath();
  } else if (ins.shape === "star") {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = k % 2 ? r * 0.45 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  ctx.restore();
};
export const insertPath = shapePath;

/* ------------------------------------------------------------------ */
/* drawing helpers                                                      */
/* ------------------------------------------------------------------ */

/** A printed cartoon eyeball: veins, iris, pupil, a glint and a black outline. */
const eyeball = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  look: number,
  iris: string,
  lid = 0,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(r * 0.08, r * 0.14, r * 1.02, r * 1.02, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, "#FFFFFF");
  g.addColorStop(0.7, "#F2ECF6");
  g.addColorStop(1, "#C9B9D8");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // veins
  ctx.strokeStyle = "rgba(220, 40, 60, 0.55)";
  ctx.lineWidth = Math.max(1, r * 0.03);
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    ctx.beginPath();
    let vx = Math.cos(a) * r * 0.98;
    let vy = Math.sin(a) * r * 0.98;
    ctx.moveTo(vx, vy);
    for (let k = 0; k < 4; k++) {
      vx += -Math.cos(a) * r * 0.12 + (rnd() - 0.5) * r * 0.12;
      vy += -Math.sin(a) * r * 0.12 + (rnd() - 0.5) * r * 0.12;
      ctx.lineTo(vx, vy);
    }
    ctx.stroke();
  }
  // iris and pupil, looking off towards `look`
  const ix = Math.cos(look) * r * 0.38;
  const iy = Math.sin(look) * r * 0.38;
  const ig = ctx.createRadialGradient(ix, iy, 0, ix, iy, r * 0.48);
  ig.addColorStop(0, iris);
  ig.addColorStop(0.75, iris);
  ig.addColorStop(1, "#14051F");
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.arc(ix, iy, r * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#07020B";
  ctx.beginPath();
  ctx.arc(ix, iy, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(ix - r * 0.12, iy - r * 0.14, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  // a sleepy upper lid
  if (lid > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#6A2B9E";
    ctx.fillRect(-r, -r, r * 2, lid * r * 2);
    ctx.strokeStyle = "#14051F";
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(-r, -r + lid * r * 2);
    ctx.lineTo(r, -r + lid * r * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = "#14051F";
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

/** A tentacle: a tapering run of discs along a cubic Bezier, suckers down one side. */
const tentacle = (
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  r0: number,
  r1: number,
  col: string,
  dark: string,
) => {
  const [a, b, c, d] = pts.map(([x, y]) => [px(x), py(y)]);
  const at = (u: number) => {
    const v = 1 - u;
    return [
      v * v * v * a[0] + 3 * v * v * u * b[0] + 3 * v * u * u * c[0] + u * u * u * d[0],
      v * v * v * a[1] + 3 * v * v * u * b[1] + 3 * v * u * u * c[1] + u * u * u * d[1],
    ];
  };
  const N = 260;
  // outline, then body, then a highlight
  for (const pass of [0, 1, 2]) {
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const [x, y] = at(u);
      const r = pr(r0 + (r1 - r0) * u);
      ctx.beginPath();
      if (pass === 0) {
        ctx.fillStyle = dark;
        ctx.arc(x, y, r + 7 * K, 0, Math.PI * 2);
      } else if (pass === 1) {
        ctx.fillStyle = col;
        ctx.arc(x, y, r, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
  // suckers down one side
  for (let i = 4; i < N; i += 14) {
    const u = i / N;
    const [x, y] = at(u);
    const [x2, y2] = at(Math.min(1, u + 0.01));
    const ang = Math.atan2(y2 - y, x2 - x) + Math.PI / 2;
    const r = pr(r0 + (r1 - r0) * u);
    const sx = x + Math.cos(ang) * r * 0.55;
    const sy = y + Math.sin(ang) * r * 0.55;
    ctx.fillStyle = "#F7B6E4";
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3 * K;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * 0.32, r * 0.24, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#C5609F";
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * 0.14, r * 0.1, ang, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** A four-pointed sparkle. */
const sparkle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) => {
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const rr = k % 2 ? r * 0.22 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
};

/**
 * Soft contact shadows of everything standing on the playfield, baked into the print. They're soft, so
 * they're drawn and blurred on a canvas an eighth the size and scaled up (blurring the full-size print
 * in software takes ages).
 */
const bakeShadows = (ctx: CanvasRenderingContext2D) => {
  const S = 8;
  const c = document.createElement("canvas");
  c.width = CW / S;
  c.height = CH / S;
  const g = c.getContext("2d")!;
  const qx = (x: number) => px(x) / S;
  const qy = (y: number) => py(y) / S;
  const qr = (r: number) => pr(r) / S;
  const blur = (m: number) => (g.filter = `blur(${Math.max(1, Math.round(qr(m)))}px)`);
  // pop bumpers: a dark ring round the skirt
  blur(0.006);
  g.fillStyle = "rgba(4, 0, 10, 0.75)";
  for (const [x, y] of LAY.bumpers as [number, number][]) {
    g.beginPath();
    g.arc(qx(x), qy(y), qr(0.047), 0, Math.PI * 2);
    g.fill();
  }
  // the monster's head (it sits in the corner)
  blur(0.012);
  g.beginPath();
  g.arc(qx(LAY.monster[0]), qy(LAY.monster[1] - 0.01), qr(0.075), 0, Math.PI * 2);
  g.fill();
  // slingshots
  blur(0.005);
  g.fillStyle = "rgba(4, 0, 10, 0.7)";
  for (const s of ["L", "R"] as const) {
    const p = LAY.slings[s] as [number, number][];
    g.beginPath();
    p.forEach(([x, y], i) => (i ? g.lineTo(qx(x), qy(y)) : g.moveTo(qx(x), qy(y))));
    g.closePath();
    g.fill();
  }
  // walls and wire guides: dark lines
  blur(0.004);
  g.strokeStyle = "rgba(4, 0, 10, 0.8)";
  g.lineCap = "round";
  const line = (a: [number, number], b: [number, number], w: number) => {
    g.lineWidth = qr(w);
    g.beginPath();
    g.moveTo(qx(a[0]), qy(a[1]));
    g.lineTo(qx(b[0]), qy(b[1]));
    g.stroke();
  };
  line([0.0, 0.0], [0.0, LAY.archC[1]], 0.02);
  line([W, 0.0], [W, LAY.archC[1]], 0.02);
  line([LAY.laneX, 0.06], [LAY.laneX, 0.74], 0.022);
  line([LAY.rightLane[0], LAY.rightLane[1]], [LAY.rightLane[0], LAY.rightLane[2]], 0.012);
  for (const x of LAY.laneGuides) line([x, LAY.laneY[0]], [x, LAY.laneY[1]], 0.01);
  for (const s of ["L", "R"] as const) {
    const p = LAY.inlanes[s] as [number, number][];
    line(p[0], p[1], 0.012);
    line(p[1], p[2], 0.012);
  }
  // the arch
  g.lineWidth = qr(0.02);
  g.beginPath();
  g.arc(qx(LAY.archC[0]), qy(LAY.archC[1]), qr(LAY.archR), Math.PI, Math.PI * 2);
  g.stroke();
  // the drop targets
  blur(0.003);
  g.fillStyle = "rgba(4, 0, 10, 0.7)";
  for (const [x, y] of LAY.drops as [number, number][])
    g.fillRect(qx(x - LAY.dropW / 2), qy(y + 0.006), qr(LAY.dropW), qr(0.012));
  // under the apron's front edge
  blur(0.008);
  g.fillStyle = "rgba(4, 0, 10, 0.85)";
  g.fillRect(0, qy(LAY.apronY + 0.006), qx(LAY.laneX), CH / S);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, 0, 0, CW, CH);
  ctx.restore();
};

/* ------------------------------------------------------------------ */
/* the playfield                                                        */
/* ------------------------------------------------------------------ */

let tex: THREE.CanvasTexture | null = null;

export const playfieldTexture = () => {
  if (tex) return tex;
  rng = 7;
  const c = document.createElement("canvas");
  c.width = CW;
  c.height = CH;
  const ctx = c.getContext("2d")!;
  // night-purple ground
  const g = ctx.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, "#2A0F52");
  g.addColorStop(0.45, "#3D1374");
  g.addColorStop(0.8, "#4D0F68");
  g.addColorStop(1, "#2A0B40");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);
  // big soft swirls of colour
  for (let i = 0; i < 12; i++) {
    const x = rnd() * CW;
    const y = rnd() * CH;
    const r = (300 + rnd() * 600) * K;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = [290, 320, 260, 200][i % 4];
    rg.addColorStop(0, `hsla(${hue}, 85%, 48%, 0.45)`);
    rg.addColorStop(1, `hsla(${hue}, 85%, 45%, 0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, CW, CH);
  }
  // a printed halftone of fine dots over the whole field (it shows up close)
  ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
  const step = 18 * K;
  ctx.beginPath();
  for (let y = 0, row = 0; y < CH; y += step, row++) {
    for (let x = row % 2 ? step / 2 : 0; x < CW; x += step) {
      ctx.moveTo(x + 3.2 * K, y);
      ctx.arc(x, y, 3.2 * K, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  // a checkerboard band behind the top lanes
  const g0 = LAY.laneGuides[0];
  const g3 = LAY.laneGuides[3];
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  for (let i = 0; i < 18; i++) {
    for (let j = 0; j < 6; j++) {
      if ((i + j) % 2) continue;
      const cx = g0 + ((g3 - g0) * i) / 18;
      const cy = 0.885 + j * 0.01;
      ctx.fillRect(px(cx), py(cy + 0.01), pr((g3 - g0) / 18), pr(0.01));
    }
  }
  // sunburst behind the pop bumpers
  const bx = px(0.262);
  const by = py(0.745);
  for (let i = 0; i < 36; i++) {
    const a0 = (i / 36) * Math.PI * 2;
    const a1 = a0 + Math.PI / 36;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.arc(bx, by, 1000 * K, a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? "rgba(255, 196, 40, 0.34)" : "rgba(255, 110, 40, 0.22)";
    ctx.fill();
  }
  const rg = ctx.createRadialGradient(bx, by, 0, bx, by, 560 * K);
  rg.addColorStop(0, "rgba(255, 236, 140, 0.6)");
  rg.addColorStop(1, "rgba(255, 230, 120, 0)");
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(bx, by, 560 * K, 0, Math.PI * 2);
  ctx.fill();
  // stars
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * CW;
    const y = rnd() * CH;
    const r = (1 + rnd() * rnd() * 7) * K;
    ctx.fillStyle = `rgba(255, 255, ${200 + rnd() * 55}, ${0.35 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (r > 5 * K) sparkle(ctx, x, y, r * 3.2, "rgba(255,255,230,0.6)");
  }
  // tentacles reaching out of the monster's corner and the left wall
  tentacle(
    ctx,
    [
      [0.0, 0.86],
      [0.09, 0.8],
      [0.03, 0.7],
      [0.1, 0.64],
    ],
    0.022,
    0.006,
    "#7B3FC4",
    "#24093F",
  );
  tentacle(
    ctx,
    [
      [0.14, 1.06],
      [0.17, 0.98],
      [0.16, 0.93],
      [0.185, 0.9],
    ],
    0.016,
    0.005,
    "#8A48D6",
    "#24093F",
  );
  tentacle(
    ctx,
    [
      [0.0, 0.52],
      [0.035, 0.47],
      [0.012, 0.4],
      [0.042, 0.36],
    ],
    0.014,
    0.004,
    "#7B3FC4",
    "#24093F",
  );
  // slime drips from the top-left (the monster's corner)
  ctx.fillStyle = "#59E04A";
  ctx.strokeStyle = "#1C5A12";
  ctx.lineWidth = 10 * K;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(px(0.2), 0);
  for (let i = 0; i <= 10; i++) {
    const x = px(0.2) - (i / 10) * px(0.2);
    const drip = (i % 3 === 1 ? 260 + rnd() * 380 : 60 + rnd() * 80) * K;
    ctx.quadraticCurveTo(x + 30 * K, py(L - 0.03) + drip, x, py(L - 0.03) + drip * 0.4);
  }
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // slime puddles with a shine
  const blob = (x: number, y: number, r: number, grow: number) => {
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const rr = pr(r) * (1 + 0.18 * Math.sin(a * 3 + x * 40) + 0.1 * Math.sin(a * 5 + y * 30)) + grow;
      ctx.lineTo(px(x) + Math.cos(a) * rr, py(y) + Math.sin(a) * rr * 0.75);
    }
    ctx.closePath();
    ctx.fill();
  };
  for (const [x, y, r] of [
    [0.05, 0.93, 0.02],
    [0.16, 0.66, 0.012],
    [0.4, 0.25, 0.01],
    [0.09, 0.4, 0.009],
  ]) {
    ctx.fillStyle = "#1C5A12";
    blob(x, y, r, 8 * K);
    ctx.fillStyle = "#59E04A";
    blob(x, y, r, 0);
    ctx.fillStyle = "rgba(230,255,200,0.7)";
    ctx.beginPath();
    ctx.ellipse(px(x) - pr(r) * 0.35, py(y) - pr(r) * 0.2, pr(r) * 0.25, pr(r) * 0.08, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // printed eyeballs: they watch you everywhere
  const eyes: [number, number, number, number, string, number][] = [
    [0.4, 0.6, 0.016, 2.6, "#3FD8FF", 0],
    [0.425, 0.63, 0.011, 2.4, "#3FD8FF", 0.25],
    [0.065, 0.3, 0.013, -0.6, "#7CFF6B", 0],
    [0.4, 0.32, 0.012, 3.6, "#FF5FA2", 0.35],
    [0.18, 0.21, 0.009, -1.2, "#FFC93C", 0],
    [0.3, 0.21, 0.009, -1.9, "#FFC93C", 0],
    [0.2, 0.06, 0.012, -1.4, "#FF4B3E", 0],
    [0.275, 0.06, 0.012, -1.7, "#FF4B3E", 0],
    [0.36, 0.95, 0.012, 2.2, "#7CFF6B", 0.3],
    [0.155, 0.5, 0.009, 0.3, "#FFC93C", 0],
    [0.33, 0.56, 0.01, 1.2, "#3FD8FF", 0],
  ];
  for (const [x, y, r, look, iris, lid] of eyes) eyeball(ctx, px(x), py(y), pr(r), look, iris, lid);
  // the shooter lane: a racing stripe, and road markings for whoever's sitting in it
  const lx = px(LAY.laneX);
  ctx.fillStyle = "#13061F";
  ctx.fillRect(lx, 0, CW - lx, CH);
  for (let i = 0; i < 26; i++) {
    const y = py(0.36 + i * 0.026);
    if (y < py(0.745)) continue;
    ctx.fillStyle = i % 2 ? "#FFC93C" : "#24103A";
    ctx.beginPath();
    ctx.moveTo(lx + 20 * K, y);
    ctx.lineTo(CW - 20 * K, y - 40 * K);
    ctx.lineTo(CW - 20 * K, y - 70 * K);
    ctx.lineTo(lx + 20 * K, y - 30 * K);
    ctx.closePath();
    ctx.fill();
  }
  // lane edges: dashed lines
  ctx.fillStyle = "#FFC93C";
  for (let y = 0.09; y < 0.74; y += 0.02) {
    ctx.fillRect(lx + 14 * K, py(y + 0.01), 6 * K, pr(0.01));
    ctx.fillRect(CW - 20 * K, py(y + 0.01), 6 * K, pr(0.01));
  }
  const lc = (LAY.laneX + W) / 2 + 0.001;
  // (the first word furthest away, so it reads top to bottom on screen)
  roadText(ctx, "THIS", lc, 0.104, 0.026, 0.026, "#FFFFFF");
  roadText(ctx, "GOT", lc, 0.14, 0.024, 0.026, "#FFFFFF");
  roadText(ctx, "YOU", lc, 0.176, 0.024, 0.026, "#FFFFFF");
  // an arrow up the lane, then the warning
  ctx.fillStyle = "#FF4FA0";
  ctx.beginPath();
  ctx.moveTo(px(lc), py(0.25));
  ctx.lineTo(px(lc + 0.011), py(0.225));
  ctx.lineTo(px(lc + 0.004), py(0.225));
  ctx.lineTo(px(lc + 0.004), py(0.2));
  ctx.lineTo(px(lc - 0.004), py(0.2));
  ctx.lineTo(px(lc - 0.004), py(0.225));
  ctx.lineTo(px(lc - 0.011), py(0.225));
  ctx.closePath();
  ctx.fill();
  roadText(ctx, "BRAKES", lc, 0.275, 0.03, 0.03, "#FFC93C");
  roadText(ctx, "NO", lc, 0.315, 0.016, 0.03, "#FFC93C");
  outlinedText(ctx, "LAUNCH", (lx + CW) / 2, py(0.5), 70 * K, "#FFFFFF", "#13061F", -Math.PI / 2);
  roadText(ctx, "WHEEE", lc, 0.66, 0.03, 0.04, "#6CF0FF");
  // the logo, low and centre
  outlinedText(ctx, "MONSTER", px(XC), py(0.62), 210 * K, "#B6FF4D", "#14051F", -0.06);
  outlinedText(ctx, "CHOMP!", px(XC), py(0.565), 250 * K, "#FF4FA0", "#14051F", 0.05);
  // labels
  outlinedText(ctx, "FEED ME", px(0.075), py(0.565), 70 * K, "#FF8FC5", "#14051F", -Math.PI / 2);
  outlinedText(ctx, "TEETH", px(XC), py(0.448), 64 * K, "#7CFF6B");
  outlinedText(ctx, "JACKPOT", px(XC), py(0.31), 60 * K, "#FFE95C");
  outlinedText(ctx, "SHOOT AGAIN", px(XC), py(0.148), 44 * K, "#FFFFFF");
  outlinedText(ctx, "NOPE", px(0.022), py(0.26), 54 * K, "#FF6060", "#14051F", -Math.PI / 2);
  outlinedText(ctx, "BYE", px(2 * XC - 0.022), py(0.26), 54 * K, "#FF6060", "#14051F", Math.PI / 2);
  outlinedText(ctx, "SKILL SHOT", px(0.2675), py(0.835), 46 * K, "#6CF0FF");
  outlinedText(ctx, "DANGER ZONE", px(XC), py(0.235), 34 * K, "#FFC93C");
  // the drain: a dark gap, honestly labelled, in road markings for the ball on its way in
  const vg = ctx.createRadialGradient(px(XC), py(0.03), 0, px(XC), py(0.03), pr(0.09));
  vg.addColorStop(0, "rgba(0,0,0,0.95)");
  vg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = vg;
  ctx.fillRect(px(XC - 0.1), py(0.13), pr(0.2), pr(0.13));
  // (read by a ball rolling down towards it: turned round, the big words furthest away)
  roadText(ctx, "THE VOID", XC, 0.05, 0.064, 0.024, "#C9B8FF", "#14051F", true);
  roadText(ctx, "IT WAS NICE KNOWING YOU", XC, 0.081, 0.1, 0.012, "#FFFFFF", "#14051F", true);
  // insert prints: a dark bezel, the coloured lens with a faceted look, a light rim
  for (const ins of INSERTS) {
    shapePath(ctx, ins, 1.22);
    ctx.fillStyle = "#0B0414";
    ctx.fill();
    shapePath(ctx, ins);
    const col = new THREE.Color(ins.color);
    const ig = ctx.createRadialGradient(px(ins.x), py(ins.y), 0, px(ins.x), py(ins.y), pr(ins.r) * 1.4);
    ig.addColorStop(
      0,
      `rgb(${Math.round(col.r * 170)}, ${Math.round(col.g * 170)}, ${Math.round(col.b * 170)})`,
    );
    ig.addColorStop(
      1,
      `rgb(${Math.round(col.r * 70)}, ${Math.round(col.g * 70)}, ${Math.round(col.b * 70)})`,
    );
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 2 * K;
    const r = pr(ins.r) * 1.6;
    for (let k = -6; k <= 6; k++) {
      ctx.beginPath();
      ctx.moveTo(px(ins.x) + (k * r) / 6 - r, py(ins.y) - r);
      ctx.lineTo(px(ins.x) + (k * r) / 6 + r, py(ins.y) + r);
      ctx.moveTo(px(ins.x) + (k * r) / 6 + r, py(ins.y) - r);
      ctx.lineTo(px(ins.x) + (k * r) / 6 - r, py(ins.y) + r);
      ctx.stroke();
    }
    ctx.restore();
    shapePath(ctx, ins);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 3 * K;
    ctx.stroke();
  }
  ["2X", "3X", "4X", "5X"].forEach((txt, i) => {
    const ins = INSERTS.find((k) => k.id === `x${i + 2}`)!;
    outlinedText(ctx, txt, px(ins.x), py(ins.y - 0.021), 34 * K, "#FFC93C");
  });
  bakeShadows(ctx);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
};

/* ------------------------------------------------------------------ */
/* the side walls                                                       */
/* ------------------------------------------------------------------ */

let side: THREE.CanvasTexture | null = null;

/**
 * The inside of the cabinet's walls (1.2 m x 12 cm, tiled along each wall): a dark gradient, stars, a
 * neon zigzag, and pairs of eyes peeking out of the dark. The bottom third sits behind the steel ball
 * guides.
 */
export const sideTexture = () => {
  if (side) return side;
  rng = 11;
  const w = 4096;
  const h = 410;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0A0414");
  g.addColorStop(0.6, "#22093F");
  g.addColorStop(1, "#3A0E5E");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,230,${0.3 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h * 0.7, 1 + rnd() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // a neon zigzag
  ctx.strokeStyle = "#FF4FB8";
  ctx.lineWidth = 9;
  ctx.shadowColor = "#FF4FB8";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 60) ctx.lineTo(x, h * 0.62 + ((x / 60) % 2 ? -22 : 22));
  ctx.stroke();
  ctx.shadowBlur = 0;
  // eyes in the dark
  for (let i = 0; i < 9; i++) {
    const x = (i + 0.3 + rnd() * 0.4) * (w / 9);
    const y = h * (0.22 + rnd() * 0.18);
    const r = 16 + rnd() * 10;
    const look = rnd() * Math.PI * 2;
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#FFF6D0";
      ctx.beginPath();
      ctx.ellipse(x + s * r * 1.25, y, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0A0414";
      ctx.beginPath();
      ctx.arc(
        x + s * r * 1.25 + Math.cos(look) * r * 0.35,
        y + Math.sin(look) * r * 0.25,
        r * 0.38,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  side = new THREE.CanvasTexture(c);
  side.colorSpace = THREE.SRGBColorSpace;
  side.wrapS = THREE.RepeatWrapping;
  side.anisotropy = 8;
  return side;
};

/* ------------------------------------------------------------------ */
/* the clear coat's scratches and dust                                  */
/* ------------------------------------------------------------------ */

let detail: THREE.CanvasTexture | null = null;

/**
 * A tile (about 2 cm square on the playfield) of fine scratches and dust, used as the clear coat's
 * roughness: the highlights break up on it the way they do on a real, played-on playfield.
 */
export const detailTexture = () => {
  if (detail) return detail;
  rng = 5;
  const n = 1024;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgb(40,40,40)";
  ctx.fillRect(0, 0, n, n);
  // swirl scratches (a ball has rolled over this a million times); drawn wrapped so the tile repeats
  ctx.lineCap = "round";
  for (let i = 0; i < 420; i++) {
    const x = rnd() * n;
    const y = rnd() * n;
    const a = rnd() * Math.PI * 2;
    const len = 30 + rnd() * 260;
    const v = 70 + rnd() * 120;
    const bend = (rnd() - 0.5) * 40;
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.5})`;
    ctx.lineWidth = 0.6 + rnd() * 1.4;
    ctx.beginPath();
    for (const ox of [-n, 0, n]) {
      for (const oy of [-n, 0, n]) {
        ctx.moveTo(x + ox, y + oy);
        ctx.quadraticCurveTo(
          x + ox + Math.cos(a) * len * 0.5 + bend,
          y + oy + Math.sin(a) * len * 0.5,
          x + ox + Math.cos(a) * len,
          y + oy + Math.sin(a) * len,
        );
      }
    }
    ctx.stroke();
  }
  // dust specks
  for (let i = 0; i < 900; i++) {
    const v = 120 + rnd() * 135;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.4 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(rnd() * n, rnd() * n, 0.6 + rnd() * rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  detail = new THREE.CanvasTexture(c);
  detail.wrapS = THREE.RepeatWrapping;
  detail.wrapT = THREE.RepeatWrapping;
  detail.anisotropy = 8;
  detail.repeat.set(W / 0.022, L / 0.022);
  return detail;
};

/* ------------------------------------------------------------------ */
/* the trough's circuit board                                           */
/* ------------------------------------------------------------------ */

let pcb: THREE.CanvasTexture | null = null;

/** An opto board along the trough's back wall: green PCB, traces, chips, solder pads. */
export const pcbTexture = () => {
  if (pcb) return pcb;
  rng = 3;
  const w = 2048;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0D3B1E";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#2E7A3E";
  ctx.lineWidth = 3;
  for (let i = 0; i < 120; i++) {
    let x = rnd() * w;
    let y = rnd() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      if (rnd() < 0.5) x += (rnd() - 0.5) * 200;
      else y += (rnd() - 0.5) * 120;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = "#C9A13A";
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, 4 + rnd() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const labels = ["U1", "U7", "Q3", "OPTO", "J12", "U4", "Q9", "TROUGH", "R2"];
  for (let i = 0; i < 9; i++) {
    const x = 80 + i * 220 + rnd() * 40;
    ctx.fillStyle = "#111";
    ctx.fillRect(x, 60 + rnd() * 80, 70 + rnd() * 40, 40);
    ctx.fillStyle = "#DDD";
    ctx.font = "16px monospace";
    ctx.fillText(labels[i], x + 6, 52);
  }
  pcb = new THREE.CanvasTexture(c);
  pcb.colorSpace = THREE.SRGBColorSpace;
  pcb.anisotropy = 8;
  return pcb;
};
