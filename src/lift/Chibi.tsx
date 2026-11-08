import React, { useMemo } from "react";
import * as THREE from "three";
import { HoseGeometry } from "./hose";
import { Face, faceTexture, headGeometry } from "./faces";
import { canvasTex, flat, gloss, hash, toon } from "./toon";

/**
 * The reel's little people: a big white round head with a drawn face, a bean of a hoodie with a patch on
 * the chest, thin rubber-hose arms and legs, round shoes. About 1.25 units tall.
 *
 * Local frame: origin on the ground between the feet, +y up, +z the way they face. Their right side is
 * -x (a person facing you has their right hand on your left).
 */

export type Hair = "curly" | "spiky" | "bun" | "none" | "buzz" | "swoop";
export type Look = {
  hair: Hair;
  hairColor?: string;
  skin?: string;
  body: string;
  bodyGloss?: boolean;
  limbs?: string;
  shoes?: string;
  emblem?: "lift" | "rocket" | "none";
  glasses?: boolean;
  hat?: "hard" | "none";
  hatColor?: string;
};

export type Vec3 = [number, number, number];
export type ArmPose = { hand: Vec3; bend?: Vec3 };

export type ChibiProps = {
  look: Look;
  pos?: Vec3;
  yaw?: number;
  lean?: number;
  tilt?: number;
  bob?: number;
  squash?: number;
  head?: { yaw?: number; pitch?: number; roll?: number };
  face?: Face;
  arms?: { right?: ArmPose; left?: ArmPose };
  feet?: { right?: Vec3; left?: Vec3 };
  scale?: number;
  /** a sweat drop on the brow (0 none .. 1 full) */
  sweat?: number;
  /** stars round the head (seconds, for their spin) */
  dizzy?: number;
  shadow?: boolean;
  /** something held: drawn in the right hand */
  holding?: "mug" | "ticket" | "plug" | "none";
  /** sitting: the thighs go forward from the hips before the shins come down */
  sit?: boolean;
  /** head and body only (in a window) */
  bust?: boolean;
};

export const HEAD_R = 0.26;
export const HEAD_Y = 0.57; // head centre above the hip pivot (upper-body frame)
const HIP_Y = 0.4;
const SHOULDER: Vec3 = [0.14, 0.26, 0.0]; // upper-body frame (from the hip pivot)

// ------------------------------------------------------------------------------------------- poses
const P = (x: number, y: number, z: number): Vec3 => [x, y, z];
/** Arm poses in the upper-body frame (origin at the hip pivot), for the right arm; mirror x for the left. */
export const ARMS = {
  rest: { hand: P(-0.2, 0.02, 0.03), bend: P(-0.05, 0, -0.02) },
  hip: { hand: P(-0.16, 0.08, 0.02), bend: P(-0.12, 0.06, -0.04) },
  chin: { hand: P(-0.02, 0.36, 0.25), bend: P(-0.14, -0.08, 0.08) },
  point: { hand: P(-0.3, 0.42, 0.32), bend: P(-0.02, 0.03, 0.02) },
  pointUp: { hand: P(-0.36, 0.68, 0.1), bend: P(-0.06, 0.0, 0.0) },
  wave: { hand: P(-0.4, 0.56, 0.06), bend: P(-0.1, -0.06, 0.0) },
  cheer: { hand: P(-0.38, 0.64, 0.04), bend: P(-0.06, 0.0, 0.0) },
  hold: { hand: P(-0.07, 0.22, 0.24), bend: P(-0.12, -0.06, 0.02) },
  cross: { hand: P(0.07, 0.17, 0.17), bend: P(-0.1, -0.06, 0.08) },
  shrug: { hand: P(-0.3, 0.2, 0.1), bend: P(-0.04, -0.08, 0.0) },
  belly: { hand: P(-0.04, 0.1, 0.19), bend: P(-0.1, -0.05, 0.03) },
  cover: { hand: P(-0.04, 0.47, 0.29), bend: P(-0.12, -0.08, 0.04) },
  cheeks: { hand: P(-0.31, 0.5, 0.13), bend: P(-0.13, -0.09, 0.02) },
  front: { hand: P(-0.12, 0.2, 0.3), bend: P(-0.06, -0.06, 0.0) },
} satisfies Record<string, ArmPose>;
export type ArmName = keyof typeof ARMS;
export const mirror = (a: ArmPose): ArmPose => ({ hand: [-a.hand[0], a.hand[1], a.hand[2]], bend: a.bend ? [-a.bend[0], a.bend[1], a.bend[2]] : undefined });
export const arm = (name: ArmName, side: "right" | "left" = "right"): ArmPose => (side === "right" ? ARMS[name] : mirror(ARMS[name]));
export const mixArm = (a: ArmPose, b: ArmPose, k: number): ArmPose => {
  const m = (x: Vec3, y: Vec3): Vec3 => [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
  return { hand: m(a.hand, b.hand), bend: m(a.bend ?? [0, 0, 0], b.bend ?? [0, 0, 0]) };
};

/** A walk: feet and body for a phase (cycles) and stride. */
export const walk = (phase: number, stride = 0.22, lift = 0.07) => {
  const a = phase * Math.PI * 2;
  const foot = (off: number): Vec3 => {
    const s = Math.sin(a + off);
    const up = Math.max(0, Math.cos(a + off)) * lift;
    return [0, up, s * stride * 0.5];
  };
  const r = foot(0);
  const l = foot(Math.PI);
  return {
    feet: { right: [-0.075, r[1], r[2]] as Vec3, left: [0.075, l[1], l[2]] as Vec3 },
    bob: Math.abs(Math.sin(a)) * 0.025,
    swing: Math.sin(a),
  };
};

// ------------------------------------------------------------------------------------------- parts
const bodyGeo = (() => {
  // a bean: round bottom, widest low, narrowing to the shoulders (upper-body frame: y from -0.06 to 0.36)
  const pts: THREE.Vector2[] = [];
  const prof = (t: number) => {
    // t 0 bottom .. 1 top
    const y = -0.05 + t * 0.4;
    const r = 0.19 * Math.pow(Math.sin(Math.min(1, t * 1.05) * Math.PI * 0.94 + 0.06), 0.7) * (1 - 0.3 * t * t);
    return new THREE.Vector2(Math.max(0.001, r), y);
  };
  for (let i = 0; i <= 28; i++) pts.push(prof(i / 28));
  const g = new THREE.LatheGeometry(pts, 40);
  g.computeVertexNormals();
  return g;
})();
const bodyRadiusAt = (y: number) => {
  const t = (y + 0.05) / 0.4;
  return 0.19 * Math.pow(Math.sin(Math.min(1, t * 1.05) * Math.PI * 0.94 + 0.06), 0.7) * (1 - 0.3 * t * t);
};

const shoeGeo = (() => {
  const g = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(0.055, 0.07, 0.085);
  g.translate(0, 0, 0.015);
  return g;
})();
const soleGeo = (() => {
  const g = new THREE.CircleGeometry(1, 24);
  g.rotateX(Math.PI / 2);
  g.scale(0.055, 1, 0.085);
  g.translate(0, 0.001, 0.015);
  return g;
})();
const sphere = (r: number, w = 18, h = 12) => new THREE.SphereGeometry(r, w, h);
// the hair caps (head units): the back of the head down to just under the ears, and the crown
const CAP_BACK = new THREE.SphereGeometry(1.012, 40, 20, Math.PI - 0.35, Math.PI + 0.7, 0, Math.PI * 0.6);
const CAP_CROWN = new THREE.SphereGeometry(1.012, 40, 12, 0, Math.PI * 2, 0, Math.PI * 0.27);
const handGeo = sphere(0.034);
const lumpGeo = sphere(1, 14, 10);
const coneGeo = new THREE.ConeGeometry(1, 1, 10);

const emblemTex = (kind: "lift" | "rocket") =>
  canvasTex(`emblem|${kind}`, 128, 128, (g) => {
    g.fillStyle = "#f2f2f2";
    g.beginPath();
    g.roundRect(6, 6, 116, 116, 22);
    g.fill();
    if (kind === "lift") {
      // a ribbon going up to a little ring: the lift's mark
      g.fillStyle = "#16161c";
      g.fillRect(58, 30, 12, 72);
      g.beginPath();
      g.moveTo(64, 14);
      g.lineTo(88, 44);
      g.lineTo(40, 44);
      g.closePath();
      g.fill();
      g.fillRect(36, 100, 56, 10);
    } else {
      g.fillStyle = "#e8532d";
      g.beginPath();
      g.moveTo(64, 14);
      g.quadraticCurveTo(92, 48, 82, 92);
      g.lineTo(46, 92);
      g.quadraticCurveTo(36, 48, 64, 14);
      g.fill();
      g.fillStyle = "#f6b73c";
      g.beginPath();
      g.moveTo(52, 96);
      g.lineTo(76, 96);
      g.lineTo(64, 120);
      g.closePath();
      g.fill();
    }
  });

/** Hair lumps on the head (unit-sphere coordinates), deterministic per style. */
const hairLumps = (style: Hair): { p: THREE.Vector3; s: number; k?: number }[] => {
  const out: { p: THREE.Vector3; s: number; k?: number }[] = [];
  if (style === "none") return out;
  const n = style === "spiky" ? 70 : 170;
  for (let i = 0; i < n; i++) {
    // Fibonacci sphere
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996323;
    const p = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    // hairline: high at the front, lower round the sides and back
    const line = style === "bun" ? 0.2 + 0.32 * p.z : 0.16 + 0.34 * p.z;
    if (p.y < line) continue;
    const j = hash(i * 3.1 + (style === "curly" ? 0 : 7));
    if (style === "curly" || style === "swoop") out.push({ p: p.clone().multiplyScalar(0.94), s: 0.17 + 0.05 * j });
    else if (style === "buzz") out.push({ p: p.clone().multiplyScalar(0.95), s: 0.15 + 0.02 * j });
    else if (style === "bun") out.push({ p: p.clone().multiplyScalar(0.93), s: 0.16 + 0.03 * j });
    else out.push({ p: p.clone().multiplyScalar(0.9), s: 0.17 + 0.08 * j, k: 1 });
    // under the spikes, a dark cap of lumps so no scalp shows between them
    if (style === "spiky") out.push({ p: p.clone().multiplyScalar(0.95), s: 0.2 });
  }
  if (style === "swoop" || style === "curly") {
    // the fringe swept across the forehead, to the right of the face
    for (let i = 0; i < 6; i++) {
      const a = -0.55 + i * 0.2;
      const p = new THREE.Vector3(Math.sin(a) * 0.62, 0.66 - 0.04 * i, Math.cos(a) * 0.62);
      out.push({ p: p.multiplyScalar(1.02), s: 0.2 - 0.012 * i });
    }
  }
  if (style === "bun") out.push({ p: new THREE.Vector3(0, 0.82, -0.62), s: 0.36 });
  return out;
};

// ------------------------------------------------------------------------------------------- the rig
export const Chibi: React.FC<ChibiProps> = (pr) => {
  const look = pr.look;
  const hoses = useMemo(() => ({ armR: new HoseGeometry(12, 7), armL: new HoseGeometry(12, 7), legR: new HoseGeometry(10, 7), legL: new HoseGeometry(10, 7) }), []);
  const hair = useMemo(() => hairLumps(look.hair), [look.hair]);
  const hairMesh = useMemo(() => {
    if (!hair.length) return null;
    const mat = toon(look.hairColor ?? "#6b4026");
    const im = new THREE.InstancedMesh(lumpGeo, mat, hair.filter((h) => !h.k).length);
    const spikes = new THREE.InstancedMesh(coneGeo, mat, Math.max(1, hair.filter((h) => h.k).length));
    spikes.count = hair.filter((h) => h.k).length;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let li = 0;
    let si = 0;
    hair.forEach((h) => {
      if (h.k) {
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), h.p.clone().normalize());
        m.compose(h.p.clone().multiplyScalar(1.02), q, new THREE.Vector3(h.s * 0.75, h.s * 1.9, h.s * 0.75));
        spikes.setMatrixAt(si++, m);
      } else {
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), h.p.clone().normalize());
        m.compose(h.p, q, new THREE.Vector3(h.s, h.s * 0.82, h.s));
        im.setMatrixAt(li++, m);
      }
    });
    im.instanceMatrix.needsUpdate = true;
    spikes.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    spikes.castShadow = true;
    const g = new THREE.Group();
    g.add(im);
    if (spikes.count > 0) g.add(spikes);
    return g;
  }, [hair, look.hairColor]);

  const s = pr.scale ?? 1;
  const yaw = pr.yaw ?? 0;
  const lean = pr.lean ?? 0;
  const tilt = pr.tilt ?? 0;
  const bob = pr.bob ?? 0;
  const sq = pr.squash ?? 1;

  // upper body transform (about the hip pivot)
  const upper = new THREE.Matrix4().compose(
    new THREE.Vector3(0, HIP_Y + bob, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, 0, tilt, "YXZ")),
    new THREE.Vector3(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)),
  );
  const U = (v: Vec3) => new THREE.Vector3(...v).applyMatrix4(upper);

  // legs: hips (moving with the body) to the feet (on the ground)
  const fr = pr.feet?.right ?? [-0.075, 0, 0];
  const fl = pr.feet?.left ?? [0.075, 0, 0];
  const legs: [HoseGeometry, Vec3, number][] = [
    [hoses.legR, fr, -1],
    [hoses.legL, fl, 1],
  ];
  for (const [g, f, side] of legs) {
    const hip = U([side * 0.06, 0.02, 0]);
    const ankle = new THREE.Vector3(f[0], f[1] + 0.05, f[2] - 0.02);
    const mid = hip.clone().lerp(ankle, 0.5);
    if (pr.sit) {
      // the knee out in front at seat height; the curve's control is placed so it passes through it
      const knee = new THREE.Vector3(hip.x + side * 0.02, hip.y - 0.03, Math.max(hip.z + 0.26, ankle.z));
      mid.copy(knee).multiplyScalar(2).sub(hip.clone().add(ankle).multiplyScalar(0.5));
    } else {
      const len = hip.distanceTo(ankle);
      const slack = Math.max(0, 0.37 - len); // shorter than the leg: bend the knee forward
      mid.z += slack * 1.6 + 0.004;
      mid.x += side * slack * 0.4;
    }
    g.update(hip, mid, ankle, 0.021, 0.02);
  }
  // arms
  const armOf = (side: -1 | 1): ArmPose => (side === -1 ? pr.arms?.right ?? ARMS.rest : pr.arms?.left ?? mirror(ARMS.rest));
  const hands: THREE.Vector3[] = [];
  for (const side of [-1, 1] as const) {
    const a = armOf(side);
    const sh: Vec3 = [side * SHOULDER[0], SHOULDER[1], SHOULDER[2]];
    const p0 = U(sh);
    const p2 = U(a.hand);
    const b = a.bend ?? [0, 0, 0];
    const c = U([(sh[0] + a.hand[0]) / 2 + b[0], (sh[1] + a.hand[1]) / 2 + b[1], (sh[2] + a.hand[2]) / 2 + b[2]]);
    (side === -1 ? hoses.armR : hoses.armL).update(p0, c, p2, 0.019, 0.017);
    hands.push(p2);
  }

  const limbMat = gloss(look.limbs ?? "#1c1c22", 0.45);
  const bodyMat = look.bodyGloss === false ? toon(look.body) : gloss(look.body, 0.4);
  const shoeMat = gloss(look.shoes ?? "#17171b", 0.3);
  const skin = look.skin ?? "#f4f2ee";
  const faceTex = faceTexture({ skin, ...(pr.face ?? {}) });
  const faceMat = toon("#ffffff", { map: faceTex, emissive: "#ffffff", ei: 0.22, emap: true });
  const headY = HEAD_Y;
  const hd = pr.head ?? {};
  const shadow = pr.shadow ?? true;
  const ry = bodyRadiusAt(0.2);

  return (
    <group position={pr.pos ?? [0, 0, 0]} rotation={[0, yaw, 0]} scale={s}>
      {/* shoes */}
      {(pr.bust ? [] : [fr, fl]).map((f, i) => (
        <group key={i} position={[f[0], f[1], f[2]]} rotation={[0, i === 0 ? -0.08 : 0.08, 0]}>
          <mesh geometry={shoeGeo} material={shoeMat} castShadow={shadow} />
          <mesh geometry={soleGeo} material={flat("#0c0c0f")} />
        </group>
      ))}
      {!pr.bust ? <mesh geometry={hoses.legR} material={limbMat} castShadow={shadow} /> : null}
      {!pr.bust ? <mesh geometry={hoses.legL} material={limbMat} castShadow={shadow} /> : null}
      <mesh geometry={hoses.armR} material={limbMat} castShadow={shadow} />
      <mesh geometry={hoses.armL} material={limbMat} castShadow={shadow} />
      {hands.map((h, i) => (
        <mesh key={i} geometry={handGeo} material={limbMat} position={h} castShadow={shadow} />
      ))}
      {pr.holding === "mug" ? (
        <group position={hands[0]}>
          <mesh position={[0.0, 0.03, 0.03]} material={toon("#f3f3f3")}>
            <cylinderGeometry args={[0.045, 0.04, 0.1, 18]} />
          </mesh>
          <mesh position={[0.0, 0.079, 0.03]} rotation={[-Math.PI / 2, 0, 0]} material={flat("#5a3b28")}>
            <circleGeometry args={[0.04, 18]} />
          </mesh>
        </group>
      ) : null}
      {pr.holding === "plug" ? (
        <group position={hands[0]} scale={1.7}>
          <mesh position={[0.02, 0.04, 0.05]} material={toon("#f4f4f4")}>
            <boxGeometry args={[0.13, 0.11, 0.09]} />
          </mesh>
          {[-1, 1].map((sd) => (
            <mesh key={sd} position={[0.02 + sd * 0.03, 0.04, 0.12]} material={gloss("#c9b46a", 0.3)}>
              <boxGeometry args={[0.012, 0.03, 0.06]} />
            </mesh>
          ))}
          <mesh position={[0.02, -0.18, 0.02]} material={gloss("#1c1c22", 0.4)}>
            <cylinderGeometry args={[0.012, 0.012, 0.36, 6]} />
          </mesh>
        </group>
      ) : null}
      {pr.holding === "ticket" ? (
        <mesh position={[hands[0].x, hands[0].y + 0.06, hands[0].z + 0.02]} rotation={[0, 0, 0.2]} material={toon("#ffd447", { side: THREE.DoubleSide })}>
          <planeGeometry args={[0.1, 0.14]} />
        </mesh>
      ) : null}
      {/* the upper body */}
      <group matrixAutoUpdate={false} matrix={upper}>
        <mesh geometry={bodyGeo} material={bodyMat} castShadow={shadow} receiveShadow />
        {look.emblem && look.emblem !== "none" ? (
          <mesh position={[0, 0.2, ry + 0.004]} rotation={[-0.12, 0, 0]} material={flat("#ffffff", 1, { map: emblemTex(look.emblem) })}>
            <planeGeometry args={[0.07, 0.07]} />
          </mesh>
        ) : null}
        {/* the head */}
        <group position={[0, headY - 0.02, 0]} rotation={new THREE.Euler(hd.pitch ?? 0, hd.yaw ?? 0, hd.roll ?? 0, "YXZ")}>
          <group position={[0, 0.02, 0]} scale={[HEAD_R, HEAD_R * 0.96, HEAD_R]}>
            <mesh geometry={headGeometry()} material={faceMat} castShadow={shadow} receiveShadow />
            {hairMesh ? <primitive object={hairMesh} /> : null}
            {look.hair !== "none" ? (
              // a cap of hair colour under the lumps: the back of the head and the crown, so no scalp shows
              <group>
                <mesh material={toon(look.hairColor ?? "#6b4026")} geometry={CAP_BACK} />
                <mesh material={toon(look.hairColor ?? "#6b4026")} geometry={CAP_CROWN} />
              </group>
            ) : null}
            {look.glasses ? (
              <group>
                {[-1, 1].map((sd) => (
                  <mesh key={sd} position={[sd * 0.32, 0.09, 0.99]} material={gloss("#14141a", 0.3)}>
                    <torusGeometry args={[0.18, 0.03, 8, 28]} />
                  </mesh>
                ))}
                <mesh position={[0, 0.12, 1.0]} rotation={[0, 0, Math.PI / 2]} material={gloss("#14141a", 0.3)}>
                  <cylinderGeometry args={[0.022, 0.022, 0.28, 8]} />
                </mesh>
              </group>
            ) : null}
            {look.hat === "hard" ? (
              <group position={[0, 0.2, -0.02]} rotation={[-0.08, 0, 0]}>
                <mesh material={toon(look.hatColor ?? "#f6c32c")} castShadow={shadow} scale={[1.08, 0.9, 1.1]}>
                  <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
                <mesh position={[0, 0.02, 0.12]} material={toon(look.hatColor ?? "#f6c32c")} scale={[1.28, 1, 1.38]}>
                  <cylinderGeometry args={[1, 1, 0.05, 32]} />
                </mesh>
                <mesh position={[0, 0.82, 0]} material={toon(look.hatColor ?? "#f6c32c")} scale={[0.18, 0.12, 0.9]}>
                  <sphereGeometry args={[1, 12, 8]} />
                </mesh>
              </group>
            ) : null}
            {(pr.sweat ?? 0) > 0.01 ? (
              <group position={[0.62, 0.42, 0.72]} rotation={[0, 0, -0.25]} scale={(pr.sweat ?? 0) * 0.16}>
                <mesh material={toon("#7fd0ff", { emissive: "#2a8fd6", ei: 0.25 })}>
                  <sphereGeometry args={[1, 16, 12]} />
                </mesh>
                <mesh position={[0, 1.15, 0]} material={toon("#7fd0ff", { emissive: "#2a8fd6", ei: 0.25 })}>
                  <coneGeometry args={[0.86, 1.4, 16]} />
                </mesh>
              </group>
            ) : null}
            {pr.dizzy !== undefined
              ? [0, 1, 2].map((i) => {
                  const a = pr.dizzy! * 3.2 + (i * Math.PI * 2) / 3;
                  return (
                    <mesh key={i} position={[Math.cos(a) * 0.95, 1.12 + 0.06 * Math.sin(a * 2), Math.sin(a) * 0.95]} rotation={[0, a, 0]} material={flat("#ffd84a", 1.6)}>
                      <octahedronGeometry args={[0.13, 0]} />
                    </mesh>
                  );
                })
              : null}
          </group>
        </group>
      </group>
    </group>
  );
};

/** Looks for the cast. */
export const CAST = {
  you: { hair: "swoop", hairColor: "#6e4127", body: "#1d1d23", emblem: "lift" } as Look,
  rivalA: { hair: "spiky", hairColor: "#1a1a20", body: "#3d6fd6", bodyGloss: false, glasses: true, emblem: "rocket", limbs: "#1c1c22" } as Look,
  rivalB: { hair: "curly", hairColor: "#2a1d16", body: "#e2e6ee", bodyGloss: false, emblem: "rocket" } as Look,
  worker: (i: number): Look => ({ hair: "none", body: ["#2f5fb8", "#3a3f4a", "#2b8a6e", "#d8692c"][i % 4], bodyGloss: false, hat: "hard", emblem: "lift" }),
  scientist: { hair: "bun", hairColor: "#7a4a2a", body: "#f2f2f2", bodyGloss: false, emblem: "lift" } as Look,
  crowd: (i: number): Look => ({
    hair: (["curly", "spiky", "bun", "buzz", "none"] as Hair[])[i % 5],
    hairColor: ["#2a1d16", "#6e4127", "#1a1a20", "#b5763a", "#3b2a20"][(i * 7) % 5],
    body: ["#e5484d", "#f5a524", "#3e9b4f", "#2f6fd6", "#8e4ec6", "#f2f2f2", "#ea6aa8", "#2bb3a8"][(i * 3) % 8],
    bodyGloss: false,
  }),
};
