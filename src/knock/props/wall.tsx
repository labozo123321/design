import React, { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  canvasTex,
  clamp01,
  drawMarker,
  geo,
  haloTex,
  mat,
  noteTex,
  once,
  posterTex,
  rand,
  roundRectPath,
  planarUV,
  roundRectShape,
  stadiumProfile,
  sweepGeometry,
  withRepeat,
  type PosterKind,
} from "./textures";

/**
 * Things on (and inside) the shared wall: the outlet with its crooked cover and moon nightlight, the box
 * behind it seen from inside the cavity, the folded 'sorry' note, your pine shelf, the glow-in-the-dark
 * stickers and their field on Nora's ceiling plane, the posters and the photo-booth strip.
 * Wall-mounted pieces are built facing +z with their backs on z = 0 (the wall face).
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

// ------------------------------------------------------------------------------------------- materials
const ivory = () => mat("k-ivory", () => new THREE.MeshPhysicalMaterial({ color: "#F0ECE0", roughness: 0.32, clearcoat: 0.35, clearcoatRoughness: 0.3 }));
const ivoryMatte = () => mat("k-ivoryMatte", () => new THREE.MeshStandardMaterial({ color: "#E9E4D6", roughness: 0.55 }));
const zinc = () => mat("k-zinc", () => new THREE.MeshStandardMaterial({ color: "#B9BCC0", metalness: 0.85, roughness: 0.38 }));
const darkPlastic = () => mat("k-darkPlastic", () => new THREE.MeshStandardMaterial({ color: "#2A2826", roughness: 0.6 }));
const voidMat = () => mat("k-void", () => new THREE.MeshBasicMaterial({ color: "#050505" }));
/** 2200 K, the nightlight's colour (sRGB) */
export const K2200 = "#FF9A3C";
/** 2400 K (fairy lights, hallway nightlight) */
export const K2400 = "#FFA54F";

// ======================================================================================= the outlet
const FACE_A = 0.0172; // half width of a receptacle face
const FACE_B = 0.0143; // half height
const FACE_Y = 0.0195; // face centres at +-
/** A US duplex receptacle face: flat sides, arched top and bottom. */
const facePath = (grow: number, cy: number, asShape: boolean) => {
  const a = FACE_A + grow;
  const b = FACE_B + grow;
  const c = 0.0028;
  const p = asShape ? new THREE.Shape() : new THREE.Path();
  p.moveTo(-a, cy - b + c);
  p.lineTo(-a, cy + b - c);
  p.quadraticCurveTo(0, cy + b + c, a, cy + b - c);
  p.lineTo(a, cy - b + c);
  p.quadraticCurveTo(0, cy - b - c, -a, cy - b + c);
  return p;
};

const PLATE_W = 0.07;
const PLATE_H = 0.115;
const PLATE_BT = 0.0015;
const PLATE_BS = 0.002;
const PLATE_T = 0.0015 + PLATE_BT * 2; // 4.5 mm

const plateGeo = () =>
  geo("outletPlate", () => {
    const s = roundRectShape(PLATE_W - 2 * PLATE_BS, PLATE_H - 2 * PLATE_BS, 0.0025);
    s.holes.push(facePath(0.0006 + PLATE_BS, FACE_Y, false) as THREE.Path, facePath(0.0006 + PLATE_BS, -FACE_Y, false) as THREE.Path);
    const sc = new THREE.Path();
    sc.absarc(0, 0, 0.0017 + PLATE_BS * 0.6, 0, Math.PI * 2, true);
    s.holes.push(sc);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.0015, bevelEnabled: true, bevelThickness: PLATE_BT, bevelSize: PLATE_BS, bevelSegments: 3, curveSegments: 10 });
    g.translate(0, 0, PLATE_BT);
    g.computeVertexNormals();
    return g;
  });

const faceTex = () =>
  canvasTex("outletFace", 256, 216, (g, w, h) => {
    g.fillStyle = "#EFEADD";
    g.fillRect(0, 0, w, h);
    const px = w / (FACE_A * 2);
    const X = (x: number) => w / 2 + x * px;
    const Y = (y: number) => h / 2 - y * px;
    const slot = (cx: number, cy: number, sw: number, sh: number) => {
      g.fillStyle = "#121110";
      g.beginPath();
      g.roundRect(X(cx - sw / 2), Y(cy + sh / 2), sw * px, sh * px, 2);
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 3;
      g.stroke();
    };
    slot(-0.00635, 0.0025, 0.0019, 0.0079); // neutral (taller)
    slot(0.00635, 0.0025, 0.0019, 0.0064); // hot
    // the ground hole: a D, round side down
    g.fillStyle = "#121110";
    g.beginPath();
    const gy = -0.0085;
    g.moveTo(X(-0.0024), Y(gy + 0.0012));
    g.lineTo(X(0.0024), Y(gy + 0.0012));
    g.arc(X(0), Y(gy + 0.0012), 0.0024 * px, 0, Math.PI, false);
    g.closePath();
    g.fill();
    // moulding sheen
    const sh = g.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, "rgba(255,255,255,0.25)");
    sh.addColorStop(1, "rgba(0,0,0,0.06)");
    g.fillStyle = sh;
    g.fillRect(0, 0, w, h);
  });

const faceGeo = () =>
  geo("outletFaceGeo", () => {
    const g = new THREE.ExtrudeGeometry(facePath(0, 0, true) as THREE.Shape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0005, bevelSegments: 2, curveSegments: 10 });
    // front at z = 5.5 mm (1 mm proud of the plate), back inside the box
    g.translate(0, 0, 0.0055 - 0.0086);
    return g;
  });
const faceMats = () =>
  once("outletFaceMats", () => {
    // the canvas is drawn at w / (2 FACE_A) px per metre on both axes (256 x 216 px)
    const t = withRepeat(faceTex(), 1 / (2 * FACE_A), 1 / ((216 / 256) * 2 * FACE_A));
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.offset.set(0.5, 0.5);
    return [new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.34, clearcoat: 0.3, clearcoatRoughness: 0.3 }), ivory()];
  });

/** The moon nightlight's crescent (outer R, the bite circle offset), its emissive map. */
const MOON_R = 0.0425;
const moonShape = (R: number, bite: [number, number, number]) => {
  const [bx, by, br] = bite;
  // intersections of the two circles
  const d = Math.hypot(bx, by);
  const a = (R * R - br * br + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, R * R - a * a));
  const ux = bx / d;
  const uy = by / d;
  const p1: [number, number] = [a * ux - hh * uy, a * uy + hh * ux];
  const p2: [number, number] = [a * ux + hh * uy, a * uy - hh * ux];
  const s = new THREE.Shape();
  const a1 = Math.atan2(p1[1], p1[0]);
  const a2 = Math.atan2(p2[1], p2[0]);
  // outer arc from p1 the long way round (counter-clockwise) to p2
  s.moveTo(p1[0], p1[1]);
  s.absarc(0, 0, R, a1, a2 + (a2 < a1 ? Math.PI * 2 : 0), false);
  // inner (bite) arc back from p2 to p1, clockwise around the bite centre
  const b2 = Math.atan2(p2[1] - by, p2[0] - bx);
  const b1 = Math.atan2(p1[1] - by, p1[0] - bx);
  s.absarc(bx, by, br, b2, b1 - (b1 > b2 ? Math.PI * 2 : 0), true);
  return s;
};
const nightMoonGeo = () =>
  geo("nightMoon", () => {
    const g = new THREE.ExtrudeGeometry(moonShape(MOON_R, [0.024, 0.008, 0.036]), { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.0025, bevelSegments: 5, curveSegments: 40 });
    g.computeVertexNormals();
    return g;
  });
const moonGlowTex = () =>
  canvasTex("nightMoonGlow", 256, 256, (g, w, h) => {
    // centre of the thick part is bright, the horns fall off; a sleepy face embossed as darker lines
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    const px = w / 0.1;
    const X = (x: number) => w / 2 + x * px;
    const Y = (y: number) => h / 2 - y * px;
    const grd = g.createRadialGradient(X(-0.022), Y(-0.008), 0, X(-0.022), Y(-0.008), 0.06 * px);
    grd.addColorStop(0, "#FFFFFF");
    grd.addColorStop(0.5, "#D8D8D8");
    grd.addColorStop(1, "#7A7A7A");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(0,0,0,0.38)";
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    g.arc(X(-0.021), Y(0.008), 0.0045 * px, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.beginPath();
    g.arc(X(-0.019), Y(-0.012), 0.006 * px, 0.2 * Math.PI, 0.75 * Math.PI);
    g.stroke();
  });
const moonMat = () =>
  mat("nightMoonMat", () => {
    const t = withRepeat(moonGlowTex(), 1 / 0.1, 1 / 0.1);
    t.offset.set(0.5, 0.5);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.MeshPhysicalMaterial({ color: "#FFF4E2", roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25, emissive: new THREE.Color(K2200), emissiveMap: t, emissiveIntensity: 0, sheen: 0.4, sheenColor: new THREE.Color("#FFE2B8") });
  });

/** the cover screw: a low dome (its rim just under the plate face) with a slot painted across it */
const screwDomeGeo = () =>
  geo("plateScrewDome", () => {
    const g = new THREE.SphereGeometry(0.0031, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2.4).rotateX(Math.PI / 2);
    return planarUV(g, "x", "y", -0.0031, 0.0031, -0.0031, 0.0031);
  });
const screwDomeMat = () =>
  mat("k-screwDome", () => {
    const t = canvasTex("slotScrew", 64, 64, (g, w, h) => {
      g.fillStyle = "#EFEADF";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#3A3631";
      g.fillRect(6, h / 2 - 3.5, w - 12, 7);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(6, h / 2 + 3.5, w - 12, 1.5);
    });
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.3, clearcoat: 0.4 });
  });

export type OutletProps = {
  /** the cover sits crooked: rotated ~3 deg and pulled off the wall at the top (a 4 mm gap); 0..1 or boolean */
  crooked?: boolean | number;
  /** the crescent-moon nightlight plugged into the top socket */
  nightlight?: boolean;
  /** the nightlight's glow 0..1 */
  on?: number;
  /** optional real light from the nightlight: point-light intensity (candela) at on = 1; 0 = none */
  light?: number;
  /** that light's range (m) */
  lightRange?: number;
};

/** A duplex outlet and cover plate (0.07 x 0.115), facing +z, its back on z = 0 (the wall face). */
export const Outlet: React.FC<OutletProps> = ({ crooked = false, nightlight = false, on = 1, light = 0, lightRange = 1.2 }) => {
  const k = typeof crooked === "number" ? clamp01(crooked) : crooked ? 1 : 0;
  const tilt = Math.asin(0.004 / PLATE_H) * k;
  const mm = moonMat();
  mm.emissiveIntensity = 2.2 * clamp01(on);
  const fm = faceMats();
  return (
    <group rotation={[0, 0, 3 * DEG * k]}>
      {/* the device: yoke ears and strap behind the plate, the body inside the box */}
      <mesh geometry={geo("yokeMid", () => new THREE.BoxGeometry(0.012, 0.009, 0.0008))} material={zinc()} position={[0, 0, -0.0012]} />
      {[1, -1].map((s) => (
        <group key={s}>
          <mesh geometry={geo("yokeEar", () => new THREE.BoxGeometry(0.012, 0.016, 0.0008))} material={zinc()} position={[0, s * 0.0425, -0.0012]} />
          <mesh geometry={geo("yokeEarW", () => new THREE.BoxGeometry(0.03, 0.006, 0.0008))} material={zinc()} position={[0, s * 0.0475, -0.0012]} />
        </group>
      ))}
      <mesh geometry={geo("rcptBody", () => new RoundedBoxGeometry(0.034, 0.07, 0.024, 2, 0.003))} material={darkPlastic()} position={[0, 0, -0.0042 - 0.012]} />
      <mesh geometry={faceGeo()} material={fm} position={[0, FACE_Y, 0]} />
      <mesh geometry={faceGeo()} material={fm} position={[0, -FACE_Y, 0]} />
      {/* the plate, tilted about its bottom edge */}
      <group position={[0, -PLATE_H / 2, 0]} rotation={[tilt, 0, 0]}>
        <group position={[0, PLATE_H / 2, 0]}>
          <mesh geometry={plateGeo()} material={ivory()} />
          {/* the screw: a domed slotted head (loose when the cover is pulled) */}
          <mesh geometry={screwDomeGeo()} material={screwDomeMat()} position={[0, 0, PLATE_T - 0.0012]} rotation={[0, 0, 0.6]} />
          <mesh geometry={geo("plateScrewShank", () => new THREE.CylinderGeometry(0.0013, 0.0013, 0.008, 8).rotateX(Math.PI / 2))} material={zinc()} position={[0, 0, PLATE_T - 0.004]} />
        </group>
      </group>
      {nightlight && (
        <group position={[0, FACE_Y, 0]}>
          {/* plug block sits on the face inside the plate opening; the housing clears the plate */}
          <mesh geometry={geo("nlPlug", () => new RoundedBoxGeometry(0.026, 0.02, 0.0064, 2, 0.0014))} material={ivoryMatte()} position={[0, 0, 0.0056 + 0.0032]} />
          <mesh geometry={geo("nlHousing", () => new RoundedBoxGeometry(0.034, 0.04, 0.009, 3, 0.0035))} material={ivoryMatte()} position={[0, 0.004, 0.0121 + 0.0045]} />
          <mesh geometry={nightMoonGeo()} material={mm} position={[0.025, 0.0125, 0.0211 + 0.0031]} />
          {light > 0 && on > 0 && <pointLight color={K2200} intensity={light * on} distance={lightRange} decay={2} position={[0.005, 0.01, 0.06]} />}
        </group>
      )}
    </group>
  );
};

// =========================================================================== the box, inside the cavity
export type OutletBoxProps = {
  /** local x of the stud face the cables run down (the stud's face points -x, toward the box) */
  studX?: number;
  /** local y of the top of the bottom plate */
  plateY?: number;
  /** warm light leaking past the crooked cover's gap, 0..1 */
  leak?: number;
};
const boxBlue = () => mat("k-boxBlue", () => new THREE.MeshPhysicalMaterial({ color: "#2E5DB8", roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
const cableWhite = () => mat("k-cable", () => new THREE.MeshPhysicalMaterial({ color: "#EDEBE4", roughness: 0.45, clearcoat: 0.2, sheen: 0.2 }));
const staplePlastic = () => mat("k-staple", () => new THREE.MeshStandardMaterial({ color: "#1E1E20", roughness: 0.45 }));
const leakMat = () => mat("k-leak", () => new THREE.MeshBasicMaterial({ color: new THREE.Color(K2200).multiplyScalar(2), map: haloTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));

const BOX = { w: 0.055, h: 0.09, d: 0.07, t: 0.0025, z0: -0.0005 };
/** Cable routes (local): out of the box's bottom knockouts, arcing to the stud, down its face into the plate. */
const cableCurve = (which: 0 | 1, studX: number, plateY: number) => {
  const half = 0.0026; // half thickness (flat side on the stud)
  const x = studX - half - 0.0002;
  const pts =
    which === 0
      ? [V(0.012, -0.036, -0.054), V(0.012, -0.06, -0.055), V(0.03, -0.11, -0.062), V(x - 0.02, -0.16, -0.07), V(x, -0.2, -0.072), V(x, -0.3, -0.072), V(x, plateY + 0.05, -0.072), V(x, plateY - 0.006, -0.072)]
      : [V(-0.012, -0.036, -0.03), V(-0.012, -0.065, -0.03), V(-0.004, -0.13, -0.034), V(x - 0.035, -0.2, -0.04), V(x, -0.26, -0.042), V(x, -0.34, -0.042), V(x, plateY + 0.05, -0.042), V(x, plateY - 0.006, -0.042)];
  return new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
};

/** The back and sides of a blue single-gang box (0.055 x 0.09 x 0.07 deep) seen from inside the wall:
 * same origin as the Outlet (front plane z = 0 = the wall face, the box going back to z = -0.07). Old-work
 * clamp wings press on the back of the drywall (z = -0.016); two flat white cables leave its bottom
 * knockouts, arc to the stud and run down its face, stapled, into holes in the bottom plate. */
export const OutletBox: React.FC<OutletBoxProps> = ({ studX = 0.121, plateY = -0.542, leak = 0 }) => {
  const walls = geo("boxWalls", () => {
    const s = roundRectShape(BOX.w, BOX.h, 0.004);
    s.holes.push(roundRectPath(BOX.w - 2 * BOX.t, BOX.h - 2 * BOX.t, 0.0016));
    const g = new THREE.ExtrudeGeometry(s, { depth: BOX.d - BOX.t, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, BOX.z0 - (BOX.d - BOX.t));
    return g;
  });
  const back = geo("boxBack", () => {
    const g = new THREE.ExtrudeGeometry(roundRectShape(BOX.w, BOX.h, 0.004), { depth: BOX.t, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, BOX.z0 - BOX.d + 0.0008);
    return g;
  });
  const cables = useMemo(
    () => [0, 1].map((i) => sweepGeometry(cableCurve(i as 0 | 1, studX, plateY), stadiumProfile(0.0052, 0.0026, 5), 90, V(0, 0, 1))),
    [studX, plateY],
  );
  const zA = -0.072;
  const zB = -0.042;
  const xs = studX - 0.0052 - 0.0002;
  const staples: [number, number][] = [
    [-0.24, zA],
    [-0.42, zA],
    [-0.3, zB],
    [-0.46, zB],
  ];
  const lm = leakMat();
  lm.opacity = clamp01(leak) * 0.9;
  return (
    <group>
      <mesh geometry={walls} material={boxBlue()} />
      <mesh geometry={back} material={boxBlue()} />
      {/* moulded ribs down the sides */}
      {[-1, 1].map((s) =>
        [-0.02, 0, 0.02].map((y) => (
          <mesh key={`${s}${y}`} geometry={geo("boxRib", () => new RoundedBoxGeometry(0.0016, 0.004, 0.044, 1, 0.0006))} material={boxBlue()} position={[s * (BOX.w / 2 + 0.0006), y, -0.042]} />
        )),
      )}
      {/* clamp wings behind the drywall, with their screws */}
      {[-1, 1].map((s) => (
        <group key={s} position={[0, s * (BOX.h / 2 + 0.0062), -0.0175]}>
          <mesh geometry={geo("boxWing", () => new RoundedBoxGeometry(0.022, 0.0126, 0.0028, 2, 0.0008))} material={boxBlue()} />
          <mesh geometry={geo("boxWingScrew", () => new THREE.CylinderGeometry(0.0011, 0.0011, 0.012, 8).rotateX(Math.PI / 2))} material={zinc()} position={[0, -s * 0.004, -0.005]} />
        </group>
      ))}
      {/* knockouts the cables pass through (dark openings on the bottom face) */}
      {[
        [0.012, -0.054],
        [-0.012, -0.03],
      ].map(([x, z], i) => (
        <mesh key={i} geometry={geo("knockout", () => new THREE.PlaneGeometry(0.013, 0.0085).rotateX(Math.PI / 2))} material={voidMat()} position={[x, -BOX.h / 2 - 0.0003, z]} />
      ))}
      {cables.map((g, i) => (
        <mesh key={i} geometry={g} material={cableWhite()} />
      ))}
      {/* insulated staples straddling the cables on the stud face */}
      {staples.map(([y, z], i) => (
        <group key={i} position={[xs, y, z]}>
          <mesh geometry={geo("stapleBridge", () => new RoundedBoxGeometry(0.0024, 0.0045, 0.0145, 1, 0.0007))} material={staplePlastic()} position={[-0.0012, 0, 0]} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={geo("stapleLeg", () => new THREE.BoxGeometry(0.0057, 0.0045, 0.0018))} material={staplePlastic()} position={[0.00285 - 0.0001, 0, s * 0.0063]} />
              <mesh geometry={geo("stapleNail", () => new THREE.CylinderGeometry(0.0011, 0.0011, 0.0005, 10).rotateZ(Math.PI / 2))} material={zinc()} position={[-0.0026, 0, s * 0.0063]} />
            </group>
          ))}
        </group>
      ))}
      {/* the holes in the bottom plate */}
      {[zA, zB].map((z, i) => (
        <mesh key={i} geometry={geo("plateHole", () => new THREE.CircleGeometry(0.0075, 20).rotateX(-Math.PI / 2))} material={voidMat()} position={[xs + 0.0026, plateY + 0.0004, z]} />
      ))}
      {leak > 0 && (
        <>
          <mesh geometry={geo("leakSliver", () => new THREE.PlaneGeometry(0.06, 0.02).rotateX(-Math.PI / 2))} material={lm} position={[0, BOX.h / 2 + 0.0145, -0.026]} />
          <mesh geometry={geo("leakFan", () => new THREE.PlaneGeometry(0.05, 0.04).rotateX(-Math.PI / 2))} material={lm} position={[0, BOX.h / 2 + 0.025, -0.038]} />
        </>
      )}
    </group>
  );
};

// ===================================================================================== the folded note
const NOTE_W = 0.1;
const NOTE_L = 0.07;
const NOTE_RC = 0.0009;
/** The note's sheet, bent at its fold: open 0 = folded shut (the top leaf lying back over), 1 = half open
 * (the top leaf standing at 90 deg). The lower leaf lies flat on y = 0 from the fold (z = 0) to z = +0.07. */
const noteGeometry = (open: number) => {
  const beta = Math.PI * (1 - 0.5 * clamp01(open));
  const a = NOTE_RC * beta;
  const gamma = 0.07 + 0.12 * clamp01(open);
  const S: number[] = [];
  for (let k = 0; k <= 10; k++) S.push(-NOTE_L + (NOTE_L * k) / 10);
  for (let k = 1; k <= 8; k++) S.push((a * k) / 8);
  for (let k = 1; k <= 16; k++) S.push(a + ((NOTE_L - a) * k) / 16);
  // integrate the profile (z, y) along the sheet
  const prof: [number, number][] = [];
  let pz = 0;
  let py = 0;
  let ps = a;
  for (const s of S) {
    if (s <= 0) prof.push([-s, 0]);
    else if (s <= a) {
      const ph = s / NOTE_RC;
      prof.push([-NOTE_RC * Math.sin(ph), NOTE_RC * (1 - Math.cos(ph))]);
      pz = -NOTE_RC * Math.sin(ph);
      py = NOTE_RC * (1 - Math.cos(ph));
      ps = s;
    } else {
      const n = 12;
      for (let i = 0; i < n; i++) {
        const s0 = ps + ((s - ps) * (i + 0.5)) / n;
        const ph = beta - (gamma * (s0 - a)) / (NOTE_L - a);
        pz += -Math.cos(ph) * ((s - ps) / n);
        py += Math.sin(ph) * ((s - ps) / n);
      }
      ps = s;
      prof.push([pz, py]);
    }
  }
  const NX = 10;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  S.forEach((s, j) => {
    for (let i = 0; i <= NX; i++) {
      const x = -NOTE_W / 2 + (NOTE_W * i) / NX;
      // a faint warp so the leaves are not ruler-flat
      const warp = s > 0 ? 0.0006 * Math.sin((i / NX) * Math.PI) * Math.min(1, s / NOTE_L) : 0;
      pos.push(x, prof[j][1] + 0.0003 + warp, prof[j][0]);
      uv.push(i / NX, (s + NOTE_L) / (2 * NOTE_L));
    }
  });
  for (let j = 0; j < S.length - 1; j++)
    for (let i = 0; i < NX; i++) {
      const a0 = j * (NX + 1) + i;
      const b0 = a0 + 1;
      const c0 = a0 + NX + 1;
      const d0 = c0 + 1;
      idx.push(a0, b0, c0, b0, d0, c0);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};
const noteMats = (text: string, ink: string) =>
  once(`noteMats-${text}-${ink}`, () => [
    new THREE.MeshStandardMaterial({ map: noteTex("in", text, ink), roughness: 0.82, alphaTest: 0.5, side: THREE.FrontSide }),
    new THREE.MeshStandardMaterial({ map: noteTex("out", text, ink), roughness: 0.85, alphaTest: 0.5, side: THREE.BackSide }),
  ]);

export type FoldedNoteProps = { open?: number; text?: string; ink?: string };
/** The folded lined-paper note (0.1 x 0.07 folded): 'sorry —N' in purple marker inside the lower leaf, the
 * letters' tops toward the fold. Origin on the floor at the middle of the fold; the leaf lies toward +z. */
export const FoldedNote: React.FC<FoldedNoteProps> = ({ open = 0, text = "sorry —N", ink = "#6A3FB0" }) => {
  const q = Math.round(clamp01(open) * 400) / 400;
  const g = useMemo(() => geo(`note-${q}`, () => noteGeometry(q)), [q]);
  const [mi, mo] = noteMats(text, ink);
  return (
    <group>
      <mesh geometry={g} material={mi} />
      <mesh geometry={g} material={mo} />
    </group>
  );
};

// =========================================================================================== the shelf
export const SHELF_DIMS = { w: 0.22, d: 0.16, t: 0.02 };
const pineTex = () =>
  canvasTex("pineBoard", 1024, 768, (g, w, h) => {
    const r = rand(83);
    g.fillStyle = "#E3BE84";
    g.fillRect(0, 0, w, h);
    // flatsawn cathedral grain along x
    for (let k = 0; k < 46; k++) {
      const y0 = (k / 46) * h + (r() - 0.5) * 8;
      const amp = 18 + r() * 40;
      const ph = r() * 6;
      const dark = r() < 0.3;
      g.strokeStyle = dark ? `rgba(160,90,35,${0.35 + r() * 0.25})` : `rgba(190,120,55,${0.12 + r() * 0.18})`;
      g.lineWidth = dark ? 2.5 + r() * 3 : 1 + r() * 2;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const t = x / w;
        const y = y0 + Math.sin(t * Math.PI * 1.3 + ph) * amp * Math.exp(-Math.pow((t - 0.45) * 2.2, 2)) + Math.sin(t * 17 + ph) * 2;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // a knot
    const kx = w * 0.7;
    const ky = h * 0.35;
    for (let q = 9; q > 0; q--) {
      g.strokeStyle = `rgba(120,60,20,${0.08 * q})`;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(kx, ky, q * 5, q * 3.2, 0.1, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "rgba(110,55,20,0.75)";
    g.beginPath();
    g.ellipse(kx, ky, 9, 6, 0.1, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 20000; i++) {
      g.fillStyle = `rgba(120,70,30,${r() * 0.06})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 4, 1);
    }
  });
const pine = (key: string, rx: number, ry: number) =>
  mat(`k-pine-${key}`, () => {
    const t = withRepeat(pineTex(), rx, ry);
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.35 });
  });
const screwHeadTex = () =>
  canvasTex("phillips", 64, 64, (g, w, h) => {
    g.fillStyle = "#B8BBBF";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#3A3C40";
    g.fillRect(w / 2 - 4, 10, 8, h - 20);
    g.fillRect(10, h / 2 - 4, w - 20, 8);
  });
const screwMat = () => mat("k-screwHead", () => new THREE.MeshStandardMaterial({ map: screwHeadTex(), metalness: 0.8, roughness: 0.35 }));
const ScrewHead: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({ position, rotation }) => (
  <mesh geometry={geo("screwHead", () => new THREE.CylinderGeometry(0.0036, 0.0034, 0.0008, 16))} material={[zinc(), screwMat(), zinc()]} position={position} rotation={rotation} />
);

/** Your little pine shelf (0.22 wide x 0.16 deep x 0.02) on a back rail and one bracket. Origin: the middle
 * of the back edge on the TOP surface (y = 0 is where things stand); the board runs from z = 0 (the wall)
 * to z = +0.16 (into the room), the rail and bracket hang below. */
export const CornerShelf: React.FC = () => {
  const board = geo("shelfBoard", () => {
    const bs = 0.0015;
    const s = roundRectShape(SHELF_DIMS.w - 2 * bs, SHELF_DIMS.d - 2 * bs, [0.024, 0.024, 0.0012, 0.0012]);
    const g = new THREE.ExtrudeGeometry(s, { depth: SHELF_DIMS.t - 2 * bs, bevelEnabled: true, bevelThickness: bs, bevelSize: bs, bevelSegments: 3, curveSegments: 10 });
    // shape y -> world z (front = +z); extrude -> world -y
    g.rotateX(Math.PI / 2);
    g.translate(0, -bs, SHELF_DIMS.d / 2 + 0.0002);
    return g;
  });
  const bracket = geo("shelfBracket", () => {
    const s = new THREE.Shape();
    s.moveTo(0.0162, -0.0201);
    s.lineTo(0.112, -0.0201);
    s.quadraticCurveTo(0.104, -0.03, 0.06, -0.044);
    s.quadraticCurveTo(0.03, -0.054, 0.0162, -0.0649);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.017, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 12 });
    // shape (z, y) with extrusion along -x
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const sx = p.getX(i);
      const sy = p.getY(i);
      const sz = p.getZ(i);
      p.setXYZ(i, -sz + 0.0085, sy, sx);
    }
    g.computeVertexNormals();
    return g;
  });
  const boardMat = pine("board", 1 / SHELF_DIMS.w, 1 / SHELF_DIMS.d);
  boardMat.map!.offset.set(0.5, 0.5);
  return (
    <group>
      <mesh geometry={board} material={boardMat} />
      <mesh geometry={geo("shelfRail", () => new RoundedBoxGeometry(0.2, 0.045, 0.016, 2, 0.0018))} material={pine("rail", 4, 4)} position={[0, -0.0201 - 0.0225, 0.0002 + 0.008]} />
      <mesh geometry={bracket} material={pine("bracket", 8, 8)} />
      {/* screws: two down through the board into the rail, two through the rail into the wall */}
      <ScrewHead position={[-0.075, 0.0001, 0.009]} />
      <ScrewHead position={[0.075, 0.0001, 0.009]} />
      <ScrewHead position={[-0.07, -0.042, 0.0162 + 0.0001]} rotation={[Math.PI / 2, 0, 0]} />
      <ScrewHead position={[0.07, -0.042, 0.0162 + 0.0001]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
};

// ================================================================================ glow-in-the-dark stickers
export const GLOW = "#CFFFD9";
const starShape = (R: number, r: number) => {
  const s = new THREE.Shape();
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  // rounded points: cut each corner with a small quadratic
  const rnd = 0.16;
  for (let i = 0; i < 10; i++) {
    const p = pts[i];
    const prev = pts[(i + 9) % 10];
    const next = pts[(i + 1) % 10];
    const k = i % 2 ? 0.08 : rnd;
    const a: [number, number] = [p[0] + (prev[0] - p[0]) * k, p[1] + (prev[1] - p[1]) * k];
    const b: [number, number] = [p[0] + (next[0] - p[0]) * k, p[1] + (next[1] - p[1]) * k];
    if (i === 0) s.moveTo(a[0], a[1]);
    else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p[0], p[1], b[0], b[1]);
  }
  s.closePath();
  return s;
};
const stickerGeo = (kind: "star" | "moon") =>
  geo(`sticker-${kind}`, () => {
    const shape = kind === "star" ? starShape(0.5, 0.21) : moonShape(0.5, [0.27, 0.12, 0.42]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.01, bevelSegments: 2, curveSegments: kind === "star" ? 4 : 28 });
    // unit-sized (1 across): lie flat, hang just below y = 0 (the ceiling plane)
    g.rotateX(Math.PI / 2);
    g.translate(0, -0.006, 0);
    g.computeVertexNormals();
    return g;
  });
const phosphorTex = () =>
  canvasTex("phosphor", 128, 128, (g, w, h) => {
    const r = rand(5);
    g.fillStyle = "#DADADA";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      const v = 190 + r() * 65;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
  });

export type GlowProps = {
  /** across (m): star default 0.06, moon 0.12 (its height) */
  size?: number;
  /** emissive glow 0..1 */
  glow?: number;
  /** overall fade (day frames: 0) */
  opacity?: number;
  /** a faint additive halo around it, 0..1 of its glow */
  halo?: number;
  /** turn about the vertical (rad) */
  rot?: number;
};
const Sticker: React.FC<GlowProps & { kind: "star" | "moon" }> = ({ kind, size, glow = 1, opacity = 1, halo = 0.5, rot = 0 }) => {
  const s = size ?? (kind === "star" ? 0.06 : 0.12);
  const m = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#E7EFD8",
        emissive: new THREE.Color(GLOW),
        emissiveMap: phosphorTex(),
        roughness: 0.6,
        transparent: true,
      }),
    [],
  );
  const hm = useMemo(() => new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(GLOW), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), []);
  const g = clamp01(glow);
  m.emissiveIntensity = 1.6 * g;
  m.opacity = clamp01(opacity);
  m.depthWrite = opacity > 0.99;
  hm.opacity = 0.32 * g * halo * clamp01(opacity);
  if (opacity <= 0) return null;
  return (
    <group rotation={[0, rot, 0]}>
      <mesh geometry={stickerGeo(kind)} material={m} scale={s} />
      {halo > 0 && g > 0 && <sprite material={hm} scale={[s * 3.2, s * 3.2, 1]} position={[0, -0.002, 0]} />}
    </group>
  );
};
/** A 5-point glow-in-the-dark star sticker (~0.06 across), lying flat with its back at y = 0 (stuck under
 * the ceiling plane); both faces glow so it reads from the overhead camera. */
export const GlowStar: React.FC<GlowProps> = (p) => <Sticker kind="star" {...p} />;
/** The crescent-moon sticker (~0.12 tall). */
export const GlowMoon: React.FC<GlowProps> = (p) => <Sticker kind="moon" {...p} />;

export type StarPlace = { x: number; y: number; z: number; rot: number; size: number; kind: "star" | "moon"; rank: number };
/** The last four to stay (x, z): near the middle of Nora's room, an easy little kite from above. */
export const STAR_KEEP: [number, number, number][] = [
  [-0.92, -1.72, 0.068],
  [-1.42, -1.98, 0.062],
  [-1.16, -1.36, 0.056],
  [-1.7, -1.52, 0.05],
];
/**
 * ~40 sticker placements on the ceiling plane y = 2.5 over Nora's room (x in [-2.4, -0.12], z in
 * [-3.5, -0.2]), never closer than 0.2 m, one of them the crescent moon. rank = removal order reversed: a
 * star shows while rank < count, so count 40 shows all and count 4 leaves STAR_KEEP. Nearer the room's
 * middle stays longer.
 */
export const starfield = (seed = 7): StarPlace[] => {
  const r = rand(seed * 977 + 13);
  const out: StarPlace[] = STAR_KEEP.map(([x, z, s], i) => ({ x, y: 2.5, z, rot: r() * Math.PI * 2, size: s, kind: "star" as const, rank: i }));
  const ok = (x: number, z: number, rad: number) => out.every((p) => Math.hypot(p.x - x, p.z - z) > rad + (p.kind === "moon" ? 0.07 : 0.035) + 0.13);
  // the moon over her bed
  out.push({ x: -0.62, y: 2.5, z: -2.92, rot: 0.35, size: 0.12, kind: "moon", rank: -1 });
  let guard = 0;
  while (out.length < 41 && guard++ < 20000) {
    const x = -2.4 + r() * 2.28;
    const z = -3.5 + r() * 3.3;
    // denser over the bed (kids stick them where they lie)
    const overBed = x > -1.1 && z < -1.6;
    if (!overBed && r() < 0.35) continue;
    if (!ok(x, z, 0.035)) continue;
    out.push({ x, y: 2.5, z, rot: r() * Math.PI * 2, size: 0.042 + r() * 0.03, kind: "star", rank: -1 });
  }
  // removal order for the rest: nearer the middle stays longer (with some chance)
  const rest = out.filter((p) => p.rank < 0);
  const score = (p: StarPlace) => Math.hypot(p.x + 1.25, (p.z + 1.75) * 0.8) + r() * 0.7;
  const scored = rest.map((p) => ({ p, s: p.kind === "moon" ? 1.4 : score(p) }));
  scored.sort((a, b) => a.s - b.s);
  scored.forEach((e, i) => (e.p.rank = 4 + i));
  return out;
};

export type StarfieldProps = {
  seed?: number;
  /** how many still cling on (rank < count); 40 = all */
  count?: number;
  glow?: number;
  opacity?: number;
  halo?: number;
  /** per-sticker glow multiplier (flicker-outs), by rank */
  glowOf?: (p: StarPlace) => number;
};
/** The stickers of starfield(seed), in world coordinates (y = 2.5). */
export const Starfield: React.FC<StarfieldProps> = ({ seed = 7, count = 40, glow = 1, opacity = 1, halo = 0.5, glowOf }) => {
  const places = useMemo(() => starfield(seed), [seed]);
  return (
    <group>
      {places
        .filter((p) => p.rank < count)
        .map((p, i) => (
          <group key={i} position={[p.x, p.y, p.z]}>
            {p.kind === "star" ? (
              <GlowStar size={p.size} rot={p.rot} glow={glow * (glowOf ? glowOf(p) : 1)} opacity={opacity} halo={halo} />
            ) : (
              <GlowMoon size={p.size} rot={p.rot} glow={glow * (glowOf ? glowOf(p) : 1)} opacity={opacity} halo={halo} />
            )}
          </group>
        ))}
    </group>
  );
};

// ============================================================================================ posters
const tapeMat = () => mat("k-clearTape", () => new THREE.MeshPhysicalMaterial({ color: "#F4F1E4", roughness: 0.22, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.1, depthWrite: false }));
const posterBack = () => mat("k-posterBack", () => new THREE.MeshStandardMaterial({ color: "#EDE8DC", roughness: 0.9, side: THREE.BackSide }));
const pinMat = (c: string) => mat(`k-pin-${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 }));

/** A sheet's height off the wall: a gentle belly, a lifted unpinned corner (never below 0.6 mm). */
const sheetZ = (u: number, v: number, w: number, h: number, curl: [number, number] | null) => {
  let z = 0.0006 + 0.0026 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
  if (curl) {
    const d = Math.hypot((u - curl[0]) * w, (v - curl[1]) * h);
    z += 0.009 * Math.pow(Math.max(0, 1 - d / 0.12), 2);
  }
  return z;
};
const sheetGeo = (key: string, w: number, h: number, curl: [number, number] | null) =>
  geo(`sheet-${key}`, () => {
    const g = new THREE.PlaneGeometry(w, h, 16, 20);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / w + 0.5;
      const v = p.getY(i) / h + 0.5;
      p.setZ(i, sheetZ(u, v, w, h, curl));
    }
    g.computeVertexNormals();
    return g;
  });
/** A strip of clear tape laid over a sheet's edge onto the wall: follows the sheet, then steps down. */
const tapeGeo = (key: string, len: number, wid: number, sample: (x: number, y: number) => number) =>
  geo(`tape-${key}`, () => {
    const g = new THREE.PlaneGeometry(len, wid, 12, 2);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) p.setZ(i, sample(p.getX(i), p.getY(i)) + 0.00035);
    g.computeVertexNormals();
    return g;
  });

export type PosterProps = {
  kind: PosterKind;
  /** how it is held up (default: unicorn/soccer tape, T-rex/band pins) */
  mount?: "tape" | "pins";
  w?: number;
  h?: number;
};
/** A poster (0.45 x 0.6), facing +z, its back on the wall at z = 0 (origin at its centre). */
export const Poster: React.FC<PosterProps> = ({ kind, mount, w = 0.45, h = 0.6 }) => {
  const how = mount ?? (kind === "unicorn" || kind === "soccer" ? "tape" : "pins");
  const curl: [number, number] | null = how === "tape" ? [1, 0] : [0, 0];
  const g = sheetGeo(`${kind}-${w}-${h}-${how}`, w, h, how === "tape" ? null : curl);
  const m = mat(`k-poster-${kind}`, () => new THREE.MeshPhysicalMaterial({ map: posterTex(kind), roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.35 }));
  const corners: [number, number][] = [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ];
  const pinCols = ["#D63B3B", "#3B7BD6", "#E8C33A", "#3BB36A"];
  return (
    <group>
      <mesh geometry={g} material={m} />
      <mesh geometry={g} material={posterBack()} />
      {how === "pins"
        ? corners
            .filter((c) => !(c[0] === -1 && c[1] === -1))
            .map(([sx, sy], i) => (
              <group key={i} position={[sx * (w / 2 - 0.018), sy * (h / 2 - 0.018), 0.0008]}>
                <mesh geometry={geo("pinBase", () => new THREE.CylinderGeometry(0.0058, 0.0062, 0.0016, 18).rotateX(Math.PI / 2))} material={pinMat(pinCols[i])} position={[0, 0, 0.0008]} />
                <mesh geometry={geo("pinGrip", () => new THREE.CylinderGeometry(0.0034, 0.0042, 0.006, 14).rotateX(Math.PI / 2))} material={pinMat(pinCols[i])} position={[0, 0, 0.0046]} />
                <mesh geometry={geo("pinCap", () => new THREE.SphereGeometry(0.0037, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2))} material={pinMat(pinCols[i])} position={[0, 0, 0.0076]} />
              </group>
            ))
        : corners.map(([sx, sy], i) => {
            const cx = sx * (w / 2);
            const cy = sy * (h / 2);
            const sample = (lx: number, ly: number) => {
              // tape local -> poster coords (rotated 45 deg about the corner)
              const a = (sx * sy > 0 ? -1 : 1) * Math.PI / 4;
              const px = cx + lx * Math.cos(a) - ly * Math.sin(a);
              const py = cy + lx * Math.sin(a) + ly * Math.cos(a);
              const inside = Math.abs(px) <= w / 2 && Math.abs(py) <= h / 2;
              return inside ? sheetZ(px / w + 0.5, py / h + 0.5, w, h, null) : 0;
            };
            return (
              <mesh
                key={i}
                geometry={tapeGeo(`${kind}-${i}-${w}-${h}`, 0.06, 0.019, sample)}
                material={tapeMat()}
                position={[cx, cy, 0]}
                rotation={[0, 0, (sx * sy > 0 ? -1 : 1) * Math.PI / 4]}
              />
            );
          })}
    </group>
  );
};

// ======================================================================================== photo strip
const photoStripTex = () =>
  canvasTex("photoStrip", 220, 660, (g, w, h) => {
    g.fillStyle = "#F7F5F0";
    g.fillRect(0, 0, w, h);
    const fw = w - 24;
    const fh = (h - 12 * 5 - 30) / 4;
    const r = rand(47);
    for (let i = 0; i < 4; i++) {
      const x = 12;
      const y = 12 + i * (fh + 12);
      g.save();
      g.beginPath();
      g.rect(x, y, fw, fh);
      g.clip();
      const bg = g.createLinearGradient(x, y, x, y + fh);
      bg.addColorStop(0, "#8A8783");
      bg.addColorStop(1, "#5E5B58");
      g.fillStyle = bg;
      g.fillRect(x, y, fw, fh);
      // two generic people: left long dark hair, right short hair; poses per frame
      const person = (cx: number, cy: number, s: number, longHair: boolean, tilt: number, mouth: "smile" | "o" | "tongue" | "laugh", hand: boolean) => {
        g.save();
        g.translate(cx, cy);
        g.rotate(tilt);
        // shoulders
        g.fillStyle = longHair ? "#3A3836" : "#2A2826";
        g.beginPath();
        g.ellipse(0, s * 1.35, s * 1.1, s * 0.6, 0, Math.PI, 0);
        g.fill();
        if (longHair) {
          g.fillStyle = "#1E1B19";
          g.beginPath();
          g.ellipse(0, s * 0.25, s * 0.82, s * 1.05, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#C9C2B8";
        g.beginPath();
        g.ellipse(0, 0, s * 0.62, s * 0.76, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#1E1B19";
        if (longHair) {
          g.beginPath();
          g.ellipse(0, -s * 0.52, s * 0.66, s * 0.34, 0, Math.PI, 0);
          g.fill();
          g.fillStyle = "#E4E0D8";
          g.fillRect(s * 0.32, -s * 0.72, s * 0.3, s * 0.12);
        } else {
          g.beginPath();
          g.ellipse(0, -s * 0.5, s * 0.66, s * 0.36, 0, Math.PI, 0);
          g.fill();
          for (let k = 0; k < 5; k++) {
            g.beginPath();
            g.arc(-s * 0.5 + k * s * 0.25, -s * 0.62, s * 0.14, 0, Math.PI * 2);
            g.fill();
          }
        }
        // eyes
        g.fillStyle = "#1E1B19";
        for (const ex of [-0.22, 0.22]) {
          g.beginPath();
          if (mouth === "laugh") g.arc(ex * s, -s * 0.05, s * 0.09, Math.PI, 0);
          else g.arc(ex * s, -s * 0.05, s * 0.07, 0, Math.PI * 2);
          g.fill();
        }
        // mouth
        g.strokeStyle = "#3A2A28";
        g.lineWidth = s * 0.07;
        g.beginPath();
        if (mouth === "smile") g.arc(0, s * 0.2, s * 0.24, 0.15 * Math.PI, 0.85 * Math.PI);
        else if (mouth === "o") g.arc(0, s * 0.32, s * 0.1, 0, Math.PI * 2);
        else if (mouth === "laugh") {
          g.fillStyle = "#3A2A28";
          g.ellipse(0, s * 0.3, s * 0.22, s * 0.14, 0, 0, Math.PI);
          g.fill();
        } else {
          g.arc(0, s * 0.24, s * 0.22, 0.1 * Math.PI, 0.9 * Math.PI);
          g.stroke();
          g.fillStyle = "#8A6A68";
          g.beginPath();
          g.ellipse(s * 0.04, s * 0.45, s * 0.1, s * 0.12, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.stroke();
        if (hand) {
          g.fillStyle = "#C9C2B8";
          g.beginPath();
          g.ellipse(s * 0.95, s * 0.7, s * 0.2, s * 0.28, -0.3, 0, Math.PI * 2);
          g.fill();
          g.fillRect(s * 0.85, s * 0.1, s * 0.09, s * 0.5);
          g.fillRect(s * 1.0, s * 0.12, s * 0.09, s * 0.48);
        }
        g.restore();
      };
      const poses: ["smile" | "o" | "tongue" | "laugh", "smile" | "o" | "tongue" | "laugh", number, number, boolean][] = [
        ["smile", "smile", -0.05, 0.08, false],
        ["tongue", "o", 0.2, -0.15, true],
        ["laugh", "laugh", -0.25, 0.25, false],
        ["smile", "smile", 0.1, 0.12, true],
      ];
      const [m1, m2, t1, t2, hnd] = poses[i];
      person(x + fw * 0.32, y + fh * 0.5, fh * 0.27, true, t1, m1, hnd);
      person(x + fw * 0.7, y + fh * 0.52, fh * 0.26, false, t2, m2, false);
      // film grain and a little vignette
      for (let k = 0; k < 900; k++) {
        g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${r() * 0.12})`;
        g.fillRect(x + r() * fw, y + r() * fh, 1, 1);
      }
      const vg = g.createRadialGradient(x + fw / 2, y + fh / 2, fh * 0.3, x + fw / 2, y + fh / 2, fh * 0.8);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.35)");
      g.fillStyle = vg;
      g.fillRect(x, y, fw, fh);
      g.restore();
    }
    // warm sepia cast over all
    g.fillStyle = "rgba(255,225,180,0.12)";
    g.fillRect(0, 0, w, h);
    drawMarker(g, "♥", w - 40, h - 8, 20, "#C23B5A", { seed: 3, width: 3 });
  });

/** A photo-booth strip (0.05 x 0.15): four frames of two generic figures, taped at the top. Facing +z,
 * back on z = 0, origin at its centre. */
export const PhotoStrip: React.FC<{ tilt?: number }> = ({ tilt = 0.04 }) => {
  const w = 0.05;
  const h = 0.15;
  const g = sheetGeo(`strip`, w, h, [1, 0]);
  const m = mat("k-photoStrip", () => new THREE.MeshPhysicalMaterial({ map: photoStripTex(), roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2 }));
  const sample = (lx: number, ly: number) => {
    const py = h / 2 + ly;
    return Math.abs(lx) <= w / 2 && py <= h / 2 ? sheetZ(lx / w + 0.5, py / h + 0.5, w, h, [1, 0]) : 0;
  };
  return (
    <group rotation={[0, 0, tilt]}>
      <mesh geometry={g} material={m} />
      <mesh geometry={g} material={posterBack()} />
      <mesh geometry={tapeGeo("strip-top", 0.034, 0.016, sample)} material={tapeMat()} position={[0, h / 2, 0]} />
    </group>
  );
};
