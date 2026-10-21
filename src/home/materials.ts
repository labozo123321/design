import * as THREE from "three";
import { canvasTex, mat, rand } from "../roadster/materials";

/**
 * A family home's surfaces, painted procedurally: oak planks (floors, treads) with grain, knots and a
 * worn satin finish; wallpaper (small sprigs, or stripes) and flat paint; white trim; a stair runner with a
 * border; rugs; brass; window glass; framed photos (whatever is drawn into them).
 */

const hex = (c: THREE.Color) => `#${c.getHexString()}`;

/** Oak planks along x: grain lines, a few knots, plank-to-plank colour variation and dark seams. */
export const planksTex = (key: string, base = "#B98A55", plankW = 64, seed = 3) =>
  canvasTex(
    `planks-${key}`,
    1024,
    1024,
    (g, w, h) => {
      const r = rand(seed);
      const b = new THREE.Color(base);
      for (let y = 0; y < h; y += plankW) {
        // planks of random length in a row
        let x = -Math.floor(r() * 400);
        while (x < w) {
          const len = 380 + r() * 520;
          const c = b.clone().offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.08, (r() - 0.5) * 0.08);
          g.fillStyle = hex(c);
          g.fillRect(x, y, len, plankW);
          // grain: long wavy lines, darker
          for (let k = 0; k < 18; k++) {
            const gy = y + r() * plankW;
            const amp = 1 + r() * 3;
            const ph = r() * 10;
            g.strokeStyle = `rgba(70,40,15,${0.06 + r() * 0.12})`;
            g.lineWidth = 0.6 + r() * 1.4;
            g.beginPath();
            for (let xx = x; xx <= x + len; xx += 16) {
              const yy = gy + Math.sin(xx * 0.01 + ph) * amp + Math.sin(xx * 0.043 + ph * 2) * amp * 0.4;
              if (xx === x) g.moveTo(xx, yy);
              else g.lineTo(xx, yy);
            }
            g.stroke();
          }
          // a knot now and then
          if (r() < 0.35) {
            const kx = x + r() * len;
            const ky = y + plankW * (0.3 + r() * 0.4);
            for (let q = 6; q > 0; q--) {
              g.strokeStyle = `rgba(60,32,12,${0.08 * q})`;
              g.lineWidth = 1;
              g.beginPath();
              g.ellipse(kx, ky, q * 3.2, q * 1.6, 0, 0, Math.PI * 2);
              g.stroke();
            }
          }
          // the seams
          g.fillStyle = "rgba(35,20,8,0.75)";
          g.fillRect(x, y, 2, plankW);
          x += len;
        }
        g.fillStyle = "rgba(35,20,8,0.8)";
        g.fillRect(0, y, w, 2);
      }
    },
    [1, 1],
  );

export const oak = (key = "floor", base = "#B98A55", repeat: [number, number] = [1, 1], rough = 0.42) =>
  mat(`oak-${key}`, () => {
    const map = planksTex(key, base).clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat[0], repeat[1]);
    map.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({ map, roughness: rough, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  });

/** Wallpaper: a cream ground with small two-leaf sprigs in a half-drop repeat, or soft stripes. */
export const wallpaperTex = (key: string, ground = "#EFE6D2", ink = "#7E9A6A", kind: "sprig" | "stripe" = "sprig") =>
  canvasTex(
    `wallpaper-${key}`,
    512,
    512,
    (g, w, h) => {
      g.fillStyle = ground;
      g.fillRect(0, 0, w, h);
      // paper texture
      const r = rand(17);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `rgba(120,100,70,${r() * 0.04})`;
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
      if (kind === "stripe") {
        for (let x = 0; x < w; x += 64) {
          g.fillStyle = ink;
          g.globalAlpha = 0.18;
          g.fillRect(x, 0, 22, h);
          g.globalAlpha = 0.3;
          g.fillRect(x + 28, 0, 3, h);
          g.globalAlpha = 1;
        }
        return;
      }
      const step = 64;
      for (let j = 0; j < h / step + 1; j++)
        for (let i = 0; i < w / step + 1; i++) {
          const cx = i * step + (j % 2 ? step / 2 : 0);
          const cy = j * step;
          const a = (r() - 0.5) * 0.6;
          g.save();
          g.translate(cx, cy);
          g.rotate(a);
          g.strokeStyle = ink;
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(0, 8);
          g.quadraticCurveTo(1, 0, 0, -9);
          g.stroke();
          g.fillStyle = ink;
          for (const sd of [-1, 1]) {
            g.beginPath();
            g.ellipse(sd * 4.5, -2 + sd, 4.6, 2.1, sd * 0.6, 0, Math.PI * 2);
            g.fill();
          }
          g.beginPath();
          g.arc(0, -10, 1.8, 0, Math.PI * 2);
          g.fillStyle = "#C98E7A";
          g.fill();
          g.restore();
        }
    },
    [1, 1],
  );

export const wallpaper = (key: string, ground: string, ink: string, repeat: [number, number], kind: "sprig" | "stripe" = "sprig") =>
  mat(`wp-${key}`, () => {
    const map = wallpaperTex(key, ground, ink, kind).clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat[0], repeat[1]);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.88 });
  });

export const paint = (color: string, rough = 0.9) => mat(`paint-${color}-${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough }));
export const trim = (color = "#F3F0E8") => mat(`trim-${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
export const brass = () => mat("brass", () => new THREE.MeshStandardMaterial({ color: "#C9A25A", metalness: 0.9, roughness: 0.32 }));
export const glass = () =>
  mat("homeGlass", () => new THREE.MeshPhysicalMaterial({ color: "#DDE8F0", roughness: 0.05, transmission: 0, transparent: true, opacity: 0.18, metalness: 0, envMapIntensity: 1.2 }));

/** A stair runner / rug: a field colour with a small all-over pattern and a border near the edges (u across). */
export const runnerTex = (key: string, field = "#8E2F2C", border = "#2F3E5A", motif = "#D9B26A") =>
  canvasTex(
    `runner-${key}`,
    256,
    512,
    (g, w, h) => {
      g.fillStyle = field;
      g.fillRect(0, 0, w, h);
      g.fillStyle = border;
      g.fillRect(0, 0, 26, h);
      g.fillRect(w - 26, 0, 26, h);
      g.fillStyle = motif;
      g.fillRect(28, 0, 4, h);
      g.fillRect(w - 32, 0, 4, h);
      for (let y = 18; y < h; y += 36)
        for (let x = 52; x < w - 40; x += 38) {
          g.save();
          g.translate(x + ((y / 36) % 2 ? 19 : 0), y);
          g.rotate(Math.PI / 4);
          g.fillStyle = motif;
          g.globalAlpha = 0.75;
          g.fillRect(-5, -5, 10, 10);
          g.globalAlpha = 1;
          g.fillStyle = field;
          g.fillRect(-2, -2, 4, 4);
          g.restore();
        }
      // wool: fine fibres
      const r = rand(5);
      for (let i = 0; i < 6000; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,240,220"},${r() * 0.06})`;
        g.fillRect(r() * w, r() * h, 1, 2);
      }
    },
  );

export const runner = (key: string, field?: string, border?: string, motif?: string, repeatV = 1) =>
  mat(`runner-${key}`, () => {
    const map = runnerTex(key, field, border, motif).clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1, repeatV);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.97 });
  });

/** A framed photo's print: draw(g) paints the picture into a w x h canvas (a soft old-print look on top). */
export const photoMat = (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, fade = 0.08) =>
  mat(`photo-${key}`, () => {
    const map = canvasTex(`photo-${key}`, w, h, (g, W, H) => {
      draw(g, W, H);
      g.fillStyle = `rgba(255,236,200,${fade})`;
      g.fillRect(0, 0, W, H);
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.35 });
  });

/** A warm lamp's glowing shade or bulb: HDR colour (k > 1 blooms). */
export const glow = (key: string, color: string, k: number) =>
  mat(`glow-${key}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }));
