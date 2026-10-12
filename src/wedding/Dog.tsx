import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hash } from "./flight";

/**
 * The family's golden retriever in a navy bow tie, sitting. Built at its feet facing -z: haunches, a chest
 * with a ruff, straight front legs and big paws, a thick neck, the head (skull, muzzle, glossy nose, a jaw
 * that opens to pant, the tongue, dark eyes with lids and brows, ears that flop), and a tail that sweeps the
 * grass. Fur: a strand texture with a soft sheen, paler on the chest and muzzle, deeper on the ears.
 */

export type DogPose = {
  /** where to look (world), and a tilt of the head (radians, + to its right) */
  look?: THREE.Vector3 | null;
  tilt: number;
  /** panting: mouth open 0..1, tongue out 0..1 */
  pant: number;
  tongue: number;
  wag: number;
  t: number;
  /** blinking, ears perked (0 relaxed .. 1 up) */
  blink?: number;
  perk?: number;
  /** holding the ring box in its mouth, frosting on its nose */
  box?: boolean;
  frosting?: boolean;
};

const furTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const N = 512;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d")!;
    g.fillStyle = "#9a9a9a";
    g.fillRect(0, 0, N, N);
    for (let k = 0; k < 9000; k++) {
      const x = hash(k * 1.3) * N;
      const y = hash(k * 2.7) * N;
      const len = 6 + hash(k * 3.1) * 18;
      const ang = Math.PI / 2 + (hash(k * 5.3) - 0.5) * 0.7;
      const l = Math.round(90 + hash(k * 7.9) * 165);
      g.strokeStyle = `rgba(${l},${l},${l},${0.25 + hash(k * 9.1) * 0.35})`;
      g.lineWidth = 0.7 + hash(k * 4.4) * 1.3;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + (hash(k) - 0.5) * 5, y + Math.sin(ang) * len * 0.5, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    t.anisotropy = 8;
    return t;
  };
})();

const mats: Record<string, THREE.Material> = {};
const fur = (c: string) =>
  (mats[c] ??= new THREE.MeshPhysicalMaterial({
    color: c,
    map: furTex(),
    bumpMap: furTex(),
    bumpScale: 0.8,
    roughness: 0.85,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(c).lerp(new THREE.Color("#FFF2D6"), 0.55),
  }));
const GOLD = "#D69E4E";
const PALE = "#EBC58A";
const DEEP = "#B97B34";

/** An ellipsoid with lumpy fur-tufted silhouette. */
const tufty = (seed: number, amt = 0.06) => {
  const g = new THREE.SphereGeometry(1, 28, 20);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = 1 + (hash(Math.round(x * 9) * 7.1 + Math.round(y * 9) * 3.3 + Math.round(z * 9) * 1.7 + seed) - 0.5) * amt;
    p.setXYZ(i, x * n, y * n, z * n);
  }
  g.computeVertexNormals();
  return g;
};

const Blob: React.FC<{ p: [number, number, number]; s: [number, number, number]; r?: [number, number, number]; c: string; seed?: number }> = ({ p, s, r = [0, 0, 0], c, seed = 1 }) => {
  const geo = useMemo(() => tufty(seed), [seed]);
  return <mesh geometry={geo} material={fur(c)} position={p} scale={s} rotation={r} castShadow receiveShadow />;
};

/** An ear: a soft flap hanging from the top of the head, folded over. */
const earGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    const pl = new THREE.PlaneGeometry(1, 1, 8, 10);
    const p = pl.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i) - 0.5;
      const w = Math.sin(Math.PI * Math.min(1, (y + 1) * 0.95)) ** 0.6;
      p.setXYZ(i, x * (0.55 + 0.45 * w) * (0.35 + 0.65 * (y + 1)), y, 0.18 * (1 - (x * 2) ** 2) * (0.4 + 0.6 * (y + 1)));
    }
    pl.computeVertexNormals();
    // give it some thickness: a slightly smaller copy behind, flipped
    const back = pl.clone();
    back.scale(0.98, 0.98, 1);
    back.translate(0, 0, -0.04);
    const idx = back.index!.array as Uint16Array | Uint32Array;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i];
      idx[i] = idx[i + 2];
      idx[i + 2] = a;
    }
    g = mergeGeometries([pl, back])!;
    g.computeVertexNormals();
    return g;
  };
})();

export const Dog: React.FC<{ at: THREE.Vector3; yaw: number; pose: DogPose; scale?: number }> = ({ at, yaw, pose, scale = 1 }) => {
  const t = pose.t;
  const breathe = 1 + 0.025 * Math.sin(t * (pose.pant > 0.3 ? 14 : 4));
  // the head: in the body's frame, turned toward what it looks at
  const headBase = new THREE.Vector3(0, 0.66, -0.12);
  let hy = 0;
  let hp = 0;
  if (pose.look) {
    const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)).invert();
    const local = pose.look.clone().sub(at).divideScalar(scale).applyQuaternion(inv).sub(headBase);
    hy = Math.max(-1.0, Math.min(1.0, Math.atan2(-local.x, -local.z)));
    hp = Math.max(-0.6, Math.min(0.7, Math.atan2(local.y, Math.hypot(local.x, local.z))));
  }
  const jaw = 0.08 + 0.32 * pose.pant + (pose.box ? 0.12 : 0);
  const blink = pose.blink ?? 0;
  const perk = pose.perk ?? 0;
  const wag = Math.sin(t * 11) * 0.5 * pose.wag;
  const eyeMat = mats.eye ?? (mats.eye = new THREE.MeshPhysicalMaterial({ color: "#2A1608", roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 }));
  const noseMat = mats.nose ?? (mats.nose = new THREE.MeshPhysicalMaterial({ color: "#1A1311", roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
  const lipMat = mats.lip ?? (mats.lip = new THREE.MeshStandardMaterial({ color: "#2E1E18", roughness: 0.5 }));
  const tongueMat = mats.tongue ?? (mats.tongue = new THREE.MeshPhysicalMaterial({ color: "#E07A86", roughness: 0.3, clearcoat: 0.6 }));
  const mouthMat = mats.mouth ?? (mats.mouth = new THREE.MeshStandardMaterial({ color: "#5A2028", roughness: 0.6 }));
  const tieMat = mats.tie ?? (mats.tie = new THREE.MeshPhysicalMaterial({ color: "#1F2C46", roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color("#5A6C90") }));
  const frostMat = mats.frost ?? (mats.frost = new THREE.MeshPhysicalMaterial({ color: "#FFF8EC", roughness: 0.4, clearcoat: 0.6 }));
  const tail = useMemo(() => new THREE.BufferGeometry(), []);
  {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const a = wag * u * 1.4;
      pts.push(new THREE.Vector3(Math.sin(a) * 0.4 * u, 0.06 + 0.05 * Math.sin(u * Math.PI), 0.22 + Math.cos(a) * 0.4 * u));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 24, 0.035, 10, false);
    // taper toward the tip, with feathering underneath
    const p = tube.attributes.position as THREE.BufferAttribute;
    const segs = 24;
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const c = curve.getPoint(u);
      const taper = 1 - 0.65 * u;
      for (let r = 0; r <= 10; r++) {
        const i = s * 11 + r;
        p.setXYZ(i, c.x + (p.getX(i) - c.x) * taper, c.y + (p.getY(i) - c.y) * taper * 1.3, c.z + (p.getZ(i) - c.z) * taper);
      }
    }
    tube.computeVertexNormals();
    tail.copy(tube);
  }
  return (
    <group position={at} rotation={[0, yaw, 0]} scale={scale}>
      {/* haunches and hind paws */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Blob p={[s * 0.12, 0.17, 0.1]} s={[0.11, 0.15, 0.17]} r={[0.3, 0, 0]} c={GOLD} seed={s + 3} />
          <Blob p={[s * 0.13, 0.035, -0.06]} s={[0.045, 0.035, 0.085]} c={PALE} seed={s + 5} />
        </group>
      ))}
      {/* the body rising to the chest, the ruff */}
      <Blob p={[0, 0.34, 0.03]} s={[0.135 * breathe, 0.25, 0.15 * breathe]} r={[-0.35, 0, 0]} c={GOLD} seed={7} />
      <Blob p={[0, 0.46, -0.1]} s={[0.12, 0.13, 0.085]} r={[-0.2, 0, 0]} c={PALE} seed={8} />
      {/* front legs and paws */}
      {[-1, 1].map((s) => (
        <group key={`f${s}`}>
          <mesh material={fur(GOLD)} position={[s * 0.075, 0.22, -0.13]} scale={[0.036, 0.2, 0.04]} castShadow>
            <sphereGeometry args={[1, 14, 12]} />
          </mesh>
          <Blob p={[s * 0.078, 0.03, -0.17]} s={[0.046, 0.032, 0.062]} c={PALE} seed={s + 11} />
        </group>
      ))}
      {/* the neck */}
      <Blob p={[0, 0.58, -0.08]} s={[0.085, 0.11, 0.09]} r={[-0.4, 0, 0]} c={GOLD} seed={13} />
      {/* the bow tie */}
      <group position={[0, 0.555, -0.155]} rotation={[0.35, 0, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} material={tieMat} position={[s * 0.032, 0, 0]} rotation={[0, 0, (s * Math.PI) / 2]}>
            <coneGeometry args={[0.024, 0.06, 4]} />
          </mesh>
        ))}
        <mesh material={tieMat} scale={[0.014, 0.016, 0.012]}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      </group>
      {/* the head */}
      <group position={headBase} rotation={[hp, hy, pose.tilt, "YXZ"]}>
        {/* skull and cheeks */}
        <Blob p={[0, 0.07, 0.0]} s={[0.085, 0.08, 0.098]} c={GOLD} seed={17} />
        <Blob p={[0, 0.035, -0.07]} s={[0.07, 0.06, 0.07]} c={GOLD} seed={18} />
        {/* the muzzle, pale, and the upper lip */}
        <Blob p={[0, 0.03, -0.15]} s={[0.05, 0.042, 0.075]} c={PALE} seed={19} />
        {/* nose */}
        <mesh material={noseMat} position={[0, 0.048, -0.222]} scale={[0.024, 0.017, 0.016]}>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={`n${s}`} material={lipMat} position={[s * 0.009, 0.044, -0.236]} scale={[0.004, 0.003, 0.002]}>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
        ))}
        {pose.frosting
          ? // it's been at the cake: a dollop on the nose, smears on the muzzle and the chin, a bit on the head
            (
              [
                [0.006, 0.06, -0.218, 0.022, 0.012, 0.016, 0.3, 0.3],
                [-0.047, 0.026, -0.16, 0.008, 0.017, 0.026, 0.1, 0.15],
                [0.03, 0.068, -0.15, 0.019, 0.008, 0.024, -0.1, 0.25],
                [0.044, 0.02, -0.19, 0.008, 0.012, 0.016, 0.2, -0.2],
                [-0.02, 0.146, -0.03, 0.022, 0.008, 0.02, -0.2, 0.15],
              ] as const
            ).map(([x, y, z, sx, sy, sz, rx, rz], i) => (
              <mesh key={i} material={frostMat} position={[x, y, z]} scale={[sx, sy, sz]} rotation={[rx, 0, rz]}>
                <sphereGeometry args={[1, 12, 10]} />
              </mesh>
            ))
          : null}
        {/* the lower jaw, hinged at the back of the mouth; the mouth's dark inside; the tongue */}
        <group position={[0, 0.0, -0.08]} rotation={[jaw, 0, 0]}>
          <Blob p={[0, -0.012, -0.065]} s={[0.04, 0.02, 0.065]} c={PALE} seed={21} />
          <mesh material={mouthMat} position={[0, 0.006, -0.06]} scale={[0.034, 0.012, 0.058]}>
            <sphereGeometry args={[1, 12, 10]} />
          </mesh>
          <mesh material={tongueMat} position={[0, 0.005 - 0.03 * pose.tongue, -0.085 - 0.04 * pose.tongue]} rotation={[0.5 + 0.6 * pose.tongue, 0, 0]} scale={[0.026, 0.006, 0.05 + 0.025 * pose.tongue]}>
            <sphereGeometry args={[1, 14, 10]} />
          </mesh>
          {pose.box ? (
            // the ring box held by its ribbon, swinging under the jaw
            <group position={[0, -0.01, -0.12]} rotation={[-jaw + Math.sin(t * 3) * 0.15, 0, 0]}>
              <mesh material={mats.ribbon ?? (mats.ribbon = new THREE.MeshPhysicalMaterial({ color: "#F4EEE6", roughness: 0.4, sheen: 1 }))} position={[0, -0.04, 0]} scale={[0.006, 0.04, 0.003]}>
                <boxGeometry args={[1, 2, 1]} />
              </mesh>
              <RingBox at={new THREE.Vector3(0, -0.105, 0)} />
            </group>
          ) : null}
        </group>
        {/* eyes, under a soft brow; lids for blinking */}
        {[-1, 1].map((s) => (
          <group key={`e${s}`} position={[s * 0.043, 0.085, -0.075]}>
            <mesh material={eyeMat} scale={0.0135}>
              <sphereGeometry args={[1, 16, 12]} />
            </mesh>
            <mesh material={fur(GOLD)} position={[0, 0.006 + 0.004 * blink, 0.002]} scale={[0.017, 0.012 * (0.4 + blink), 0.016]}>
              <sphereGeometry args={[1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            <Blob p={[s * 0.004, 0.02, 0.004]} s={[0.02, 0.009, 0.014]} r={[0, 0, s * (0.25 - 0.15 * Math.abs(pose.tilt))]} c={DEEP} seed={s + 31} />
            <mesh material={mats.glint ?? (mats.glint = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 1.9) }))} position={[s * -0.003, 0.004, -0.012]} scale={0.0028}>
              <sphereGeometry args={[1, 6, 4]} />
            </mesh>
          </group>
        ))}
        {/* ears */}
        {[-1, 1].map((s) => (
          <mesh
            key={`ear${s}`}
            geometry={earGeo()}
            material={fur(DEEP)}
            position={[s * 0.083, 0.115, 0.02]}
            rotation={[0.1, s * 0.25, s * (0.25 + 0.25 * perk) + Math.sin(t * 2 + s) * 0.03]}
            scale={[0.075, 0.12, 0.07]}
            castShadow
          />
        ))}
      </group>
      {/* the tail, sweeping */}
      <mesh geometry={tail} material={fur(GOLD)} castShadow />
    </group>
  );
};

/** The ring box: navy velvet, a satin ribbon round it, tied in a bow on top. */
export const RingBox: React.FC<{ at: THREE.Vector3; rot?: THREE.Euler }> = ({ at, rot }) => {
  const velvet = mats.velvet ?? (mats.velvet = new THREE.MeshPhysicalMaterial({ color: "#1F2C46", roughness: 0.9, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color("#6A7CA8") }));
  const satin = mats.ribbon ?? (mats.ribbon = new THREE.MeshPhysicalMaterial({ color: "#F4EEE6", roughness: 0.4, sheen: 1 }));
  return (
    <group position={at} rotation={rot}>
      <mesh material={velvet} castShadow>
        <boxGeometry args={[0.055, 0.045, 0.055]} />
      </mesh>
      <mesh material={satin} scale={[1.02, 1.02, 0.2]}>
        <boxGeometry args={[0.055, 0.045, 0.055]} />
      </mesh>
      <mesh material={satin} scale={[0.2, 1.02, 1.02]}>
        <boxGeometry args={[0.055, 0.045, 0.055]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={satin} position={[s * 0.012, 0.03, 0]} rotation={[0, 0, s * 0.6]} scale={[0.014, 0.008, 0.006]}>
          <torusGeometry args={[1, 0.5, 6, 12]} />
        </mesh>
      ))}
    </group>
  );
};
