import * as THREE from "three";
import { canvasTex } from "./toon";

/**
 * Drawn faces for the big round heads, in the reel's meme style: heavy half-lidded lids, thick brows,
 * a smirk or a toothy grin. A face is painted on a 512 px square that is projected straight onto the
 * front of the head (see headGeometry), so a circle drawn here is a circle seen from the front.
 *
 * Canvas px <-> head: x = 256 + 256 * (object x / r), y = 256 - 256 * (object y / r).
 */

export type Eyes = "open" | "half" | "happy" | "closed" | "spiral" | "wide" | "wink" | "sleepy" | "side";
export type Brows = "flat" | "up" | "down" | "worry" | "raise" | "none" | "smug";
export type Mouth = "smirk" | "smile" | "grin" | "o" | "flat" | "wavy" | "laugh" | "frown" | "bigo" | "tiny" | "open";

export type Face = {
  eyes?: Eyes;
  /** pupil offset, -1..1 each (x right, y up, from the face's point of view of the viewer) */
  look?: [number, number];
  /** extra closing of the lids, 0..1 (blinks) */
  blink?: number;
  brows?: Brows;
  mouth?: Mouth;
  blush?: boolean;
  /** the skin colour the lids paint over the eye with */
  skin?: string;
  /** sunglasses */
  shades?: boolean;
};

const INK = "#17171c";
const EX = 82; // eye half-spacing
const EY = 232; // eye height
const MY = 338; // mouth height

const q = (x: number, n = 4) => Math.round(x * n) / n;

const drawEye = (g: CanvasRenderingContext2D, cx: number, cy: number, f: Face, side: -1 | 1, kind: Eyes) => {
  const [lx, ly] = f.look ?? [0, 0];
  const px = cx + lx * 13;
  const py = cy - ly * 11;
  const skin = f.skin ?? "#f4f2ee";
  const blink = f.blink ?? 0;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = INK;
  g.fillStyle = INK;
  if (kind === "happy" || (kind === "wink" && side === -1)) {
    g.lineWidth = 12;
    g.beginPath();
    g.arc(cx, cy + 14, 25, Math.PI * 1.13, Math.PI * 1.87);
    g.stroke();
    return;
  }
  if (kind === "closed" || blink > 0.92) {
    g.lineWidth = 11;
    g.beginPath();
    g.arc(cx, cy - 16, 26, Math.PI * 0.18, Math.PI * 0.82);
    g.stroke();
    return;
  }
  if (kind === "spiral") {
    g.lineWidth = 7;
    g.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.08) {
      const r = 2 + a * 2.0;
      const x = cx + Math.cos(a * side) * r;
      const y = cy + Math.sin(a * side) * r;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    return;
  }
  if (kind === "wide") {
    // the whites ringed in ink, a small pupil
    g.lineWidth = 8;
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.ellipse(cx, cy, 34, 40, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(px * 0.6 + cx * 0.4, py * 0.6 + cy * 0.4, 12, 0, Math.PI * 2);
    g.fill();
    return;
  }
  // a dark pupil (with a highlight), then the lid over it
  const rx = 21;
  const ry = 28;
  g.beginPath();
  g.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.arc(px - 7, py - 10, 6, 0, Math.PI * 2);
  g.fill();
  let lid = 0; // 0 open .. 1 shut, measured down the pupil
  if (kind === "half" || (kind === "wink" && side === 1) || kind === "side") lid = 0.48;
  if (kind === "sleepy") lid = 0.62;
  lid = lid + (1 - lid) * blink;
  if (lid > 0.02) {
    const ly0 = py - ry - 4 + lid * (2 * ry + 8);
    // paint the skin over the covered part
    g.fillStyle = skin;
    g.beginPath();
    g.rect(px - rx - 6, py - ry - 10, 2 * rx + 12, ly0 - (py - ry - 10));
    g.fill();
    // the heavy lid line, a little longer than the eye and tipped down at the outer end
    g.strokeStyle = INK;
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(cx - side * 30, ly0 - 2);
    g.quadraticCurveTo(cx, ly0 - 6, cx + side * 33, ly0 + 3);
    g.stroke();
  }
};

const drawBrow = (g: CanvasRenderingContext2D, cx: number, side: -1 | 1, kind: Brows) => {
  if (kind === "none") return;
  g.strokeStyle = INK;
  g.lineCap = "round";
  g.lineWidth = 12;
  let y0 = 168;
  let tilt = 0; // + = inner end lower
  let lift = 0;
  if (kind === "up") lift = 16;
  if (kind === "down") tilt = 16;
  if (kind === "worry") {
    tilt = -14;
    lift = 6;
  }
  if (kind === "smug") tilt = side === 1 ? -4 : 6;
  if (kind === "raise") lift = side === 1 ? 22 : 0;
  y0 -= lift;
  g.beginPath();
  g.moveTo(cx - side * 30, y0 + tilt);
  g.quadraticCurveTo(cx, y0 - 6 + tilt * 0.4, cx + side * 30, y0 - 2);
  g.stroke();
};

const drawMouth = (g: CanvasRenderingContext2D, kind: Mouth) => {
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = 10;
  const cx = 256;
  const y = MY;
  switch (kind) {
    case "smirk":
      g.beginPath();
      g.moveTo(cx - 40, y + 2);
      g.quadraticCurveTo(cx + 5, y + 14, cx + 44, y - 8);
      g.stroke();
      break;
    case "smile":
      g.beginPath();
      g.moveTo(cx - 48, y - 6);
      g.quadraticCurveTo(cx, y + 30, cx + 48, y - 6);
      g.stroke();
      break;
    case "frown":
      g.beginPath();
      g.moveTo(cx - 38, y + 12);
      g.quadraticCurveTo(cx, y - 14, cx + 38, y + 12);
      g.stroke();
      break;
    case "flat":
      g.beginPath();
      g.moveTo(cx - 30, y + 4);
      g.lineTo(cx + 30, y + 2);
      g.stroke();
      break;
    case "tiny":
      g.beginPath();
      g.moveTo(cx - 12, y + 4);
      g.lineTo(cx + 12, y + 4);
      g.stroke();
      break;
    case "wavy":
      g.lineWidth = 8;
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const x = cx - 44 + i * 2.2;
        const yy = y + 4 + Math.sin(i * 0.62) * 6;
        if (i === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
      break;
    case "o":
      g.beginPath();
      g.ellipse(cx, y + 6, 13, 17, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case "bigo":
      g.beginPath();
      g.ellipse(cx, y + 10, 22, 30, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case "open":
      g.beginPath();
      g.moveTo(cx - 40, y - 4);
      g.quadraticCurveTo(cx, y + 50, cx + 40, y - 4);
      g.closePath();
      g.fill();
      break;
    case "laugh": {
      g.beginPath();
      g.moveTo(cx - 54, y - 12);
      g.quadraticCurveTo(cx, y + 74, cx + 54, y - 12);
      g.closePath();
      g.fill();
      g.save();
      g.clip();
      g.fillStyle = "#e05a6a";
      g.beginPath();
      g.ellipse(cx, y + 42, 30, 18, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      g.fillRect(cx - 60, y - 16, 120, 14);
      g.restore();
      break;
    }
    case "grin": {
      // the toothy meme grin: a wide rounded mouth full of teeth
      const w = 112;
      const h = 46;
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.roundRect(cx - w / 2, y - h / 2 + 6, w, h, 20);
      g.fill();
      g.lineWidth = 9;
      g.stroke();
      g.save();
      g.clip();
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(cx - w / 2, y + 6);
      g.lineTo(cx + w / 2, y + 6);
      for (let i = 1; i < 6; i++) {
        const x = cx - w / 2 + (i * w) / 6;
        g.moveTo(x, y - h / 2 + 6);
        g.lineTo(x, y + h / 2 + 6);
      }
      g.stroke();
      g.restore();
      break;
    }
  }
};

/** The face as a texture (cached by everything that changes it). */
export const faceTexture = (f: Face): THREE.Texture => {
  const eyes = f.eyes ?? "open";
  const look = f.look ?? [0, 0];
  const key = `face|${eyes}|${q(look[0])},${q(look[1])}|${q(f.blink ?? 0, 5)}|${f.brows ?? "flat"}|${f.mouth ?? "smirk"}|${f.blush ? 1 : 0}|${f.skin ?? ""}|${f.shades ? 1 : 0}`;
  return canvasTex(key, 512, 512, (g) => {
    g.fillStyle = f.skin ?? "#f4f2ee";
    g.fillRect(0, 0, 512, 512);
    if (f.blush) {
      g.fillStyle = "rgba(240,120,130,0.35)";
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(256 + s * 112, 300, 34, 16, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    const fx = { ...f, look: [q(look[0]), q(look[1])] as [number, number], blink: q(f.blink ?? 0, 5) };
    for (const s of [-1, 1] as const) {
      drawEye(g, 256 + s * EX, EY, fx, s, eyes);
      drawBrow(g, 256 + s * EX, s, f.brows ?? "flat");
    }
    drawMouth(g, f.mouth ?? "smirk");
    if (f.shades) {
      // cool black shades with a glint
      g.fillStyle = "#15151a";
      for (const sd of [-1, 1]) {
        g.beginPath();
        g.roundRect(256 + sd * EX - 50, EY - 34, 100, 66, [12, 12, 30, 30]);
        g.fill();
      }
      g.fillRect(256 - 40, EY - 30, 80, 12);
      g.fillStyle = "rgba(255,255,255,0.55)";
      for (const sd of [-1, 1]) {
        g.beginPath();
        g.moveTo(256 + sd * EX - 30, EY - 22);
        g.lineTo(256 + sd * EX - 12, EY - 22);
        g.lineTo(256 + sd * EX - 34, EY + 10);
        g.lineTo(256 + sd * EX - 44, EY + 10);
        g.closePath();
        g.fill();
      }
    }
  });
};

let headGeo: THREE.BufferGeometry | null = null;
/** A unit sphere whose front is mapped straight onto the face square; the back half maps onto the
 * square's rim, which is plain skin, so nothing of the face wraps round. */
export const headGeometry = (): THREE.BufferGeometry => {
  if (headGeo) return headGeo;
  const g = new THREE.SphereGeometry(1, 72, 54);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (z >= 0) uv.setXY(i, 0.5 + 0.5 * x, 0.5 + 0.5 * y);
    else {
      const l = Math.max(1e-6, Math.hypot(x, y));
      uv.setXY(i, 0.5 + 0.499 * (x / l), 0.5 + 0.499 * (y / l));
    }
  }
  uv.needsUpdate = true;
  headGeo = g;
  return g;
};
