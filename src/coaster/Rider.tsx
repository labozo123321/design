import React, { useMemo } from "react";
import * as THREE from "three";
import { Head } from "./face/Head";
import { frontZ } from "./face/sculpt";
import { GRIP, Hand, OPEN, RELAX, THUMBS_UP, mixHand, skinMat, type HandPose } from "./Hand";
import { hairChain, legSwing, type ChainSpec } from "./dynamics";
import { headPose, SIS, type ArmPose, type RiderScript } from "./riders";
import { SEATS } from "./track";
import { SEAT, markRider } from "./Train";
import { BEAT, FPS, smooth } from "./world";
import { SISTER } from "./cast";

/**
 * A rider in a seat, built in the row's frame (x right, y up, z back): hips on the seat, back on the
 * backrest, thighs along the seat, shins hanging from the knees and swinging (dynamics.ts), arms reaching
 * by two-bone IK for the restraint's grips or up in the air, hands, and the head with its face and hair.
 * `noHead` is you: the camera is in your head.
 */

const mats: Record<string, THREE.Material> = {};
const cloth = (c: string, rough = 0.9) =>
  (mats[`cl${c}${rough}`] ??= markRider(new THREE.MeshStandardMaterial({ color: c, roughness: rough })));

const lathe = (key: string, pts: [number, number][]) =>
  (geoCache[key] ??= (() => {
    const g = new THREE.LatheGeometry(
      (pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts).map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    );
    g.computeVertexNormals();
    return g;
  })());
const geoCache: Record<string, THREE.BufferGeometry> = {};

// limbs along -y from the joint, metres for an adult
const UPPER_ARM: [number, number][] = [
  [0.0, 0.03],
  [0.042, 0.02],
  [0.047, 0.0],
  [0.044, -0.1],
  [0.038, -0.22],
  [0.034, -0.28],
  [0.0, -0.3],
];
const FOREARM: [number, number][] = [
  [0.0, 0.02],
  [0.036, 0.0],
  [0.039, -0.06],
  [0.033, -0.16],
  [0.026, -0.24],
  [0.0, -0.26],
];
const THIGH: [number, number][] = [
  [0.0, 0.02],
  [0.078, 0.0],
  [0.08, -0.08],
  [0.07, -0.25],
  [0.056, -0.4],
  [0.0, -0.43],
];
const SHIN: [number, number][] = [
  [0.0, 0.02],
  [0.052, 0.0],
  [0.056, -0.09],
  [0.046, -0.22],
  [0.033, -0.38],
  [0.0, -0.42],
];
const TORSO: [number, number][] = [
  [0.0, -0.04],
  [0.15, -0.04],
  [0.155, 0.06],
  [0.15, 0.2],
  [0.165, 0.34],
  [0.175, 0.44],
  [0.15, 0.5],
  [0.08, 0.54],
  [0.0, 0.55],
];

const along = (dir: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());

/** Two-bone IK: where the elbow goes for a shoulder, a wrist target, bone lengths and a pole hint. */
const ik = (S: THREE.Vector3, T: THREE.Vector3, a: number, b: number, pole: THREE.Vector3) => {
  const d0 = T.clone().sub(S);
  const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, d0.length()));
  const dir = d0.normalize();
  const W = S.clone().addScaledVector(dir, d);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
  return { E, W };
};

const Limb: React.FC<{ a: THREE.Vector3; b: THREE.Vector3; geo: THREE.BufferGeometry; len: number; mat: THREE.Material; k: number; thick?: number }> = ({
  a,
  b,
  geo,
  len,
  mat,
  k,
  thick = 1,
}) => {
  const d = b.clone().sub(a);
  const s = d.length() / len;
  return <mesh geometry={geo} material={mat} position={a} quaternion={along(d)} scale={[k * thick, s, k * thick]} castShadow />;
};

/** Where an arm wants its wrist, its elbow pole and its hand pose, for an arm pose (side -1 left, +1 right). */
const armTarget = (sc: RiderScript, side: number, S: THREE.Vector3, p: ArmPose, u: number) => {
  const x = SEATS[sc.seat];
  const k = sc.k;
  const grip = new THREE.Vector3(x + side * 0.21, SEAT.pan + 0.21, SEAT.back - 0.41);
  let T = grip.clone();
  let pole = new THREE.Vector3(side, -0.6, 0.4);
  let hand: HandPose = GRIP;
  const w = Math.min(1, Math.max(0, p.k));
  if (p.mode === "up" || p.mode === "wave") {
    const sway = p.mode === "wave" ? Math.sin(u * 2 * Math.PI * 1.8) * 0.12 : Math.sin(u * 1.3 + side) * 0.03;
    const up = S.clone().add(new THREE.Vector3(side * (0.16 + sway) * k, 0.5 * k, -0.12 * k));
    T = grip.lerp(up, w);
    pole = new THREE.Vector3(side, -0.2 + 0.4 * w, 0.4).normalize();
    hand = mixHand(GRIP, p.mode === "wave" ? OPEN : RELAX, w);
  } else if (p.mode === "thumb") {
    // a thumbs-up held up beside her head, forearm up and forward, pumping a little
    const pump = 0.015 * Math.sin(u * 2 * Math.PI * 1.2);
    const out = S.clone().add(new THREE.Vector3(side * 0.1 * k, (0.3 + pump) * k, -0.22 * k));
    T = grip.lerp(out, w);
    pole = new THREE.Vector3(side * 0.6, -1, 0.3).normalize();
    hand = mixHand(GRIP, THUMBS_UP, w);
  }
  return { T, pole, hand };
};

/** Bubblegum: a pink bubble from her lips during the hold, popping on the release (then it's on her face: see gumOn). */
/** How much of the popped bubble is on her face. */
export const gumOn = (u: number) => smooth(SIS.pop, SIS.pop + 0.05, u);

export const Gum: React.FC<{ u: number }> = ({ u }) => {
  const sh = useMemo(() => SIS_SHAPE(), []);
  const mat = useMemo(
    () =>
      markRider(
        // opaque: the motion blur's rider mask writes alpha 0, which would make a see-through bubble vanish
        new THREE.MeshPhysicalMaterial({
          color: "#FF86BC",
          roughness: 0.22,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          sheen: 0.7,
          sheenColor: new THREE.Color("#FFD6EA"),
        }),
      ),
    [],
  );
  const [b0, b1] = BEAT.bubble;
  const grow = smooth(b0 + 0.2, b1 - 0.1, u);
  const mouth = frontZ(sh, 0, sh.mouthY).p;
  if (u > b0 && u < SIS.pop) {
    const r = 0.006 + 0.066 * Math.pow(grow, 1.4);
    const wob = 1 + 0.03 * Math.sin(u * 23) * grow;
    return (
      <mesh material={mat} position={[0, sh.mouthY - 0.002, mouth.z + r * 0.92]} scale={[r * wob, r / wob, r]}>
        <sphereGeometry args={[1, 32, 24]} />
      </mesh>
    );
  }
  return null;
};
const SIS_SHAPE = () => SISTER.shape;

export const Rider: React.FC<{ sc: RiderScript; frame: number; noHead?: boolean; hi?: boolean }> = ({
  sc,
  frame,
  noHead = false,
  hi = false,
}) => {
  const u = frame / FPS;
  const x = SEATS[sc.seat];
  const k = sc.k;
  const skin = skinMat(sc.person.skin.tone);
  const top = cloth(sc.clothes.top);
  const bottom = cloth(sc.clothes.bottom);
  const legMat = sc.clothes.legs === "pants" ? bottom : skin;
  const legs = useMemo(() => [legSwing(sc.row, sc.seed * 3 + 1, 0.42 * k), legSwing(sc.row, sc.seed * 3 + 2, 0.42 * k)], [sc, k]);
  // the pose of the head (row frame), and the hair chains hanging from it
  const hp = headPose(sc, frame);
  const chains = useMemo(() => {
    const st = sc.person.hair.style;
    const sh = sc.person.shape;
    const specs: ChainSpec[] =
      st === "pigtails"
        ? [-1, 1].map((sd, i) => ({
            root: new THREE.Vector3(sd * sh.w * 0.98, sh.eyeY + 0.052, -0.03),
            out: new THREE.Vector3(sd * 0.8, 0.35, -0.45).normalize(),
            length: 0.2,
            nodes: 9,
            stiff: 0.75,
            seed: sc.seed * 10 + i,
          }))
        : st === "pony"
          ? [
              {
                root: new THREE.Vector3(0, sh.eyeY + 0.05, -sh.d * 1.05),
                out: new THREE.Vector3(0, 0.2, -1).normalize(),
                length: 0.26,
                nodes: 9,
                stiff: 0.7,
                seed: sc.seed * 10,
              },
            ]
          : [];
    return specs.map((sp, i) => hairChain(`${sc.person.name}-${i}`, sc.row, sp, (f) => headPose(sc, f)));
  }, [sc]);
  const myChains = chains.map((c) => c[Math.max(0, Math.min(c.length - 1, frame))]);
  // body
  const hipY = SEAT.pan + 0.08;
  const shoulderY = SEAT.pan + 0.56 * k;
  const torsoZ = SEAT.back - 0.13 * k;
  const arms = sc.arms(u);
  const armL = 0.3 * k;
  const foreL = 0.26 * k;
  const armEls: React.ReactNode[] = [];
  ([-1, 1] as const).forEach((side) => {
    const S = new THREE.Vector3(x + side * 0.165 * k, shoulderY, torsoZ + 0.01);
    const pose = side < 0 ? arms.L : arms.R;
    const t = armTarget(sc, side, S, pose, u);
    const { E, W } = ik(S, t.T, armL, foreL, t.pole);
    const fore = W.clone().sub(E).normalize();
    // the hand continues the forearm; the palm turns inward to the grip (or forward when up)
    const handY = fore.clone().negate();
    // (a thumbs-up keeps the fist upright, knuckles out: the same palm as the people in the queue)
    const palmWant =
      pose.mode === "thumb"
        ? new THREE.Vector3(-side, 0, 0).lerp(new THREE.Vector3(side, 0, 0), Math.min(1, pose.k)).add(new THREE.Vector3(0, 0, 1e-3))
        : new THREE.Vector3(-side, 0, 0).lerp(new THREE.Vector3(0, 0, -1), pose.mode === "grip" ? 0 : Math.min(1, pose.k));
    const handZ = palmWant.addScaledVector(handY, -palmWant.dot(handY)).normalize();
    const handX = new THREE.Vector3().crossVectors(handY, handZ);
    const hq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(handX, handY, handZ));
    armEls.push(
      <group key={side}>
        <mesh position={S} material={top} scale={0.05 * k}>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
        <Limb a={S} b={E} geo={lathe("uarm", UPPER_ARM)} len={0.3} mat={sc.clothes.sleeves === "long" ? top : skin} k={k} />
        {sc.clothes.sleeves === "short" ? (
          <Limb a={S} b={S.clone().lerp(E, 0.42)} geo={lathe("sleeve", UPPER_ARM.map(([r, y]) => [r * 1.18, y * 0.42] as [number, number]))} len={0.126} mat={top} k={k} />
        ) : null}
        <mesh position={E} material={sc.clothes.sleeves === "long" ? top : skin} scale={0.037 * k}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
        <Limb a={E} b={W} geo={lathe("farm", FOREARM)} len={0.26} mat={sc.clothes.sleeves === "long" ? top : skin} k={k} />
        <group position={W} quaternion={hq}>
          <Hand pose={t.hand} tone={sc.person.skin.tone} side={side} scale={k * 0.98} />
        </group>
      </group>,
    );
  });
  // legs: thighs along the seat, shins from the knees at the swing angle
  const legEls = ([-1, 1] as const).map((side, i) => {
    const st = legs[i][Math.max(0, Math.min(legs[i].length - 1, frame))];
    const H = new THREE.Vector3(x + side * 0.09 * k, hipY, torsoZ - 0.02);
    const K = new THREE.Vector3(x + side * 0.1 * k, SEAT.pan + 0.06, SEAT.knee - 0.04 * k);
    const a = st.knee;
    const shinDir = new THREE.Vector3(side * 0.04 + st.splay * 0.5, -Math.cos(a), -Math.sin(a)).normalize();
    const A = K.clone().addScaledVector(shinDir, 0.42 * k * 0.95);
    // the foot: points forward, toes a little out, flexing with the swing
    const footFwd = new THREE.Vector3(side * 0.18, -0.35 + 0.3 * Math.sin(a), -1).normalize();
    const fq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), footFwd);
    return (
      <group key={side}>
        <Limb a={H} b={K} geo={lathe("thigh", THIGH)} len={0.43} mat={legMat} k={k} />
        {sc.clothes.legs === "shorts" ? (
          <Limb a={H} b={H.clone().lerp(K, 0.62)} geo={lathe("shortleg", THIGH.map(([r, y]) => [r * 1.18, y * 0.62] as [number, number]))} len={0.267} mat={bottom} k={k} />
        ) : null}
        <mesh position={K} material={legMat} scale={0.05 * k}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
        <Limb a={K} b={A} geo={lathe("shin", SHIN)} len={0.42} mat={legMat} k={k} />
        <group position={A} quaternion={fq} scale={k}>
          <mesh material={cloth(sc.clothes.shoe, 0.6)} position={[0, -0.035, -0.06]} scale={[0.048, 0.042, 0.13]} castShadow>
            <sphereGeometry args={[1, 18, 12]} />
          </mesh>
          <mesh material={cloth(sc.clothes.sole, 0.7)} position={[0, -0.07, -0.06]} scale={[0.05, 0.014, 0.132]}>
            <sphereGeometry args={[1, 18, 8]} />
          </mesh>
          <mesh material={cloth(sc.clothes.legs === "pants" ? sc.clothes.bottom : "#F2F2F2", 0.9)} position={[0, 0.0, 0]} scale={[0.038, 0.04, 0.038]}>
            <sphereGeometry args={[1, 14, 10]} />
          </mesh>
        </group>
      </group>
    );
  });
  return (
    <group>
      {/* hips and torso against the backrest */}
      <mesh material={bottom} position={[x, hipY - 0.01, torsoZ + 0.01]} scale={[0.17 * k, 0.1 * k, 0.13 * k]} castShadow>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      <mesh geometry={lathe("torso", TORSO)} material={top} position={[x, hipY, torsoZ]} scale={[k, (shoulderY - hipY) / 0.5, k * 0.7]} rotation={[-0.06, 0, 0]} castShadow />
      {!noHead ? (
        <>
          {/* the neck, from between the shoulders up into the head */}
          <mesh
            material={skin}
            position={[x, (shoulderY + hp.pos.y - 0.05 * k) / 2, torsoZ + 0.012]}
            scale={[0.043 * k, Math.max(0.04, hp.pos.y - 0.05 * k - shoulderY + 0.03), 0.046 * k]}
          >
            <cylinderGeometry args={[0.92, 1.08, 1, 18]} />
          </mesh>
          <group position={hp.pos} quaternion={hp.quat}>
            <Head person={sc.person} e={sc.face(u)} hi={hi} chains={myChains} gum={sc.person.name === "sister" ? gumOn(u) : 0} />
            {sc.person.name === "sister" ? <Gum u={u} /> : null}
          </group>
        </>
      ) : null}
      {armEls}
      {legEls}
    </group>
  );
};
