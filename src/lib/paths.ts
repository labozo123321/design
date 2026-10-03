import { random } from "remotion";

export type Pt = { x: number; y: number };

export const polyLength = (pts: Pt[]) =>
  pts.slice(1).reduce((acc, p, i) => acc + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

export const polyPath = (pts: Pt[]) =>
  pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

const bezierPoint = (p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
  };
};

/**
 * Smooth Catmull-Rom curve through `pts` as cubic beziers, plus the cumulative
 * arc length at every point (so a stroke can be drawn exactly node to node).
 */
export const smoothPath = (pts: Pt[]) => {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  const cum = [0];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${p2.x} ${p2.y}`;
    let len = 0;
    let prev = p1;
    for (let s = 1; s <= 24; s++) {
      const q = bezierPoint(p1, c1, c2, p2, s / 24);
      len += Math.hypot(q.x - prev.x, q.y - prev.y);
      prev = q;
    }
    cum.push(cum[i] + len);
  }
  return { d, cum, total: cum[cum.length - 1] };
};

export type Crack = { d: string; len: number; burst: number; width: number };

/**
 * Deterministic spider-web glass crack: jagged radial rays from an impact
 * point, a few branches, and concentric connectors. `burst` groups the lines
 * so they can draw in on separate hits.
 */
export const makeCracks = (seed: string, ox: number, oy: number, reach: number, bursts = 3) => {
  const rays = 12;
  const out: Crack[] = [];
  const rayPts: Pt[][] = [];
  const rayBurst: number[] = [];

  for (let i = 0; i < rays; i++) {
    let ang = (i / rays) * Math.PI * 2 + (random(`${seed}-a${i}`) - 0.5) * 0.45;
    const L = reach * (0.42 + 0.58 * random(`${seed}-l${i}`));
    const n = 8;
    const pts: Pt[] = [{ x: ox, y: oy }];
    let x = ox;
    let y = oy;
    for (let s = 1; s <= n; s++) {
      ang += (random(`${seed}-j${i}-${s}`) - 0.5) * 0.55;
      const step = (L / n) * (0.6 + 0.8 * random(`${seed}-s${i}-${s}`));
      x += Math.cos(ang) * step;
      y += Math.sin(ang) * step;
      pts.push({ x, y });
    }
    const burst = i % bursts;
    rayPts.push(pts);
    rayBurst.push(burst);
    out.push({ d: polyPath(pts), len: polyLength(pts), burst, width: 3.4 - (i % 3) * 0.7 });

    if (random(`${seed}-br${i}`) < 0.65) {
      const k = 3 + Math.floor(random(`${seed}-bk${i}`) * 3);
      const side = random(`${seed}-bs${i}`) < 0.5 ? -1 : 1;
      let bang = Math.atan2(pts[k].y - pts[k - 1].y, pts[k].x - pts[k - 1].x) + side * 0.7;
      const branch: Pt[] = [pts[k]];
      let bx = pts[k].x;
      let by = pts[k].y;
      for (let s = 1; s <= 4; s++) {
        bang += (random(`${seed}-bj${i}-${s}`) - 0.5) * 0.6;
        const step = (L / n) * 0.7;
        bx += Math.cos(bang) * step;
        by += Math.sin(bang) * step;
        branch.push({ x: bx, y: by });
      }
      out.push({
        d: polyPath(branch),
        len: polyLength(branch),
        burst: Math.min(bursts - 1, burst + 1),
        width: 1.6,
      });
    }
  }

  for (const k of [2, 4, 6]) {
    for (let i = 0; i < rays; i++) {
      if (random(`${seed}-r${k}-${i}`) > 0.7) continue;
      const j = (i + 1) % rays;
      const a = rayPts[i][k];
      const b = rayPts[j][k];
      const mid = {
        x: (a.x + b.x) / 2 + (random(`${seed}-mx${k}-${i}`) - 0.5) * 26,
        y: (a.y + b.y) / 2 + (random(`${seed}-my${k}-${i}`) - 0.5) * 26,
      };
      const pts = [a, mid, b];
      out.push({
        d: polyPath(pts),
        len: polyLength(pts),
        burst: Math.max(rayBurst[i], rayBurst[j], Math.floor(k / 3)),
        width: 1.5,
      });
    }
  }
  return out;
};
