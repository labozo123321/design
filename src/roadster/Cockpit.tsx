import React, { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Hand, GRIP, OPEN, RELAX, THUMBS_UP, mixHand, type HandPose } from "../coaster/Hand";
import { M, canvasTex, mat } from "./materials";
import { shoulderAt, CANOPY_Z } from "./Roadster";
import type { CarState } from "./path";
import { CUE_W, smooth, smoother, clamp, lerp } from "./timeline";
import { PCUE } from "./path";

/**
 * Inside the Roadster: a carbon tub and suede, the dash low under the gold visor, two small driver-facing
 * screens and the centre touchscreen, the yoke (steer-by-wire), the console with its cupholder, two fixed
 * buckets with harnesses, ambient light lines along the door cards. And the driver: a white race suit,
 * black gloves (two-bone arms from the shoulders to wherever the hands are going), the knees; and his coffee
 * (the surface leaning to the g's; in free fall it rises out of the cup as a wobbling blob and drops back).
 * Car frame (x right, y up, z back).
 */

export const EYE = new THREE.Vector3(-0.36, 0.98, 0.1);
export const YOKE_C = new THREE.Vector3(-0.36, 0.665, -0.43);
const YOKE_TILT = -0.42; // the yoke's plane leans back toward him
export const CUP_AT = new THREE.Vector3(0.0, 0.455, -0.3); // the cup's base, in its holder
const CUP_H = 0.105;
const CUP_R0 = 0.029;
const CUP_R1 = 0.041;
const SHOULDER_L = new THREE.Vector3(-0.565, 0.75, 0.24);
const SHOULDER_R = new THREE.Vector3(-0.155, 0.75, 0.24);
const UPPER = 0.3;
const FORE = 0.29;

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------- materials
const suit = () => mat("suit", () => new THREE.MeshPhysicalMaterial({ color: "#2B2E34", roughness: 0.78, sheen: 0.7, sheenColor: new THREE.Color("#8E98A8") }));
const suitStripe = () => mat("suitStripe", () => new THREE.MeshStandardMaterial({ color: "#E9ECEF", roughness: 0.6 }));
const goldTrim = () => mat("goldTrim", () => new THREE.MeshPhysicalMaterial({ color: "#C9A24A", metalness: 0.7, roughness: 0.32, clearcoat: 0.6 }));
export const glove = () => mat("glove", () => new THREE.MeshPhysicalMaterial({ color: "#232429", roughness: 0.6, sheen: 0.35, sheenColor: new THREE.Color("#5A6270") }));
const paper = () => mat("cup", () => new THREE.MeshStandardMaterial({ color: "#F4F1EA", roughness: 0.85 }));
const sleeve = () => mat("cupSleeve", () => new THREE.MeshStandardMaterial({ color: "#8E6A45", roughness: 0.95 }));
export const coffee = () =>
  mat("coffee", () => new THREE.MeshPhysicalMaterial({ color: "#3A1D0C", roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.8, sheen: 0.4, sheenColor: new THREE.Color("#8A4A20") }));
const ambient = (k: number) => M.light("ambient", "#9FC8FF", 1.1 * k);

// --------------------------------------------------------------------------------------- the screens
type ScreenState = { st: CarState; w: number; boot: number };

const drawSpeed = (g: CanvasRenderingContext2D, w: number, h: number, s: ScreenState) => {
  g.fillStyle = "#020305";
  g.fillRect(0, 0, w, h);
  if (s.boot <= 0) return;
  g.globalAlpha = s.boot;
  const mph = s.st.speed * 2.23694;
  // the arc
  const cx = w * 0.5;
  const cy = h * 0.78;
  const R = h * 0.62;
  g.lineWidth = 7;
  g.strokeStyle = "#1A2230";
  g.beginPath();
  g.arc(cx, cy, R, Math.PI * 1.1, Math.PI * 1.9);
  g.stroke();
  const k = Math.min(1, mph / 120);
  g.strokeStyle = "#E8F2FF";
  g.beginPath();
  g.arc(cx, cy, R, Math.PI * 1.1, Math.PI * (1.1 + 0.8 * k));
  g.stroke();
  g.fillStyle = "#F4F8FF";
  g.font = `600 ${Math.round(h * 0.42)}px Montserrat, Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillText(String(Math.round(mph)), cx, h * 0.7);
  g.font = `600 ${Math.round(h * 0.1)}px Montserrat, Arial, sans-serif`;
  g.fillStyle = "#7F8A9C";
  g.fillText("MPH", cx, h * 0.85);
  // 0-60: the time, once it's done
  const t60 = CUE_W["0to60"];
  if (s.w >= t60 && s.w < t60 + 4.5) {
    g.fillStyle = "#FFD27A";
    g.font = `700 ${Math.round(h * 0.13)}px Montserrat, Arial, sans-serif`;
    g.fillText("0-60  0.81 s", cx, h * 0.98);
  }
  g.globalAlpha = 1;
};

const drawThrust = (g: CanvasRenderingContext2D, w: number, h: number, s: ScreenState) => {
  g.fillStyle = "#020305";
  g.fillRect(0, 0, w, h);
  if (s.boot <= 0) return;
  g.globalAlpha = s.boot;
  // the ten thrusters round a little car, lit when they fire
  const cx = w * 0.3;
  const cy = h * 0.52;
  g.strokeStyle = "#5F6B7E";
  g.lineWidth = 3;
  g.strokeRect(cx - w * 0.07, cy - h * 0.34, w * 0.14, h * 0.68);
  const spots: [number, number][] = [
    [-0.045, 0.36],
    [-0.015, 0.36],
    [0.015, 0.36],
    [0.045, 0.36],
    [-0.08, -0.3],
    [0.08, -0.3],
    [-0.08, 0.3],
    [0.08, 0.3],
    [-0.09, 0.0],
    [0.09, 0.0],
  ];
  spots.forEach(([x, y], i) => {
    const on = s.st.thr[i];
    g.fillStyle = on > 0.05 ? `rgba(160,220,255,${0.4 + 0.6 * on})` : "#253040";
    g.beginPath();
    g.arc(cx + x * w, cy + y * h, h * 0.05 * (1 + on * 0.6), 0, Math.PI * 2);
    g.fill();
  });
  // the altitude (in the air), else the g-meter
  const alt = s.st.alt * 3.28084;
  g.textAlign = "center";
  if (alt > 0.6) {
    g.fillStyle = "#7F8A9C";
    g.font = `600 ${Math.round(h * 0.11)}px Montserrat, Arial, sans-serif`;
    g.fillText("ALTITUDE", w * 0.72, h * 0.3);
    g.fillStyle = "#F4F8FF";
    g.font = `600 ${Math.round(h * 0.34)}px Montserrat, Arial, sans-serif`;
    g.fillText(alt.toFixed(1), w * 0.72, h * 0.68);
    g.fillStyle = "#7F8A9C";
    g.font = `600 ${Math.round(h * 0.1)}px Montserrat, Arial, sans-serif`;
    g.fillText("FT", w * 0.72, h * 0.86);
  } else {
    const gx = w * 0.72;
    const gy = h * 0.5;
    const r = h * 0.34;
    g.strokeStyle = "#2B3546";
    g.lineWidth = 3;
    for (const rr of [r, r * 0.5]) {
      g.beginPath();
      g.arc(gx, gy, rr, 0, Math.PI * 2);
      g.stroke();
    }
    const fx = clamp(-s.st.f.x / 30, -1, 1);
    const fz = clamp(s.st.f.z / 30, -1, 1);
    g.fillStyle = "#FFD27A";
    g.beginPath();
    g.arc(gx + fx * r, gy - fz * r, h * 0.06, 0, Math.PI * 2);
    g.fill();
    const gs = Math.hypot(s.st.f.x, s.st.f.z) / 9.81;
    g.fillStyle = "#F4F8FF";
    g.font = `600 ${Math.round(h * 0.12)}px Montserrat, Arial, sans-serif`;
    g.fillText(`${gs.toFixed(1)} g`, gx, h * 0.98);
  }
  g.globalAlpha = 1;
};

/** The centre screen: the car from above (its wings, its thrusters) on boot; and when somebody else is
 * driving, a little game controller. */
const drawCentre = (g: CanvasRenderingContext2D, w: number, h: number, s: ScreenState, remote: number) => {
  g.fillStyle = "#03050A";
  g.fillRect(0, 0, w, h);
  if (s.boot <= 0) return;
  g.globalAlpha = s.boot;
  // a soft gradient
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0B1220");
  grad.addColorStop(1, "#03050A");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // the car from above
  const cx = w * 0.5;
  const cy = h * 0.5;
  const sc = h * 0.38;
  g.save();
  g.translate(cx, cy);
  g.rotate(-Math.PI / 2);
  g.strokeStyle = "#DDE6F2";
  g.lineWidth = 3;
  g.beginPath();
  const body: [number, number][] = [
    [-1, -0.36],
    [-0.8, -0.46],
    [0.8, -0.47],
    [1, -0.4],
    [1, 0.4],
    [0.8, 0.47],
    [-0.8, 0.46],
    [-1, 0.36],
  ];
  body.forEach(([x, y], i) => (i ? g.lineTo(x * sc, y * sc) : g.moveTo(x * sc, y * sc)));
  g.closePath();
  g.stroke();
  // canopy
  g.strokeStyle = "#C9A24A";
  g.strokeRect(-0.45 * sc, -0.3 * sc, 0.75 * sc, 0.6 * sc);
  // wing
  const wing = s.st.wing;
  if (wing > 0.02) {
    g.fillStyle = `rgba(255,210,122,${wing})`;
    g.fillRect(0.82 * sc, -0.42 * sc, 0.08 * sc, 0.84 * sc);
  }
  g.restore();
  // the boot sweep
  if (s.boot < 1) {
    g.fillStyle = `rgba(200,225,255,${0.35 * (1 - s.boot)})`;
    g.fillRect(0, h * (1 - s.boot) - 6, w, 12);
  }
  // somebody else driving: a game controller
  if (remote > 0) {
    g.globalAlpha = s.boot * remote;
    g.fillStyle = "rgba(3,5,10,0.82)";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#F4F8FF";
    g.lineWidth = 6;
    const pw = w * 0.34;
    const ph = h * 0.32;
    const px = w * 0.5 - pw / 2;
    const py = h * 0.48 - ph / 2;
    g.beginPath();
    g.moveTo(px + pw * 0.2, py);
    g.lineTo(px + pw * 0.8, py);
    g.quadraticCurveTo(px + pw * 1.05, py, px + pw, py + ph * 0.85);
    g.quadraticCurveTo(px + pw * 0.95, py + ph * 1.1, px + pw * 0.75, py + ph * 0.75);
    g.lineTo(px + pw * 0.25, py + ph * 0.75);
    g.quadraticCurveTo(px + pw * 0.05, py + ph * 1.1, px, py + ph * 0.85);
    g.quadraticCurveTo(px - pw * 0.05, py, px + pw * 0.2, py);
    g.stroke();
    // the cross and the buttons
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(px + pw * 0.2, py + ph * 0.38);
    g.lineTo(px + pw * 0.36, py + ph * 0.38);
    g.moveTo(px + pw * 0.28, py + ph * 0.24);
    g.lineTo(px + pw * 0.28, py + ph * 0.52);
    g.stroke();
    g.fillStyle = "#F4F8FF";
    for (const [bx, by] of [
      [0.7, 0.26],
      [0.78, 0.38],
      [0.62, 0.38],
      [0.7, 0.5],
    ]) {
      g.beginPath();
      g.arc(px + pw * bx, py + ph * by, h * 0.018, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
};

const useScreen = (key: string, w: number, h: number) =>
  useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: true });
    m.color.setScalar(1.35);
    return { c, g: c.getContext("2d")!, t, m, key };
  }, [key, w, h]);

// ----------------------------------------------------------------------------------- the static tub
const doorCardGeo = (side: number) => {
  const v: number[] = [];
  const zs: number[] = [];
  for (let z = CANOPY_Z[0] + 0.03; z <= CANOPY_Z[1] - 0.02; z += 0.1) zs.push(z);
  zs.push(CANOPY_Z[1] - 0.02);
  const pts = zs.map((z) => {
    const [sx, sy] = shoulderAt(z);
    return { z, top: V3(side * (sx - 0.075), sy - 0.012, z), bot: V3(side * (sx - 0.13), 0.18, z) };
  });
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const quad = side > 0 ? [a.bot, b.bot, b.top, a.top] : [a.bot, a.top, b.top, b.bot];
    v.push(...quad[0].toArray(), ...quad[1].toArray(), ...quad[2].toArray(), ...quad[0].toArray(), ...quad[2].toArray(), ...quad[3].toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return { geo: g, line: new THREE.CatmullRomCurve3(pts.map((p) => p.top.clone().add(V3(-side * 0.01, -0.1, 0)))) };
};

const dashGeo = () => {
  // the dash's side profile (z, y), extruded across
  const s = new THREE.Shape();
  const P: [number, number][] = [
    [-1.04, 0.745],
    [-0.7, 0.738],
    [-0.645, 0.718],
    [-0.62, 0.66],
    [-0.63, 0.55],
    [-0.72, 0.47],
    [-1.04, 0.44],
  ];
  P.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
  // shape is in (x=z, y=y); extruded along +z -> rotate so the extrusion runs along x
  g.rotateY(Math.PI / 2);
  g.translate(-0.8, 0, 0);
  return g;
};

const seatGeos = () => {
  const cushion = new RoundedBoxGeometry(0.44, 0.08, 0.46, 4, 0.03);
  const back = new RoundedBoxGeometry(0.46, 0.68, 0.07, 4, 0.03);
  const bolster = new RoundedBoxGeometry(0.07, 0.5, 0.12, 4, 0.03);
  const thighB = new RoundedBoxGeometry(0.06, 0.07, 0.4, 4, 0.025);
  const shell = new RoundedBoxGeometry(0.5, 0.74, 0.03, 4, 0.012);
  return { cushion, back, bolster, thighB, shell };
};

const Seat: React.FC<{ x: number; harness?: boolean }> = ({ x, harness }) => {
  const g = useMemo(seatGeos, []);
  return (
    <group position={[x, 0.2, 0.3]}>
      <mesh geometry={g.cushion} material={M.suede()} position={[0, 0.06, -0.12]} />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={g.thighB} material={M.carbon()} position={[s * 0.22, 0.1, -0.12]} />
      ))}
      <group position={[0, 0.08, 0.14]} rotation={[-0.3, 0, 0]}>
        <mesh geometry={g.back} material={M.suede()} position={[0, 0.36, 0]} />
        <mesh geometry={g.shell} material={M.carbon()} position={[0, 0.38, 0.05]} />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={g.bolster} material={M.carbon()} position={[s * 0.235, 0.28, -0.03]} rotation={[0, -s * 0.35, 0]} />
        ))}
        {/* the gold stripe and the harness slots */}
        <mesh material={goldTrim()} position={[0, 0.36, -0.037]} scale={[0.012, 0.6, 0.004]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
        {harness
          ? [-1, 1].map((s) => (
              <mesh key={`h${s}`} material={mat("harness", () => new THREE.MeshStandardMaterial({ color: "#B3242A", roughness: 0.8 }))} position={[s * 0.09, 0.35, -0.045]} rotation={[0, 0, s * 0.08]} scale={[0.05, 0.5, 0.006]}>
                <boxGeometry args={[1, 1, 1]} />
              </mesh>
            ))
          : null}
      </group>
    </group>
  );
};

/** The yoke on its column: a slim carbon bar and hub, suede grips, titanium paddles, two scroll wheels and
 * one small red button. */
const Yoke: React.FC<{ turn: number }> = ({ turn }) => {
  const g = useMemo(() => {
    const hub = new RoundedBoxGeometry(0.1, 0.05, 0.03, 4, 0.012);
    const bar = new RoundedBoxGeometry(0.3, 0.022, 0.026, 4, 0.009);
    const grip = new THREE.CapsuleGeometry(0.019, 0.11, 6, 16);
    const paddle = new RoundedBoxGeometry(0.05, 0.075, 0.006, 3, 0.003);
    const col = new THREE.CylinderGeometry(0.026, 0.034, 0.22, 16);
    col.rotateX(Math.PI / 2);
    const wheel = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 18);
    wheel.rotateZ(Math.PI / 2);
    return { hub, bar, grip, paddle, col, wheel };
  }, []);
  return (
    <group position={YOKE_C} rotation={[YOKE_TILT, 0, 0]}>
      <mesh geometry={g.col} material={M.gloss()} position={[0, 0, -0.12]} />
      <group rotation={[0, 0, turn]}>
        <mesh geometry={g.hub} material={M.gloss()} />
        <mesh geometry={g.bar} material={M.carbon()} position={[0, -0.008, 0]} />
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.165, 0.014, 0]} rotation={[0, 0, -s * 0.16]}>
            <mesh geometry={g.grip} material={M.suede()} />
            <mesh geometry={g.paddle} material={M.titanium()} position={[-s * 0.028, 0.045, -0.032]} />
            <mesh geometry={g.wheel} material={M.titanium()} position={[-s * 0.03, 0.03, 0.02]} />
          </group>
        ))}
        <mesh material={M.light("yokeBtn", "#FF3B30", 0.9)} position={[0.028, 0.008, 0.0155]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.003, 16]} />
        </mesh>
        <mesh material={goldTrim()} position={[0, -0.022, 0.014]} scale={[0.04, 0.003, 0.003]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      </group>
    </group>
  );
};

/** The grips' places in the car frame (where the wrists go), turned with the yoke. */
const gripAt = (side: number, turn: number) => {
  const local = V3(side * 0.17, -0.03, 0.035).applyAxisAngle(V3(0, 0, 1), turn);
  return local.applyAxisAngle(V3(1, 0, 0), YOKE_TILT).add(YOKE_C);
};

// ------------------------------------------------------------------------------------------ the coffee
/** A paper cup and its coffee (cup space: the base at the origin). */
export const Cup: React.FC<{ tilt: [number, number]; float: number; t: number; splash: number; level?: number }> = ({ tilt, float, t, splash, level = 1 }) => {
  const g = useMemo(() => {
    const prof: THREE.Vector2[] = [];
    const n = 12;
    for (let i = 0; i <= n; i++) prof.push(new THREE.Vector2(CUP_R0 + (CUP_R1 - CUP_R0) * (i / n), (i / n) * CUP_H));
    const cup = new THREE.LatheGeometry(prof, 40);
    const inner = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x - 0.0012, p.y)).reverse(), 40);
    const bottom = new THREE.CircleGeometry(CUP_R0, 32);
    bottom.rotateX(-Math.PI / 2);
    const rim = new THREE.TorusGeometry(CUP_R1, 0.0022, 8, 40);
    rim.rotateX(Math.PI / 2);
    const band: THREE.Vector2[] = [];
    for (let i = 0; i <= 4; i++) {
      const y = 0.032 + (i / 4) * 0.045;
      band.push(new THREE.Vector2(CUP_R0 + (CUP_R1 - CUP_R0) * (y / CUP_H) + 0.0016, y));
    }
    const sleeveG = new THREE.LatheGeometry(band, 40);
    const surf = new THREE.CircleGeometry(1, 40);
    surf.rotateX(-Math.PI / 2);
    const blob = new THREE.SphereGeometry(1, 28, 20);
    return { cup, inner, bottom, rim, sleeveG, surf, blob };
  }, []);
  // the level drops as the blob takes the coffee out
  const out = clamp(float / 0.025);
  const lvl = (0.084 - 0.03 * out) * level;
  const rAt = (y: number) => CUP_R0 + (CUP_R1 - CUP_R0) * (y / CUP_H);
  const lean = Math.hypot(tilt[0], tilt[1]);
  const surfR = rAt(lvl) * Math.cos(Math.min(1.2, lean)) * 0.985;
  // the floating blob: wobbling, with a few droplets drifting round it
  const blobY = CUP_H + float - 0.012;
  const wob = (k: number, f: number) => 1 + k * Math.sin(t * f);
  const blobR = 0.036 * Math.cbrt(out);
  // the landing's splash: a crown of drops thrown up and out, falling back under the thrusters' g
  const crown: THREE.Vector3[] = [];
  if (splash > 0 && splash < 0.4) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.3;
      const v0 = 0.55 + 0.25 * Math.sin(i * 2.3);
      const up = 0.9 + 0.3 * Math.cos(i * 1.7);
      const tt = splash;
      crown.push(V3(Math.cos(a) * (CUP_R1 * 0.8 + v0 * 0.35 * tt), CUP_H - 0.01 + up * tt - 0.5 * 15.8 * tt * tt * 0.9, Math.sin(a) * (CUP_R1 * 0.8 + v0 * 0.35 * tt)));
    }
  }
  return (
    <group>
      <mesh geometry={g.cup} material={paper()} />
      <mesh geometry={g.inner} material={mat("cupIn", () => new THREE.MeshStandardMaterial({ color: "#E8E2D6", roughness: 0.9, side: THREE.BackSide }))} />
      <mesh geometry={g.bottom} material={paper()} />
      <mesh geometry={g.rim} material={paper()} position={[0, CUP_H, 0]} />
      <mesh geometry={g.sleeveG} material={sleeve()} />
      {lvl > 0.005 ? <mesh geometry={g.surf} material={coffee()} position={[0, lvl, 0]} rotation={[-tilt[1], 0, tilt[0]]} scale={[surfR, 1, surfR]} /> : null}
      {blobR > 0.002 ? (
        <group position={[0.002 * Math.sin(t * 2.1), blobY, 0.003 * Math.cos(t * 1.7)]} rotation={[t * 0.9, t * 0.6, 0]}>
          <mesh geometry={g.blob} material={coffee()} scale={[blobR * wob(0.13, 7.3), blobR * wob(-0.11, 6.1), blobR * wob(0.08, 5.2)]} />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = t * (0.6 + 0.15 * i) + i * 1.9;
            const r = 0.048 + 0.012 * Math.sin(i * 3.1);
            const k = clamp((float - 0.01 * (1 + (i % 3))) / 0.02);
            if (k <= 0) return null;
            return <mesh key={i} geometry={g.blob} material={coffee()} position={[Math.cos(a) * r, 0.012 * Math.sin(a * 1.3 + i), Math.sin(a) * r]} scale={(0.0035 + 0.0012 * (i % 3)) * k} />;
          })}
        </group>
      ) : null}
      {crown.map((p, i) => (
        <mesh key={i} geometry={g.blob} material={coffee()} position={p} scale={0.0032 + 0.0012 * (i % 3)} />
      ))}
    </group>
  );
};

// -------------------------------------------------------------------------------------- the driver
/** Two-bone IK: the elbow from the shoulder, the wrist target and a pole (which way the elbow points). */
const ik = (sh: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3) => {
  const d = target.clone().sub(sh);
  const len = Math.min(d.length(), UPPER + FORE - 0.002);
  const dir = d.clone().normalize();
  const a = (UPPER * UPPER + len * len - FORE * FORE) / (2 * UPPER * len);
  const along = UPPER * a;
  const perp = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbow = sh.clone().add(dir.clone().multiplyScalar(along)).add(p.multiplyScalar(perp));
  const wrist = sh.clone().add(dir.multiplyScalar(len));
  return { elbow, wrist };
};

const limbGeo = (r0: number, r1: number) => {
  const g = new THREE.CylinderGeometry(r1, r0, 1, 18, 1);
  g.translate(0, 0.5, 0);
  return g;
};

const Limb: React.FC<{ a: THREE.Vector3; b: THREE.Vector3; r0: number; r1: number; m: THREE.Material; stripe?: boolean }> = ({ a, b, r0, r1, m, stripe }) => {
  const geo = useMemo(() => limbGeo(r0, r1), [r0, r1]);
  const d = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
  return (
    <group position={a} quaternion={q}>
      <mesh geometry={geo} material={m} scale={[1, d.length(), 1]} />
      {stripe ? (
        <mesh material={suitStripe()} position={[r0 * 0.96, d.length() / 2, 0]} scale={[0.004, d.length() * 0.96, 0.012]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ) : null}
    </group>
  );
};

export type HandGoal = { at: THREE.Vector3; fingers: THREE.Vector3; palm: THREE.Vector3; pose: HandPose };

/** An arm from its shoulder to a hand goal: the sleeve, the elbow, the glove (side 1 right, -1 left). */
export const Arm: React.FC<{ sh: THREE.Vector3; goal: HandGoal; side: number; pole: THREE.Vector3 }> = ({ sh, goal, side, pole }) => {
  const { elbow, wrist } = ik(sh, goal.at, pole);
  // the hand's frame: fingers along -y, palm toward +z (mirrored for the left)
  const fy = goal.fingers.clone().normalize().negate();
  let pz = goal.palm.clone().sub(fy.clone().multiplyScalar(goal.palm.dot(fy))).normalize();
  if (!Number.isFinite(pz.x)) pz = V3(0, 0, 1);
  const px = new THREE.Vector3().crossVectors(fy, pz).normalize();
  const m = new THREE.Matrix4().makeBasis(px, fy, pz);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return (
    <group>
      <Limb a={sh} b={elbow} r0={0.05} r1={0.043} m={suit()} stripe />
      <mesh position={elbow} material={suit()} scale={0.044}>
        <sphereGeometry args={[1, 16, 12]} />
      </mesh>
      <Limb a={elbow} b={wrist} r0={0.041} r1={0.033} m={suit()} stripe />
      {/* the glove's cuff over the sleeve */}
      <Limb a={wrist.clone().lerp(elbow, 0.2)} b={wrist.clone().lerp(elbow, -0.02)} r0={0.038} r1={0.036} m={mat("cuff", () => new THREE.MeshStandardMaterial({ color: "#121316", roughness: 0.7 }))} />
      <group position={wrist} quaternion={q}>
        <Hand pose={goal.pose} tone="#C99470" side={side} scale={1.05} mat={glove()} />
      </group>
    </group>
  );
};

const lerpGoal = (a: HandGoal, b: HandGoal, k: number): HandGoal => ({
  at: a.at.clone().lerp(b.at, k),
  fingers: a.fingers.clone().lerp(b.fingers, k).normalize(),
  palm: a.palm.clone().lerp(b.palm, k).normalize(),
  pose: mixHand(a.pose, b.pose, k),
});


/** The right hand's goals in the car frame over world time (the cup in, the yoke, the hand over the cup,
 * the wave, the thumbs-up). */
export const handGoals = (w: number, turn: number) => {
  const gripR: HandGoal = { at: gripAt(1, turn), fingers: V3(-0.25, -0.35, -1).applyAxisAngle(V3(0, 0, 1), turn), palm: V3(-1, 0.1, 0.1), pose: GRIP };
  const gripL: HandGoal = { at: gripAt(-1, turn), fingers: V3(0.25, -0.35, -1).applyAxisAngle(V3(0, 0, 1), turn), palm: V3(1, 0.1, 0.1), pose: GRIP };
  const lap: HandGoal = { at: EYE.clone().add(V3(0.2, -0.36, -0.28)), fingers: V3(-0.3, 0.1, -1), palm: V3(-1, 0.2, 0), pose: mixHand(GRIP, RELAX, 0.2) };
  const overCup: HandGoal = { at: CUP_AT.clone().add(V3(0.035, 0.105, 0.075)), fingers: V3(-0.25, -0.05, -1), palm: V3(-1, 0, 0), pose: mixHand(GRIP, RELAX, 0.15) };
  const inHolder: HandGoal = { at: CUP_AT.clone().add(V3(0.04, 0.05, 0.07)), fingers: V3(-0.25, -0.05, -1), palm: V3(-1, 0, 0), pose: mixHand(GRIP, RELAX, 0.15) };
  const letGo: HandGoal = { at: CUP_AT.clone().add(V3(0.07, 0.09, 0.09)), fingers: V3(-0.2, -0.2, -1), palm: V3(-1, 0.3, 0), pose: OPEN };
  const lid: HandGoal = { at: CUP_AT.clone().add(V3(0.0, 0.122, 0.105)), fingers: V3(0, -0.12, -1), palm: V3(0, -1, 0), pose: mixHand(RELAX, OPEN, 0.3) };
  // upside down, the coffee floating: his hand hovers by it, ready to catch it
  const hover: HandGoal = { at: CUP_AT.clone().add(V3(0.085, 0.13, 0.11)), fingers: V3(-0.35, 0.35, -1), palm: V3(-1, 0.15, -0.2), pose: mixHand(OPEN, RELAX, 0.35) };
  const wave: HandGoal = { at: EYE.clone().add(V3(0.22, -0.02, -0.38)), fingers: V3(0.1, 1, -0.15), palm: V3(0, 0, -1), pose: OPEN };
  const waveL: HandGoal = { at: EYE.clone().add(V3(-0.26, -0.03, -0.36)), fingers: V3(-0.1, 1, -0.15), palm: V3(0, 0, -1), pose: OPEN };
  const huh: HandGoal = { at: EYE.clone().add(V3(0.16, -0.4, -0.36)), fingers: V3(-0.2, 0, -1), palm: V3(0, 1, 0), pose: OPEN };
  const huhL: HandGoal = { at: EYE.clone().add(V3(-0.2, -0.42, -0.34)), fingers: V3(0.2, 0, -1), palm: V3(0, 1, 0), pose: OPEN };
  const yawT = THREE.MathUtils.degToRad(30);
  const thumb: HandGoal = { at: EYE.clone().add(V3(0.04, -0.2, -0.42).applyAxisAngle(V3(0, 1, 0), yawT)), fingers: V3(-1, 0, -0.25).applyAxisAngle(V3(0, 1, 0), yawT), palm: V3(0, 0, 1).applyAxisAngle(V3(0, 1, 0), yawT), pose: THUMBS_UP };
  const T = CUE_W;
  const stop2 = PCUE.stop2;
  const creep0 = PCUE.creep0;
  const seq = (keys: [number, HandGoal][]) => {
    if (w <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [ta, ga] = keys[i];
      const [tb, gb] = keys[i + 1];
      if (w <= tb) return lerpGoal(ga, gb, smoother((w - ta) / (tb - ta)));
    }
    return keys[keys.length - 1][1];
  };
  const right = seq([
    [T.seated, lap],
    [T.cup0, lap],
    [T.cup0 + 0.55, overCup],
    [T.cup0 + 0.8, inHolder],
    [T.cup0 + 0.95, inHolder],
    [T.cup0 + 1.15, letGo],
    [T.cup1 + 0.05, gripR],
    [T.release + 0.2, gripR],
    [T.release + 0.75, hover],
    [T.splashes[0] + 0.1, hover],
    [T.splashes[0] + 0.7, gripR],
    [40.0, gripR],
    [T.cover - 0.45, gripR],
    [T.cover, lid],
    [stop2 + 1.6, lid],
    [stop2 + 2.2, gripR],
    [stop2 + 3.2, gripR],
    [stop2 + 3.7, wave],
    [creep0 + 0.2, wave],
    [creep0 + 0.8, huh],
    [creep0 + 3.8, huh],
    [creep0 + 4.4, thumb],
    [creep0 + 9, thumb],
  ]);
  const left = seq([
    [T.seated, { ...gripL, at: EYE.clone().add(V3(-0.2, -0.5, -0.2)), pose: RELAX }],
    [T.seated + 0.6, gripL],
    [stop2 + 3.2, gripL],
    [stop2 + 3.7, waveL],
    [creep0 + 0.2, waveL],
    [creep0 + 0.8, huhL],
    [creep0 + 9, huhL],
  ]);
  // the wave: the open hands rock side to side
  const wv = smooth(stop2 + 3.6, stop2 + 3.9, w) * (1 - smooth(creep0 + 0.1, creep0 + 0.4, w));
  if (wv > 0) {
    const s = Math.sin((w - stop2) * 9);
    right.at.add(V3(0.04 * s * wv, 0, 0));
    left.at.add(V3(-0.04 * s * wv, 0, 0));
  }
  // the cup: in the hand until it's in the holder
  const cupInHand = w < T.cup0 + 0.95;
  return { right, left, cupInHand };
};

/** The driver from the shoulders down (his arms, his knees, his harness); the head is the camera. */
export const Driver: React.FC<{ w: number; turn: number; body?: boolean }> = ({ w, turn, body = true }) => {
  const { right, left } = handGoals(w, turn);
  const torso = useMemo(() => new RoundedBoxGeometry(0.42, 0.5, 0.24, 5, 0.09), []);
  return (
    <group>
      <Arm sh={SHOULDER_R} goal={right} side={1} pole={V3(0.5, -1, 0.3)} />
      <Arm sh={SHOULDER_L} goal={left} side={-1} pole={V3(-0.5, -1, 0.3)} />
      {body ? (
        <>
          <mesh geometry={torso} material={suit()} position={[-0.36, 0.52, 0.32]} rotation={[-0.32, 0, 0]} />
          {/* harness over the shoulders to the buckle */}
          {[-1, 1].map((s) => (
            <mesh key={s} material={mat("harness", () => new THREE.MeshStandardMaterial({ color: "#B3242A", roughness: 0.8 }))} position={[-0.36 + s * 0.085, 0.6, 0.19]} rotation={[-0.32, 0, s * 0.12]} scale={[0.05, 0.42, 0.008]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
          ))}
          <mesh material={M.steel()} position={[-0.36, 0.4, 0.15]} rotation={[-0.32, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.012, 20]} />
          </mesh>
        </>
      ) : null}
    </group>
  );
};

// ----------------------------------------------------------------------------------- the cockpit
export const Cockpit: React.FC<{ st: CarState; w: number; driver?: boolean; screens?: boolean; t?: number }> = ({ st, w, driver = true, screens = true }) => {
  const dash = useMemo(dashGeo, []);
  const doorL = useMemo(() => doorCardGeo(-1), []);
  const doorR = useMemo(() => doorCardGeo(1), []);
  const lineGeos = useMemo(() => [doorL.line, doorR.line].map((c) => new THREE.TubeGeometry(c, 40, 0.0022, 5, false)), [doorL, doorR]);
  const sL = useScreen("spd", 256, 128);
  const sR = useScreen("thr", 256, 128);
  const sC = useScreen("ctr", 512, 320);
  const boot = smooth(CUE_W.boot, CUE_W.boot + 0.8, w) * (w > 39 ? 1 : 1);
  const remote = smooth(PCUE.creep0 - 0.2, PCUE.creep0 + 0.3, w);
  if (screens) {
    const ss = { st, w, boot };
    drawSpeed(sL.g, 256, 128, ss);
    drawThrust(sR.g, 256, 128, ss);
    drawCentre(sC.g, 512, 320, ss, remote);
    sL.t.needsUpdate = true;
    sR.t.needsUpdate = true;
    sC.t.needsUpdate = true;
  }
  // the yoke follows the steering; on the creep it turns by itself
  const turn = st.steer * 1.4;
  const { cupInHand } = handGoals(w, turn);
  const cupSplash = (() => {
    for (const s of CUE_W.splashes ?? []) if (w >= s && w < s + 0.45) return w - s;
    return 0;
  })();
  const amb = boot;
  // the cup: in his right hand until it's in the holder
  let cupM: THREE.Matrix4 | null = null;
  if (cupInHand) {
    const { right } = handGoals(w, turn);
    const fy = right.fingers.clone().normalize().negate();
    let pz = right.palm.clone().sub(fy.clone().multiplyScalar(right.palm.dot(fy))).normalize();
    if (!Number.isFinite(pz.x)) pz = V3(0, 0, 1);
    const px = new THREE.Vector3().crossVectors(fy, pz).normalize();
    // the cup sits in the curled fingers: upright, just past the palm
    const holdAt = right.at.clone().add(fy.clone().multiplyScalar(0.06)).add(pz.clone().multiplyScalar(0.045)).add(V3(0, -0.05, 0));
    void px;
    cupM = new THREE.Matrix4().makeTranslation(holdAt.x, holdAt.y, holdAt.z);
    // ease into the holder over the last stretch
    const k = smooth(CUE_W.cup0 + 0.55, CUE_W.cup0 + 0.8, w);
    if (k > 0) {
      const p = holdAt.clone().lerp(CUP_AT, k);
      cupM = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
    }
  }
  return (
    <group>
      {/* the screens' glow: a soft cool light over the console, the yoke and his hands */}
      <pointLight position={[-0.18, 1.07, -0.22]} color="#D6E4FF" intensity={0.4 * boot} distance={2.2} decay={2} />
      {/* the cupholder's light ring, glowing up round the cup */}
      <mesh material={M.light("cupRing", "#9FC8FF", 2.2 * boot)} position={[CUP_AT.x, CUP_AT.y + 0.006, CUP_AT.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.044, 0.05, 40]} />
      </mesh>
      <pointLight position={[CUP_AT.x, CUP_AT.y + 0.05, CUP_AT.z + 0.07]} color="#9FC8FF" intensity={0.05 * boot} distance={0.6} decay={2} />
      {/* the tub */}
      <mesh material={M.carbon()} position={[0, 0.165, -0.24]} scale={[1.62, 0.02, 1.58]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh geometry={doorL.geo} material={M.suede()} />
      <mesh geometry={doorR.geo} material={M.suede()} />
      {lineGeos.map((g, i) => (
        <mesh key={i} geometry={g} material={ambient(amb)} />
      ))}
      <mesh material={M.gloss()} position={[0, 0.48, 0.555]} scale={[1.62, 0.64, 0.02]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {/* the dash */}
      <mesh geometry={dash} material={M.suede()} />
      <mesh material={M.carbon()} position={[0, 0.722, -0.652]} scale={[1.58, 0.012, 0.03]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh material={ambient(amb)} position={[0, 0.64, -0.62]} scale={[1.5, 0.004, 0.004]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {/* the driver's two small screens on a carbon pod */}
      <group position={[-0.36, 0.735, -0.66]} rotation={[-0.38, 0, 0]}>
        <mesh material={M.carbon()} position={[0, 0, -0.012]} scale={[0.4, 0.1, 0.02]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
        <mesh material={sL.m} position={[-0.098, 0, 0.0005]}>
          <planeGeometry args={[0.17, 0.085]} />
        </mesh>
        <mesh material={sR.m} position={[0.098, 0, 0.0005]}>
          <planeGeometry args={[0.17, 0.085]} />
        </mesh>
      </group>
      {/* the centre touchscreen, turned toward him */}
      <group position={[0.07, 0.69, -0.62]} rotation={[-0.32, -0.32, 0]}>
        <mesh material={M.gloss()} position={[0, 0, -0.008]} scale={[0.31, 0.2, 0.014]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
        <mesh material={sC.m} position={[0, 0, 0.0005]}>
          <planeGeometry args={[0.29, 0.181]} />
        </mesh>
      </group>
      <Yoke turn={turn} />
      {/* the console: carbon, the cupholder, the guarded thrust switch */}
      <mesh material={M.carbon()} position={[0, 0.3, -0.13]} scale={[0.24, 0.3, 0.98]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh material={M.suede()} position={[0, 0.452, -0.13]} scale={[0.23, 0.01, 0.96]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh material={M.titanium()} position={[CUP_AT.x, CUP_AT.y + 0.003, CUP_AT.z]}>
        <torusGeometry args={[0.046, 0.005, 8, 32]} />
      </mesh>
      <mesh material={mat("thrustCover", () => new THREE.MeshPhysicalMaterial({ color: "#D8281E", roughness: 0.35, clearcoat: 0.8, transparent: true, opacity: 0.85 }))} position={[0, 0.468, -0.1]} rotation={[-0.2, 0, 0]} scale={[0.05, 0.02, 0.06]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <Seat x={-0.36} />
      <Seat x={0.36} harness />
      {driver ? <Driver w={w} turn={turn} /> : null}
      {/* the coffee: in his hand, then the holder */}
      {cupM ? (
        !driver ? null : <group matrixAutoUpdate={false} matrix={cupM}>
          <Cup tilt={[0, 0]} float={0} t={w} splash={0} />
        </group>
      ) : (
        <group position={CUP_AT}>
          <Cup tilt={st.tilt} float={st.float} t={w} splash={cupSplash} />
        </group>
      )}
    </group>
  );
};

/** Where the wrist of the cup hand is during the walk-up, in the walker's body frame (relative to the eye). */
export const WALK_CUP_HAND = V3(0.2, -0.36, -0.28);
export { canvasTex };
void lerp;
