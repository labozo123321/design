import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hash } from "./timeline";

/**
 * The school gym on picture day: a varnished maple court with its painted lines, cinderblock walls with
 * the school's colours and the blue wall pads, steel trusses and high-bay lamps, high windows, a hoop
 * cranked up over the photo set, folded bleachers down one side, the doors. And the set: the mottled blue
 * backdrop on its stand, the posing stool, two octagonal softboxes on stands, the laptop table, a bin.
 *
 * Coordinates: metres; the stool at the origin, the camera on its tripod at z = +2.6 looking down -z at it.
 */

export const GYM = { x0: -9, x1: 9, z0: -4.6, z1: 24, h: 8 };
export const STOOL_H = 0.62;
export const BACKDROP_Z = -1.35;
export const SOFTBOX = [
  { at: new THREE.Vector3(-1.35, 1.95, 1.15), r: 0.55 },
  { at: new THREE.Vector3(1.45, 1.72, 1.25), r: 0.5 },
];
export const FACE = new THREE.Vector3(0, 1.4, 0);

const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number], srgb = true) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
};

/* ------------------------------------------------------------------ */
/* Floor                                                                 */
/* ------------------------------------------------------------------ */

// a 2 m square of maple strips, repeated
const plankTex = () =>
  canvasTex(1024, 1024, (g) => {
    const S = 1024;
    const rows = 36; // ~5.5 cm strips
    for (let r = 0; r < rows; r++) {
      let x = -hash(r * 3.1) * 300;
      while (x < S) {
        const len = 180 + hash(r * 7.3 + x) * 420;
        const k = hash(r * 11.7 + x * 0.13);
        const base = [214 + k * 22, 168 + k * 24, 112 + k * 22];
        const y0 = (r * S) / rows;
        const grad = g.createLinearGradient(x, 0, x + len, 0);
        grad.addColorStop(0, `rgb(${base[0] - 8},${base[1] - 8},${base[2] - 8})`);
        grad.addColorStop(0.5, `rgb(${base[0]},${base[1]},${base[2]})`);
        grad.addColorStop(1, `rgb(${base[0] - 12},${base[1] - 12},${base[2] - 10})`);
        g.fillStyle = grad;
        g.fillRect(x, y0, len, S / rows);
        // grain
        for (let i = 0; i < 14; i++) {
          g.strokeStyle = `rgba(120,70,30,${0.05 + hash(i + x) * 0.07})`;
          g.lineWidth = 1;
          g.beginPath();
          const yy = y0 + hash(i * 3 + x) * (S / rows);
          g.moveTo(x, yy);
          g.bezierCurveTo(x + len * 0.3, yy + 3, x + len * 0.6, yy - 3, x + len, yy + 1);
          g.stroke();
        }
        g.fillStyle = "rgba(60,35,15,0.55)";
        g.fillRect(x, y0, 1.5, S / rows);
        x += len;
      }
      g.fillStyle = "rgba(60,35,15,0.4)";
      g.fillRect(0, (r * S) / rows, S, 1.2);
    }
  }, [1, 1]);

const floorMaterial = () => {
  const map = plankTex();
  map.repeat.set((GYM.x1 - GYM.x0) / 2, (GYM.z1 - GYM.z0) / 2);
  return new THREE.MeshPhysicalMaterial({ map, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.2 });
};

/** The court's painted lines and the key, as strips just over the floor. */
const courtGeometry = () => {
  const parts: THREE.BufferGeometry[] = [];
  const W = 0.05;
  const strip = (x0: number, z0: number, x1: number, z1: number) => {
    const d = new THREE.Vector2(x1 - x0, z1 - z0);
    const g = new THREE.PlaneGeometry(d.length(), W);
    g.rotateX(-Math.PI / 2);
    g.rotateY(-Math.atan2(d.y, d.x));
    g.translate((x0 + x1) / 2, 0.002, (z0 + z1) / 2);
    parts.push(g);
  };
  const arc = (cx: number, cz: number, r: number, a0: number, a1: number) => {
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const b = a0 + ((a1 - a0) * (i + 1)) / n;
      strip(cx + Math.cos(a) * r, cz + Math.sin(a) * r, cx + Math.cos(b) * r, cz + Math.sin(b) * r);
    }
  };
  // the court: 15 x 28 (the end line just behind the backdrop, the far end beyond the camera)
  const x0 = -7.5;
  const x1 = 7.5;
  const za = -3.9;
  const zb = za + 28;
  strip(x0, za, x1, za);
  strip(x0, zb, x1, zb);
  strip(x0, za, x0, zb);
  strip(x1, za, x1, zb);
  strip(x0, za + 14, x1, za + 14);
  arc(0, za + 14, 1.8, 0, Math.PI * 2);
  for (const [z, s] of [
    [za, 1],
    [zb, -1],
  ] as const) {
    // the key's sides and the free-throw circle; the three-point arc
    strip(-2.45, z, -2.45, z + s * 5.8);
    strip(2.45, z, 2.45, z + s * 5.8);
    strip(-2.45, z + s * 5.8, 2.45, z + s * 5.8);
    arc(0, z + s * 5.8, 1.8, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : Math.PI * 2);
    arc(0, z + s * 1.6, 6.75, s > 0 ? 0.22 : Math.PI + 0.22, s > 0 ? Math.PI - 0.22 : Math.PI * 2 - 0.22);
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
};

const keyGeometry = () => {
  const parts: THREE.BufferGeometry[] = [];
  for (const [z, s] of [
    [-3.9, 1],
    [24.1, -1],
  ] as const) {
    const g = new THREE.PlaneGeometry(4.9, 5.8);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.0015, z + s * 2.9);
    parts.push(g);
  }
  return mergeGeometries(parts)!;
};

/* ------------------------------------------------------------------ */
/* Walls, roof                                                           */
/* ------------------------------------------------------------------ */

// cinderblock: 40 x 20 cm blocks, painted; the texture is 2 m x 2 m
const blockTex = () =>
  canvasTex(512, 512, (g) => {
    g.fillStyle = "#E7E0D2";
    g.fillRect(0, 0, 512, 512);
    const bw = 512 / 5;
    const bh = 512 / 10;
    for (let r = 0; r < 10; r++) {
      for (let c = -1; c < 6; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0);
        const y = r * bh;
        const k = hash(r * 13 + c * 7);
        g.fillStyle = `rgb(${226 + k * 14},${219 + k * 12},${204 + k * 12})`;
        g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        // pitted surface
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(90,80,60,${0.04 + hash(i * 3 + r + c) * 0.06})`;
          g.fillRect(x + hash(i + r * 5 + c) * bw, y + hash(i * 7 + r + c * 3) * bh, 2, 2);
        }
      }
    }
  }, [1, 1]);

const Walls: React.FC = () => {
  const objs = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const tex = blockTex();
    const mk = (len: number, h: number) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(len / 2, h / 2);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
    };
    const H = GYM.h;
    const lenX = GYM.x1 - GYM.x0;
    const lenZ = GYM.z1 - GYM.z0;
    const wall = (w: number, at: THREE.Vector3, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mk(w, H));
      m.position.copy(at);
      m.rotation.y = ry;
      m.receiveShadow = true;
      out.push(m);
    };
    wall(lenX, new THREE.Vector3(0, H / 2, GYM.z0), 0);
    wall(lenX, new THREE.Vector3(0, H / 2, GYM.z1), Math.PI);
    wall(lenZ, new THREE.Vector3(GYM.x0, H / 2, (GYM.z0 + GYM.z1) / 2), Math.PI / 2);
    wall(lenZ, new THREE.Vector3(GYM.x1, H / 2, (GYM.z0 + GYM.z1) / 2), -Math.PI / 2);
    // the school's colours: a maroon band with a gold stripe, all round at 2.6 m
    const band = new THREE.MeshStandardMaterial({ color: "#7A1F2B", roughness: 0.7 });
    const gold = new THREE.MeshStandardMaterial({ color: "#D9A62E", roughness: 0.6 });
    const ring = (y: number, hh: number, mat: THREE.Material) => {
      for (const [w, at, ry] of [
        [lenX, new THREE.Vector3(0, y, GYM.z0 + 0.01), 0],
        [lenX, new THREE.Vector3(0, y, GYM.z1 - 0.01), Math.PI],
        [lenZ, new THREE.Vector3(GYM.x0 + 0.01, y, (GYM.z0 + GYM.z1) / 2), Math.PI / 2],
        [lenZ, new THREE.Vector3(GYM.x1 - 0.01, y, (GYM.z0 + GYM.z1) / 2), -Math.PI / 2],
      ] as const) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w as number, hh), mat);
        m.position.copy(at as THREE.Vector3);
        m.rotation.y = ry as number;
        out.push(m);
      }
    };
    ring(2.75, 0.5, band);
    ring(3.06, 0.08, gold);
    // the blue wall pads behind each end
    const pad = new THREE.MeshPhysicalMaterial({ color: "#1F3F86", roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color("#6A8AD0") });
    for (const z of [GYM.z0 + 0.04, GYM.z1 - 0.04]) {
      for (let i = 0; i < 6; i++) {
        const p = new THREE.Mesh(new RoundedBox(1.95, 1.9, 0.07), pad);
        p.position.set(-5 + i * 2, 1.05, z);
        p.castShadow = false;
        p.receiveShadow = true;
        out.push(p);
      }
    }
    // high windows down both sides: bright frosted panes in steel frames
    const pane = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.3, 1.38) });
    const frame = new THREE.MeshStandardMaterial({ color: "#3A3F46", roughness: 0.5, metalness: 0.6 });
    for (const x of [GYM.x0 + 0.02, GYM.x1 - 0.02]) {
      for (let i = 0; i < 9; i++) {
        const z = GYM.z0 + 2.2 + i * 3.1;
        const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), pane);
        w.position.set(x, 6.1, z);
        w.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        out.push(w);
        for (const dz of [-1.1, -0.37, 0.37, 1.1]) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), frame);
          m.position.set(x + (x < 0 ? 0.03 : -0.03), 6.1, z + dz);
          out.push(m);
        }
        const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 2.3), frame);
        m2.position.set(x + (x < 0 ? 0.03 : -0.03), 6.1, z);
        out.push(m2);
      }
    }
    // double doors with push bars on the left wall
    const door = new THREE.MeshStandardMaterial({ color: "#5E6E86", roughness: 0.45, metalness: 0.3 });
    const bar = new THREE.MeshStandardMaterial({ color: "#C9CDD3", roughness: 0.25, metalness: 1 });
    for (const zc of [6.5, 16.5]) {
      for (const s of [-1, 1]) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.92), door);
        d.position.set(GYM.x0 + 0.04, 1.1, zc + s * 0.47);
        out.push(d);
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 10), bar);
        b.rotation.x = Math.PI / 2;
        b.position.set(GYM.x0 + 0.12, 1.0, zc + s * 0.47);
        out.push(b);
      }
      const ex = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 0.4) }));
      ex.position.set(GYM.x0 + 0.06, 2.55, zc);
      out.push(ex);
    }
    // the roof deck and its trusses, the lamps
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(lenX, lenZ), new THREE.MeshStandardMaterial({ color: "#8B8F95", roughness: 0.9 }));
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, H, (GYM.z0 + GYM.z1) / 2);
    out.push(roof);
    const steel = new THREE.MeshStandardMaterial({ color: "#2C3138", roughness: 0.55, metalness: 0.5 });
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const z = GYM.z0 + 1.4 + i * 3.4;
      const top = new THREE.BoxGeometry(lenX, 0.16, 0.16);
      top.translate(0, H - 0.25, z);
      parts.push(top);
      const bot = new THREE.BoxGeometry(lenX, 0.12, 0.12);
      bot.translate(0, H - 1.2, z);
      parts.push(bot);
      for (let k = 0; k < 18; k++) {
        const x = GYM.x0 + 0.5 + k;
        const a = new THREE.Vector3(x, H - 1.2, z);
        const b = new THREE.Vector3(x + 0.5, H - 0.25, z);
        const d = b.clone().sub(a);
        const g = new THREE.CylinderGeometry(0.03, 0.03, d.length(), 5);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, z);
        parts.push(g);
      }
    }
    out.push(new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!, steel));
    // high-bay lamps: hanging domes with a bright lens
    const dome = new THREE.MeshStandardMaterial({ color: "#B9BEC4", roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide });
    const lens = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.38, 2.25) });
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 8; j++) {
        const x = -6 + i * 4;
        const z = GYM.z0 + 3 + j * 3.4;
        const d = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.32, 0.36, 24, 1, true), dome);
        d.position.set(x, H - 1.75, z);
        out.push(d);
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), lens);
        l.rotation.x = Math.PI / 2;
        l.position.set(x, H - 1.92, z);
        out.push(l);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.4, 5), steel);
        cord.position.set(x, H - 0.9, z);
        out.push(cord);
      }
    }
    return out;
  }, []);
  return (
    <>
      {objs.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </>
  );
};

class RoundedBox extends THREE.BoxGeometry {
  constructor(w: number, h: number, d: number) {
    super(w, h, d, 6, 6, 1);
    const p = this.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      if (z > 0) {
        // a padded face: bulged in the middle
        const k = (1 - (x / (w / 2)) ** 2) * (1 - (y / (h / 2)) ** 2);
        p.setZ(i, z + 0.02 * k);
      }
    }
    this.computeVertexNormals();
  }
}

/* ------------------------------------------------------------------ */
/* The hoop, the bleachers                                               */
/* ------------------------------------------------------------------ */

const Hoop: React.FC<{ z: number; s: number }> = ({ z, s }) => {
  const objs = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const steel = new THREE.MeshStandardMaterial({ color: "#2C3138", roughness: 0.5, metalness: 0.6 });
    const board = new THREE.MeshPhysicalMaterial({ color: "#E9EEF2", roughness: 0.15, transmission: 0, transparent: true, opacity: 0.55, depthWrite: false });
    const edge = new THREE.MeshStandardMaterial({ color: "#1B1D21", roughness: 0.5 });
    const orange = new THREE.MeshStandardMaterial({ color: "#E8590C", roughness: 0.4, metalness: 0.4 });
    const y = 4.6; // cranked up for the day
    const bz = z + s * 1.25;
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.03), board);
    b.position.set(0, y, bz);
    out.push(b);
    for (const [w, h, dx, dy] of [
      [1.82, 0.05, 0, 0.525],
      [1.82, 0.05, 0, -0.525],
      [0.05, 1.08, 0.9, 0],
      [0.05, 1.08, -0.9, 0],
    ] as const) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), edge);
      e.position.set(dx, y + dy, bz);
      out.push(e);
    }
    // the shooter's square
    for (const [w, h, dx, dy] of [
      [0.59, 0.04, 0, -0.08],
      [0.59, 0.04, 0, -0.5 + 0.03],
      [0.04, 0.45, 0.28, -0.29],
      [0.04, 0.45, -0.28, -0.29],
    ] as const) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), new THREE.MeshStandardMaterial({ color: "#C8102E", roughness: 0.5 }));
      e.position.set(dx, y + dy, bz + s * 0.002);
      out.push(e);
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.01, 8, 40), orange);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, y - 0.45, bz + s * 0.38);
    out.push(rim);
    // the net: cords from the rim down to a narrower ring
    const net = new THREE.MeshStandardMaterial({ color: "#F4F4F4", roughness: 0.8 });
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      for (const tw of [0.35, -0.35]) {
        const p0 = new THREE.Vector3(Math.cos(a) * 0.23, 0, Math.sin(a) * 0.23);
        const p1 = new THREE.Vector3(Math.cos(a + tw) * 0.15, -0.42, Math.sin(a + tw) * 0.15);
        const d = p1.clone().sub(p0);
        const g = new THREE.CylinderGeometry(0.003, 0.003, d.length(), 4);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
        g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
        parts.push(g);
      }
    }
    const n = new THREE.Mesh(mergeGeometries(parts)!, net);
    n.position.set(0, y - 0.45, bz + s * 0.38);
    out.push(n);
    // the frame up to the roof
    for (const dx of [-0.6, 0.6]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, GYM.h - y, 0.08), steel);
      m.position.set(dx, (GYM.h + y) / 2, bz - s * 0.15);
      out.push(m);
    }
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.3), steel);
    arm.position.set(0, GYM.h - 0.6, z + s * 0.6);
    out.push(arm);
    return out;
  }, [z, s]);
  return (
    <>
      {objs.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </>
  );
};

const Bleachers: React.FC = () => {
  const obj = useMemo(() => {
    const wood = new THREE.MeshPhysicalMaterial({ color: "#C9925A", roughness: 0.45, clearcoat: 0.4 });
    const parts: THREE.BufferGeometry[] = [];
    const rows = 7;
    for (let r = 0; r < rows; r++) {
      const seat = new THREE.BoxGeometry(0.42, 0.05, 16);
      seat.translate(GYM.x1 - 0.35 - (rows - 1 - r) * 0.42 * 0.35, 0.42 + r * 0.38, 7.5);
      parts.push(seat);
      const riser = new THREE.BoxGeometry(0.04, 0.38, 16);
      riser.translate(GYM.x1 - 0.55 - (rows - 1 - r) * 0.42 * 0.35, 0.21 + r * 0.38, 7.5);
      parts.push(riser);
    }
    const m = new THREE.Mesh(mergeGeometries(parts)!, wood);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }, []);
  return <primitive object={obj} />;
};

/* ------------------------------------------------------------------ */
/* The photo set                                                         */
/* ------------------------------------------------------------------ */

/** The classic school backdrop: mottled blue-grey, darker at the edges, a little lighter behind the head. */
const backdropTex = () =>
  canvasTex(1024, 1024, (g) => {
    const S = 1024;
    const grad = g.createRadialGradient(S * 0.5, S * 0.42, S * 0.05, S * 0.5, S * 0.5, S * 0.75);
    grad.addColorStop(0, "#8EA6C6");
    grad.addColorStop(0.55, "#5E7699");
    grad.addColorStop(1, "#33445F");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    // mottling: soft blotches of lighter and darker blue, then speckle
    for (let i = 0; i < 900; i++) {
      const x = hash(i * 1.7) * S;
      const y = hash(i * 3.3) * S;
      const r = 20 + hash(i * 5.1) * 110;
      const light = hash(i * 7.9) > 0.5;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, light ? "rgba(190,210,235,0.09)" : "rgba(20,30,55,0.1)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${hash(i) > 0.5 ? "230,240,255" : "10,20,40"},${0.05 + hash(i * 2.3) * 0.06})`;
      g.fillRect(hash(i * 1.1) * S, hash(i * 2.9) * S, 2, 2);
    }
  });

/** The backdrop: a canvas sheet hanging from its crossbar and sweeping out onto the floor. */
const backdropGeometry = () => {
  const W = 2.8;
  const H = 2.75;
  const nx = 24;
  const ny = 40;
  const g = new THREE.PlaneGeometry(W, 1, nx, ny);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const v = p.getY(i) + 0.5; // 0 bottom of the sweep .. 1 the bar
    // arc length 0..1 maps: the top 80% hangs straight, the rest curves out onto the floor
    const s = 1 - v;
    const hang = H - 0.35;
    const len = s * (H + 0.6);
    let y: number;
    let z: number;
    if (len < hang) {
      y = H - len;
      z = 0;
    } else {
      const a = Math.min((len - hang) / 0.55, 1) * (Math.PI / 2);
      y = 0.35 - Math.sin(a) * 0.35;
      z = (1 - Math.cos(a)) * 0.35 + Math.max(0, len - hang - 0.55);
      y = Math.max(0.003, y);
    }
    // gentle folds hanging from the bar
    z += 0.012 * Math.sin(x * 5.3 + 1) * (1 - Math.min(1, len / hang));
    p.setXYZ(i, x, y, z);
    uv.setY(i, 1 - s);
  }
  g.computeVertexNormals();
  return g;
};

const Backdrop: React.FC = () => {
  const objs = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const sheet = new THREE.Mesh(backdropGeometry(), new THREE.MeshStandardMaterial({ map: backdropTex(), roughness: 0.95 }));
    sheet.position.set(0, 0, BACKDROP_Z);
    sheet.receiveShadow = true;
    out.push(sheet);
    const black = new THREE.MeshStandardMaterial({ color: "#16181B", roughness: 0.4, metalness: 0.6 });
    for (const x of [-1.5, 1.5]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 2.85, 10), black);
      pole.position.set(x, 1.42, BACKDROP_Z - 0.05);
      out.push(pole);
      // tripod feet
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.62, 6), black);
        leg.position.set(x + Math.cos(a) * 0.22, 0.22, BACKDROP_Z - 0.05 + Math.sin(a) * 0.22);
        leg.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        out.push(leg);
      }
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 3.1, 10), black);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 2.8, BACKDROP_Z - 0.02);
    out.push(bar);
    return out;
  }, []);
  return (
    <>
      {objs.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </>
  );
};

/** The posing stool: a round black seat on a chrome column, a five-star base on castors. */
export const Stool: React.FC<{ tilt?: number; at?: THREE.Vector3 }> = ({ tilt = 0, at }) => {
  const mats = useMemo(
    () => ({
      seat: new THREE.MeshPhysicalMaterial({ color: "#121316", roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color("#3A3C44") }),
      chrome: new THREE.MeshStandardMaterial({ color: "#D8DCE2", roughness: 0.15, metalness: 1 }),
      base: new THREE.MeshStandardMaterial({ color: "#1E2024", roughness: 0.4, metalness: 0.3 }),
    }),
    [],
  );
  return (
    <group position={at ?? new THREE.Vector3()} rotation={[0, 0, tilt]}>
      <mesh material={mats.seat} position={[0, STOOL_H - 0.045, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.19, 0.08, 40]} />
      </mesh>
      <mesh material={mats.chrome} position={[0, STOOL_H / 2, 0]}>
        <cylinderGeometry args={[0.025, 0.03, STOOL_H - 0.12, 16]} />
      </mesh>
      {/* the footrest: a chrome ring on three spokes */}
      <mesh material={mats.chrome} position={[0, 0.17, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.2, 0.011, 10, 48]} />
      </mesh>
      {[0, 1, 2].map((k) => (
        <mesh key={k} material={mats.chrome} position={[Math.cos((k / 3) * Math.PI * 2) * 0.1, 0.17, Math.sin((k / 3) * Math.PI * 2) * 0.1]} rotation={[0, -(k / 3) * Math.PI * 2, Math.PI / 2]}>
          <cylinderGeometry args={[0.008, 0.008, 0.2, 8]} />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4].map((k) => {
        const a = (k / 5) * Math.PI * 2;
        return (
          <group key={k}>
            <mesh material={mats.base} position={[Math.cos(a) * 0.14, 0.07, Math.sin(a) * 0.14]} rotation={[0, -a, 0]}>
              <boxGeometry args={[0.28, 0.03, 0.04]} />
            </mesh>
            <mesh material={mats.base} position={[Math.cos(a) * 0.27, 0.025, Math.sin(a) * 0.27]}>
              <sphereGeometry args={[0.026, 10, 8]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

/** A softbox: an octagonal white face, a black fabric back, on a light stand. The face lights up on the flash. */
const Softbox: React.FC<{ at: THREE.Vector3; r: number; aim: THREE.Vector3; glow: number }> = ({ at, r, aim, glow }) => {
  const q = useMemo(() => {
    const m = new THREE.Matrix4().lookAt(at, aim, new THREE.Vector3(0, 1, 0));
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }, [at, aim]);
  const mats = useMemo(
    () => ({
      face: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) }),
      back: new THREE.MeshStandardMaterial({ color: "#151619", roughness: 0.85, side: THREE.DoubleSide }),
      metal: new THREE.MeshStandardMaterial({ color: "#1B1C20", roughness: 0.4, metalness: 0.6 }),
    }),
    [],
  );
  // the modelling lamp glows a warm white; the strobe's flash much brighter
  mats.face.color.setRGB(0.95 + 6 * glow, 0.93 + 6 * glow, 0.88 + 6 * glow);
  const back = useMemo(() => new THREE.ConeGeometry(r * 1.05, r * 0.9, 8, 1, true), [r]);
  return (
    <group>
      <group position={at} quaternion={q}>
        {/* the face looks down its -z (toward the subject) */}
        <mesh material={mats.face} rotation={[0, Math.PI, Math.PI / 8]}>
          <circleGeometry args={[r, 8]} />
        </mesh>
        <mesh material={mats.back} geometry={back} position={[0, 0, r * 0.45]} rotation={[-Math.PI / 2, 0, Math.PI / 8]} />
        <mesh material={mats.metal} position={[0, 0, r * 0.95]}>
          <cylinderGeometry args={[0.06, 0.06, 0.12, 12]} />
        </mesh>
      </group>
      {/* the stand */}
      <mesh material={mats.metal} position={[at.x, at.y / 2, at.z + 0.1]}>
        <cylinderGeometry args={[0.014, 0.018, at.y, 8]} />
      </mesh>
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2 + 0.3;
        return (
          <mesh key={k} material={mats.metal} position={[at.x + Math.cos(a) * 0.25, 0.2, at.z + 0.1 + Math.sin(a) * 0.25]} rotation={[Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.62, 6]} />
          </mesh>
        );
      })}
    </group>
  );
};

/** A folding table with a black cloth, the tethered laptop showing the last shot; a bin. */
const SideTable: React.FC = () => {
  const objs = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const cloth = new THREE.MeshStandardMaterial({ color: "#1A1B1E", roughness: 0.95 });
    const t = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.74, 0.7), cloth);
    t.position.set(2.6, 0.37, 1.9);
    t.castShadow = true;
    t.receiveShadow = true;
    out.push(t);
    const lap = new THREE.MeshStandardMaterial({ color: "#A9ADB3", roughness: 0.3, metalness: 0.8 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.24), lap);
    base.position.set(2.5, 0.75, 1.85);
    out.push(base);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.23, 0.012), lap);
    lid.position.set(2.5, 0.86, 1.73);
    lid.rotation.x = -0.25;
    out.push(lid);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.65, 0.85) }));
    screen.position.set(2.5, 0.862, 1.738);
    screen.rotation.x = -0.25;
    out.push(screen);
    // a stack of name cards, a box of combs
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: "#F2EEE4", roughness: 0.9 }));
    card.position.set(2.95, 0.76, 1.95);
    out.push(card);
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.55, 24, 1, true), new THREE.MeshStandardMaterial({ color: "#4B5563", roughness: 0.6, side: THREE.DoubleSide }));
    bin.position.set(1.55, 0.275, 0.55);
    out.push(bin);
    return out;
  }, []);
  return (
    <>
      {objs.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* All of it                                                             */
/* ------------------------------------------------------------------ */

export const Gym: React.FC<{ flash: number; stoolTilt?: number; stoolAt?: THREE.Vector3 }> = ({ flash, stoolTilt = 0, stoolAt }) => {
  const floor = useMemo(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(GYM.x1 - GYM.x0, GYM.z1 - GYM.z0), floorMaterial());
    m.rotation.x = -Math.PI / 2;
    m.position.set((GYM.x0 + GYM.x1) / 2, 0, (GYM.z0 + GYM.z1) / 2);
    m.receiveShadow = true;
    return m;
  }, []);
  const lines = useMemo(() => new THREE.Mesh(courtGeometry(), new THREE.MeshStandardMaterial({ color: "#F4F1EA", roughness: 0.5 })), []);
  const key = useMemo(() => new THREE.Mesh(keyGeometry(), new THREE.MeshPhysicalMaterial({ color: "#7A1F2B", roughness: 0.45, clearcoat: 0.5 })), []);
  return (
    <>
      <primitive object={floor} />
      <primitive object={key} />
      <primitive object={lines} />
      <Walls />
      <Hoop z={GYM.z0} s={1} />
      <Hoop z={GYM.z1} s={-1} />
      <Bleachers />
      <Backdrop />
      <Stool tilt={stoolTilt} at={stoolAt} />
      {SOFTBOX.map((s, i) => (
        <Softbox key={i} at={s.at} r={s.r} aim={FACE} glow={flash} />
      ))}
      <SideTable />
    </>
  );
};
