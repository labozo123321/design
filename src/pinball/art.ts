import * as THREE from "three";
import { LAY } from "./timeline";

/**
 * The playfield's printed artwork, drawn once per tab on a canvas (2048 x 4096, about a quarter of a
 * millimetre per pixel: the ball sees the floor from 13.5 mm up). Cartoon monster theme: a purple night
 * with stars, a sunburst behind the pop bumpers, slime drips, lane arrows, and some honest labels for the
 * outlanes and the drain. The lamp inserts are drawn here unlit; Inserts.tsx lights them.
 */

const CW = 2048;
const CH = 4096;
const W = LAY.W;
const L = LAY.L;
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

const outlinedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke = "#14051F",
  rot = 0,
  font = "900",
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `${font === "900" ? "" : font} ${size}px "${ART_FONT}", "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
};

/** Insert shapes (positions in table metres), shared with Inserts.tsx so the lamps sit on their prints. */
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
  const XC = LAY.XC;
  // shoot again, bonus multipliers
  out.push({ id: "again", shape: "circle", x: XC, y: 0.185, r: 0.016, rot: 0, color: "#FF3355", group: "again" });
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
  out.push({ id: "arrowTongue1", shape: "arrow", x: 0.122, y: 0.52, r: 0.02, rot: -0.05, color: "#FF5FA2", group: "tongue" });
  out.push({ id: "arrowTongue2", shape: "arrow", x: 0.124, y: 0.465, r: 0.017, rot: -0.05, color: "#FF5FA2", group: "tongue" });
  out.push({ id: "arrowTeeth", shape: "arrow", x: XC, y: 0.405, r: 0.02, rot: 0, color: "#7CFF6B", group: "teeth" });
  out.push({ id: "arrowRight", shape: "arrow", x: 0.452, y: 0.40, r: 0.016, rot: 0, color: "#3FD8FF", group: "right" });
  // jackpot in the middle
  out.push({ id: "jackpot", shape: "star", x: XC, y: 0.345, r: 0.024, rot: 0, color: "#FFE95C", group: "jackpot" });
  // multiball lights beside it
  out.push({ id: "mb1", shape: "tri", x: XC - 0.06, y: 0.36, r: 0.014, rot: 0, color: "#FF4B3E", group: "multiball" });
  out.push({ id: "mb2", shape: "tri", x: XC + 0.06, y: 0.36, r: 0.014, rot: 0, color: "#FF4B3E", group: "multiball" });
  // top lanes
  const g = LAY.laneGuides;
  for (let i = 0; i < 3; i++) {
    out.push({ id: `lane${i}`, shape: "circle", x: (g[i] + g[i + 1]) / 2, y: 0.865, r: 0.0085, rot: 0, color: "#6CF0FF", group: "lanes" });
  }
  // inlane / outlane lamps
  out.push({ id: "inL", shape: "rect", x: 0.072, y: 0.175, r: 0.009, rot: 0.75, color: "#B57CFF", group: "lanesLow" });
  out.push({ id: "inR", shape: "rect", x: 2 * XC - 0.072, y: 0.175, r: 0.009, rot: -0.75, color: "#B57CFF", group: "lanesLow" });
  out.push({ id: "outL", shape: "rect", x: 0.022, y: 0.17, r: 0.009, rot: 0, color: "#FF5050", group: "lanesLow" });
  out.push({ id: "outR", shape: "rect", x: 2 * XC - 0.022, y: 0.17, r: 0.009, rot: 0, color: "#FF5050", group: "lanesLow" });
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
    out.push({ id: `dot${i}`, shape: "circle", x: XC, y: 0.55 + i * 0.03, r: 0.005, rot: 0, color: "#FFFFFF", group: "trail" });
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
  g.addColorStop(0.45, "#3B1270");
  g.addColorStop(0.8, "#4A0E64");
  g.addColorStop(1, "#250A3A");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);
  // big soft swirls
  for (let i = 0; i < 9; i++) {
    const x = rnd() * CW;
    const y = rnd() * CH;
    const r = 300 + rnd() * 600;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = [290, 320, 260, 200][i % 4];
    rg.addColorStop(0, `hsla(${hue}, 85%, 45%, 0.45)`);
    rg.addColorStop(1, `hsla(${hue}, 85%, 45%, 0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, CW, CH);
  }
  // sunburst behind the pop bumpers
  const bx = px(0.26);
  const by = py(0.745);
  for (let i = 0; i < 28; i++) {
    const a0 = (i / 28) * Math.PI * 2;
    const a1 = a0 + Math.PI / 28;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.arc(bx, by, 900, a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? "rgba(255, 196, 40, 0.30)" : "rgba(255, 120, 30, 0.18)";
    ctx.fill();
  }
  const rg = ctx.createRadialGradient(bx, by, 0, bx, by, 520);
  rg.addColorStop(0, "rgba(255, 230, 120, 0.55)");
  rg.addColorStop(1, "rgba(255, 230, 120, 0)");
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(bx, by, 520, 0, Math.PI * 2);
  ctx.fill();
  // stars
  for (let i = 0; i < 900; i++) {
    const x = rnd() * CW;
    const y = rnd() * CH;
    const r = 1 + rnd() * rnd() * 7;
    ctx.fillStyle = `rgba(255, 255, ${200 + rnd() * 55}, ${0.35 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (r > 5) {
      ctx.strokeStyle = "rgba(255,255,230,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 3, y);
      ctx.lineTo(x + r * 3, y);
      ctx.moveTo(x, y - r * 3);
      ctx.lineTo(x, y + r * 3);
      ctx.stroke();
    }
  }
  // slime drips from the top-left (the monster's corner)
  ctx.fillStyle = "#59E04A";
  ctx.strokeStyle = "#1C5A12";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(px(0.2), 0);
  for (let i = 0; i <= 10; i++) {
    const x = px(0.2) - (i / 10) * px(0.2);
    const drip = i % 3 === 1 ? 260 + rnd() * 380 : 60 + rnd() * 80;
    ctx.quadraticCurveTo(x + 30, py(L - 0.03) + drip, x, py(L - 0.03) + drip * 0.4);
  }
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // plunger lane: a racing stripe
  const lx = px(LAY.laneX);
  ctx.fillStyle = "#13061F";
  ctx.fillRect(lx, 0, CW - lx, CH);
  for (let i = 0; i < 26; i++) {
    const y = py(0.08 + i * 0.026);
    ctx.fillStyle = i % 2 ? "#FFC93C" : "#13061F";
    ctx.beginPath();
    ctx.moveTo(lx + 20, y);
    ctx.lineTo(CW - 20, y - 40);
    ctx.lineTo(CW - 20, y - 70);
    ctx.lineTo(lx + 20, y - 30);
    ctx.closePath();
    ctx.fill();
  }
  outlinedText(ctx, "LAUNCH", (lx + CW) / 2, py(0.45), 70, "#FFFFFF", "#13061F", -Math.PI / 2);
  // the logo, low and centre
  outlinedText(ctx, "MONSTER", px(LAY.XC), py(0.62), 210, "#B6FF4D", "#14051F", -0.06);
  outlinedText(ctx, "CHOMP!", px(LAY.XC), py(0.565), 250, "#FF4FA0", "#14051F", 0.05);
  // labels
  outlinedText(ctx, "FEED ME", px(0.075), py(0.565), 70, "#FF8FC5", "#14051F", -Math.PI / 2);
  outlinedText(ctx, "TEETH", px(LAY.XC), py(0.448), 64, "#7CFF6B");
  outlinedText(ctx, "JACKPOT", px(LAY.XC), py(0.31), 60, "#FFE95C");
  outlinedText(ctx, "SHOOT AGAIN", px(LAY.XC), py(0.148), 44, "#FFFFFF");
  outlinedText(ctx, "NOPE", px(0.022), py(0.26), 54, "#FF6060", "#14051F", -Math.PI / 2);
  outlinedText(ctx, "BYE", px(2 * LAY.XC - 0.022), py(0.26), 54, "#FF6060", "#14051F", Math.PI / 2);
  outlinedText(ctx, "THE VOID", px(LAY.XC), py(0.088), 46, "#C9B8FF");
  outlinedText(ctx, "SKILL SHOT", px(0.2675), py(0.835), 46, "#6CF0FF");
  // the bonus multiplier labels
  // insert prints: darker translucent colours with a rim
  for (const ins of INSERTS) {
    shapePath(ctx, ins, 1.18);
    ctx.fillStyle = "#0B0414";
    ctx.fill();
    shapePath(ctx, ins);
    const col = new THREE.Color(ins.color);
    ctx.fillStyle = `rgb(${Math.round(col.r * 120)}, ${Math.round(col.g * 120)}, ${Math.round(col.b * 120)})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ["2X", "3X", "4X", "5X"].forEach((txt, i) => {
    const ins = INSERTS.find((k) => k.id === `x${i + 2}`)!;
    outlinedText(ctx, txt, px(ins.x), py(ins.y - 0.021), 34, "#FFC93C");
  });
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
};
