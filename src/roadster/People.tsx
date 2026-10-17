import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Figure, type Outfit, type Pose } from "../wedding/Figure";
import { Person3D, type Stance } from "../coaster/Person3D";
import type { Person } from "../coaster/face/Head";
import { ADULT_F, ADULT_M } from "../coaster/face/sculpt";
import { NEUTRAL } from "../coaster/face/sculpt";
import { GRIP, OPEN, RELAX, THUMBS_UP, mixHand, type HandPose } from "../coaster/Hand";
import { CardHair, type Cut } from "../looks/Hair";
import { M, mat } from "./materials";
import { PCUE, carAt } from "./path";
import { BARRIER_X } from "./Venue";
import { hash, smooth, smoother, vnoise } from "./timeline";

/**
 * The people: the crowd behind the barrier (reservation holders, phones up, a lot of them with the
 * flashlight on), cheering at the big moments; the starter who counts you down on her fingers; the crew by
 * the car; the front row where the car stops; and the man at the folding table with a game controller.
 */

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------ the crowd
const SKIN = ["#F4D2B6", "#EDC3A2", "#E2B08C", "#D49E78", "#BF8762", "#9A6844", "#7A4E32", "#5E3A26"];
const HAIR = ["#16110D", "#2A1C12", "#3E2716", "#5A3A20", "#7A4E2A", "#9A6A3A", "#C8A060", "#2E2A26", "#0E0E10"];
const TOPS = ["#121316", "#1E2230", "#2B2F38", "#3A4250", "#5A606A", "#8C1C24", "#1E3A6A", "#E8E8EA", "#4A5A3A", "#6A4A3A", "#202A3A", "#C9A24A"];
const BOTTOMS = ["#1A1C22", "#24324A", "#2E2E32", "#3A3E48", "#5A5040"];

type CrowdMember = { at: THREE.Vector3; yaw: number; k: number; top: string; bottom: string; skin: string; hair: string; phone: boolean; flash: boolean; seed: number };

/** Places in the crowd taken by the hand-built people (left clear in the instanced crowd). */
const RESERVED: THREE.Vector3[] = [];

const crowdMembers = (): CrowdMember[] => {
  const out: CrowdMember[] = [];
  let i = 0;
  // rows behind the barrier, denser through the middle
  for (let row = 0; row < 7; row++) {
    const x = BARRIER_X - 0.75 - row * 0.85;
    for (let z = 18; z > -122; z -= 0.72 + hash(row * 31 + z) * 0.35) {
      const mid = Math.exp(-(((z + 55) / 55) ** 2));
      if (hash(row * 7.7 + z * 1.3) > 0.3 + 0.7 * mid) continue;
      const p = V3(x + (hash(z * 3.1 + row) - 0.5) * 0.5, 0, z + (hash(z * 5.3 + row) - 0.5) * 0.3);
      if (RESERVED.some((r) => r.distanceTo(p) < 0.9)) continue;
      const s = hash(i * 13.7 + 1.1);
      // facing the pad (east), turned a little toward the middle of things
      const yaw = -Math.PI / 2 + (hash(i * 3.3) - 0.5) * 0.7 + (z + 55) * 0.004;
      out.push({
        at: p,
        yaw,
        k: 0.92 + hash(i * 2.9) * 0.16,
        top: TOPS[Math.floor(hash(i * 4.1) * TOPS.length)],
        bottom: BOTTOMS[Math.floor(hash(i * 5.7) * BOTTOMS.length)],
        skin: SKIN[Math.floor(hash(i * 6.3) * SKIN.length)],
        hair: HAIR[Math.floor(hash(i * 7.9) * HAIR.length)],
        phone: s < 0.55,
        flash: s < 0.22,
        seed: s,
      });
      i++;
    }
  }
  return out;
};

/** How hard the crowd is cheering at world time w. */
export const cheerAt = (w: number) => {
  const pulse = (a: number, up: number, hold: number, down: number) => smooth(a - up, a, w) * (1 - smooth(a + hold, a + hold + down, w));
  let c = 0;
  c = Math.max(c, 0.7 * pulse(PCUE.launch1 + 0.2, 0.3, 1.2, 1.0));
  c = Math.max(c, pulse(PCUE.release, 0.4, 2.8, 1.2));
  c = Math.max(c, pulse(PCUE.lift2, 0.3, 30, 1));
  return c;
};

export const Crowd: React.FC<{ w: number; k?: number }> = ({ w, k = 1 }) => {
  const sys = useMemo(() => {
    const members = crowdMembers();
    const n = members.length;
    const cap = (r: number, l: number, x: number, y: number, z: number, rx = 0, rz = 0) => {
      const g = new THREE.CapsuleGeometry(r, l, 4, 8);
      g.rotateX(rx);
      g.rotateZ(rz);
      g.translate(x, y, z);
      return g;
    };
    const legs = mergeGeometries([cap(0.07, 0.72, -0.1, 0.46, 0), cap(0.07, 0.72, 0.1, 0.46, 0)]);
    const torso = new THREE.CapsuleGeometry(0.17, 0.42, 4, 12);
    torso.scale(1, 1, 0.68);
    torso.translate(0, 1.16, 0);
    const head = new THREE.SphereGeometry(0.105, 12, 10);
    head.scale(0.95, 1.12, 1.02);
    head.translate(0, 1.61, 0);
    const hair = new THREE.SphereGeometry(0.112, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    hair.translate(0, 1.63, 0.012);
    const armsDown = mergeGeometries([cap(0.045, 0.5, -0.24, 1.08, 0.02, 0, -0.08), cap(0.045, 0.5, 0.24, 1.08, 0.02, 0, 0.08)]);
    // the right arm up holding a phone in front of the face (forward is -z)
    const armPhone = mergeGeometries([cap(0.045, 0.5, -0.24, 1.08, 0.02, 0, -0.08), cap(0.045, 0.42, 0.13, 1.5, -0.2, -1.1, 0.3)]);
    const armsUp = mergeGeometries([cap(0.045, 0.52, -0.26, 1.72, -0.04, 0.15, 0.32), cap(0.045, 0.52, 0.26, 1.72, -0.04, 0.15, -0.32)]);
    const phone = new THREE.BoxGeometry(0.075, 0.15, 0.012);
    phone.translate(0.06, 1.72, -0.42);
    const flash = new THREE.CircleGeometry(0.012, 8);
    flash.rotateY(Math.PI);
    flash.translate(0.08, 1.77, -0.43);
    const screen = new THREE.PlaneGeometry(0.066, 0.135);
    screen.translate(0.06, 1.72, -0.413);
    const cloth = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const skinM = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const hairM = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const mk = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const im = new THREE.InstancedMesh(g, m, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      return im;
    };
    const parts = {
      legs: mk(legs, cloth),
      torso: mk(torso, cloth),
      head: mk(head, skinM),
      hair: mk(hair, hairM),
      armsDown: mk(armsDown, cloth),
      armPhone: mk(armPhone, cloth),
      armsUp: mk(armsUp, cloth),
      phone: mk(phone, M.black()),
      screen: mk(screen, M.light("crowdScreen", "#C8DCFF", 1.6)),
      flash: mk(flash, M.light("crowdFlash", "#FFFFFF", 22)),
    };
    const c = new THREE.Color();
    members.forEach((m, i) => {
      parts.legs.setColorAt(i, c.set(m.bottom));
      parts.torso.setColorAt(i, c.set(m.top));
      parts.armsDown.setColorAt(i, c.set(m.top));
      parts.armPhone.setColorAt(i, c.set(m.top));
      parts.armsUp.setColorAt(i, c.set(m.top));
      parts.head.setColorAt(i, c.set(m.skin));
      parts.hair.setColorAt(i, c.set(m.hair));
    });
    return { members, parts };
  }, []);
  const cheer = cheerAt(w) * k;
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const q = new THREE.Quaternion();
  const P = sys.parts;
  sys.members.forEach((m, i) => {
    const mine = cheer * (0.4 + 0.6 * m.seed);
    const hop = Math.max(0, Math.sin(w * (7 + m.seed * 3) + m.seed * 20)) * 0.06 * mine;
    const sway = vnoise(w * 0.5 + m.seed * 10, 3) * 0.05;
    q.setFromEuler(new THREE.Euler(0, m.yaw + sway, 0));
    m4.compose(V3(m.at.x, hop, m.at.z), q, V3(m.k, m.k, m.k));
    for (const key of ["legs", "torso", "head", "hair"] as const) P[key].setMatrixAt(i, m4);
    const up = mine > 0.35 && !m.phone;
    const phoneUp = m.phone;
    P.armsUp.setMatrixAt(i, up ? m4 : zero);
    P.armPhone.setMatrixAt(i, phoneUp ? m4 : zero);
    P.armsDown.setMatrixAt(i, !up && !phoneUp ? m4 : zero);
    P.phone.setMatrixAt(i, phoneUp ? m4 : zero);
    P.screen.setMatrixAt(i, phoneUp ? m4 : zero);
    P.flash.setMatrixAt(i, phoneUp && m.flash ? m4 : zero);
  });
  for (const im of Object.values(P)) im.instanceMatrix.needsUpdate = true;
  return (
    <group>
      {Object.values(P).map((im, i) => (
        <primitive key={i} object={im} />
      ))}
    </group>
  );
};

// ---------------------------------------------------------------------------------- props for people
/** A headset over the head (head space: origin between the ears at eye level, facing +z). */
export const Headset: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <group>
    <mesh material={M.black()} position={[0, h * 0.3, -0.005]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[w * 1.14, 0.007, 6, 24, Math.PI]} />
    </mesh>
    {[-1, 1].map((s) => (
      <mesh key={s} material={M.black()} position={[s * (w * 1.1), 0.0, -0.005]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.038, 0.038, 0.03, 18]} />
      </mesh>
    ))}
    {/* the mic boom from the left cup round to the mouth */}
    <mesh material={M.black()} position={[-w * 0.75, -0.055, 0.05]} rotation={[0.2, -0.75, 0]} scale={[0.005, 0.005, 0.11]}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
    <mesh material={M.black()} position={[-w * 0.38, -0.068, 0.088]} scale={0.011}>
      <sphereGeometry args={[1, 8, 6]} />
    </mesh>
  </group>
);

/** A game controller (held level in front of the body; its own frame: x across, y up, -z away). */
export const Gamepad: React.FC = () => {
  const body = mat("pad", () => new THREE.MeshPhysicalMaterial({ color: "#F2F3F5", roughness: 0.4, clearcoat: 0.4 }));
  return (
    <group>
      <mesh material={body} scale={[0.085, 0.022, 0.05]}>
        <sphereGeometry args={[1, 20, 12]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={body} position={[s * 0.06, -0.008, 0.035]} rotation={[0.5, 0, s * 0.3]} scale={[0.028, 0.022, 0.045]}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`st${s}`} material={M.gloss()} position={[s * 0.03, 0.022, s * 0.008]}>
          <cylinderGeometry args={[0.011, 0.011, 0.012, 12]} />
        </mesh>
      ))}
      {(["#3FB950", "#E5534B", "#3B82F6", "#E3B341"] as const).map((c, i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <mesh key={c} material={M.light(`padBtn${i}`, c, 1.2)} position={[0.058 + Math.cos(a) * 0.009, 0.02, -0.008 + Math.sin(a) * 0.009]}>
            <sphereGeometry args={[0.0042, 8, 6]} />
          </mesh>
        );
      })}
    </group>
  );
};

// --------------------------------------------------------------------------------------- the cast
const crewOutfit = (main: string): Outfit => ({ kind: "hoodie", main, trousers: "#1A1C22", sleeves: "long", shoe: "#101012" });

const STARTER: Person = {
  name: "starter",
  shape: { ...ADULT_F, cheek: 0.45, earK: 1.6, lipK: 1.1, eyeOpen: 0.05, muzzle: 0.5 },
  skin: { tone: "#C98F68", blush: 0.6, freckles: 0.1, lip: "#A85A56", seed: 71, browTint: "#21150E" },
  iris: "#3A2414",
  hair: { style: "base", color: "#1A120C" },
  brow: "#1E140E",
  lashes: 1.0,
};
const OPERATOR: Person = {
  name: "operator",
  shape: { ...ADULT_M, cheek: 0.55, jaw: 0.7, earK: 1.8, lipK: 1.05, eyeOpen: 0.04, muzzle: 0.6 },
  skin: { tone: "#E2B08C", blush: 0.7, freckles: 0.15, lip: "#B07468", seed: 72, browTint: "#3E2716" },
  iris: "#4A6A8A",
  hair: { style: "base", color: "#3E2716" },
  brow: "#3E2716",
  lashes: 0.3,
  stubble: 0.55,
};
const CREW_A: Person = {
  name: "crewA",
  shape: { ...ADULT_M, jaw: 0.8, earK: 1.8, muzzle: 0.6 },
  skin: { tone: "#8A5A3C", blush: 0.4, freckles: 0, lip: "#7A4A3C", seed: 73, browTint: "#120C08" },
  iris: "#2A1A10",
  hair: { style: "fade", color: "#120C08" },
  brow: "#120C08",
  lashes: 0.3,
  stubble: 0.3,
};
const CREW_B: Person = {
  name: "crewB",
  shape: { ...ADULT_F, earK: 1.6, muzzle: 0.5 },
  skin: { tone: "#F1CBAE", blush: 0.8, freckles: 0.4, lip: "#C26468", seed: 74, browTint: "#7A4E2A" },
  iris: "#56743F",
  hair: { style: "base", color: "#7A4E2A" },
  brow: "#6A4428",
  lashes: 0.9,
};

const Cast: React.FC<{ who: Person; outfit: Outfit; cut?: Cut; cutColor?: string; pose: Pose; at: THREE.Vector3; yaw: number; t: number; k?: number; headset?: boolean; hi?: boolean; children?: React.ReactNode }> = ({ who, outfit, cut, cutColor, pose, at, yaw, t, k = 1, headset, hi = true, children }) => (
  <Figure
    who={who}
    outfit={outfit}
    k={k}
    pose={pose}
    at={at}
    yaw={yaw}
    t={t}
    hi={hi}
    headExtra={
      <>
        {cut ? <CardHair sh={who.shape} cut={cut} color={cutColor ?? who.hair.color} params={{ t }} /> : null}
        {headset ? <Headset w={who.shape.w} h={who.shape.h} /> : null}
      </>
    }
  >
    {children}
  </Figure>
);

const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

// the count: three, two, one on her fingers, then the arm down the track
const FINGERS: Record<number, HandPose> = {
  3: { curl: [0.02, 0.02, 0.05, 1.5], spread: 0.3, thumbOut: 0.05, thumbCurl: 1.1 },
  2: { curl: [0.02, 0.02, 1.5, 1.5], spread: 0.35, thumbOut: 0.05, thumbCurl: 1.1 },
  1: { curl: [0.02, 1.5, 1.5, 1.5], spread: 0.1, thumbOut: 0.05, thumbCurl: 1.1 },
};

export const STARTER_AT = V3(-3.2, 0, -8.2);

export const Starter: React.FC<{ w: number }> = ({ w }) => {
  const C = PCUE;
  const driver = V3(-0.36, 0.98, 0.1);
  const yaw0 = yawTo(STARTER_AT, driver);
  // after the go she turns to watch it go
  const watch = smooth(C.go + 0.1, C.go + 0.8, w);
  const yaw = yaw0 + (Math.PI * 0.85 - (yaw0 - Math.PI)) * 0 + watch * 0.9;
  const k = 0.96;
  const hipY = 0.93 * k;
  const raise = smooth(C.count3 - 0.55, C.count3 - 0.15, w);
  const go = smooth(C.go - 0.05, C.go + 0.2, w);
  const n = w < C.count2 ? 3 : w < C.count1 ? 2 : 1;
  const hand: HandPose = go > 0.5 ? OPEN : raise > 0.5 ? FINGERS[n] : RELAX;
  // the arm: up by her head, palm to the car; at the go it sweeps down and out, pointing up the track
  const upAt = V3(0.24, hipY + 0.78, -0.18);
  const goAt = V3(0.5, hipY + 0.35, -0.42);
  const restAt = V3(0.22, hipY - 0.02, 0.0);
  const at = restAt.clone().lerp(upAt, raise).lerp(goAt, go);
  // a little pump on each count
  const beat = [C.count3, C.count2, C.count1].reduce((a, t) => a + Math.exp(-Math.max(0, w - t) / 0.12) * (w >= t ? 1 : 0), 0);
  at.y += 0.04 * beat * (1 - go);
  const pose: Pose = {
    e: { ...NEUTRAL, smile: 0.25 + 0.4 * go, brow: 0.2 * raise },
    look: w < C.go + 0.2 ? driver : null,
    headYaw: 0.4 * watch,
    armR: { at, hand, palm: go > 0.5 ? V3(0, -0.6, -1) : V3(0, 0, -1), pole: V3(1, -0.4, 0.4) },
    armL: { at: V3(-0.2, hipY + 0.05, -0.12), hand: mixHand(RELAX, GRIP, 0.3), palm: V3(1, 0, 0), pole: V3(-1, -1, 0.2) },
    holdL: "phone",
  };
  return <Cast who={STARTER} outfit={{ ...crewOutfit("#121316"), female: true, bust: true }} cut="pony" cutColor="#1A120C" pose={pose} at={STARTER_AT} yaw={yaw} t={w} k={k} headset />;
};

/** The crew by the car as you walk up: one gives you a nod and a thumbs-up, one checks the car. */
export const Crew: React.FC<{ w: number; you: THREE.Vector3 }> = ({ w, you }) => {
  const aAt = V3(-3.3, 0, -0.2);
  const bAt = V3(-2.4, 0, -3.9);
  const k = 1.0;
  const hipY = 0.93 * k;
  const thumb = smooth(1.2, 1.6, w) * (1 - smooth(3.0, 3.4, w));
  const poseA: Pose = {
    e: { ...NEUTRAL, smile: 0.5 + 0.3 * thumb },
    look: you,
    armR: { at: V3(0.18, hipY + 0.25 + 0.18 * thumb, -0.3), hand: thumb > 0.5 ? THUMBS_UP : RELAX, palm: V3(-1, 0, 0), pole: V3(1, -0.6, 0.3) },
    armL: { at: V3(-0.12, hipY + 0.2, -0.28), hand: GRIP, palm: V3(0.3, 1, 0), pole: V3(-1, -1, 0.2) },
    holdL: "phone",
  };
  const poseB: Pose = {
    e: { ...NEUTRAL, smile: 0.2, brow: 0.1 },
    look: V3(0.6, 0.6, -1.2),
    lean: 0.18,
    armR: { at: V3(0.16, hipY + 0.22, -0.32), hand: GRIP, palm: V3(-0.3, 1, 0), pole: V3(1, -1, 0.2) },
    armL: { at: V3(-0.25, hipY + 0.5, -0.05), hand: mixHand(RELAX, OPEN, 0.5), palm: V3(1, 0, 0), pole: V3(-1, -0.3, 0.3) },
    holdR: "phone",
  };
  return (
    <>
      <Cast who={CREW_A} outfit={crewOutfit("#16171A")} pose={poseA} at={aAt} yaw={yawTo(aAt, you)} t={w} headset />
      <Cast who={CREW_B} outfit={{ ...crewOutfit("#16171A"), female: true, bust: true }} cut="bun" cutColor="#7A4E2A" pose={poseB} at={bAt} yaw={yawTo(bAt, V3(0.5, 0, -1.2))} t={w} headset />
    </>
  );
};

/** The operator at his folding table by the barrier: the laptop, two antennas on tripods, a road case to sit
 * on, and the controller in his hands. When the driver looks round at him: he looks up, freezes, grins,
 * thumbs up. */
export const OPERATOR_AT = V3(-22.1, 0, -97.7);
export const Operator: React.FC<{ w: number }> = ({ w }) => {
  const C = PCUE;
  const car = carAt(w);
  const driverEye = V3(-0.36, 0.98, 0.1).applyQuaternion(car.quat).add(car.pos);
  const yaw = yawTo(OPERATOR_AT, car.pos);
  // his story (world time from when the car creeps)
  const t0 = C.creep0;
  const steering = w < t0 + 2.7 ? 1 : 0;
  const looksUp = smooth(t0 + 2.2, t0 + 2.6, w);
  const caught = smooth(t0 + 2.7, t0 + 2.9, w);
  const grin = smooth(t0 + 3.3, t0 + 3.8, w);
  const thumb = smooth(t0 + 3.6, t0 + 4.0, w);
  const hipY = 0.5;
  // the controller at his lap, tilting as he steers it
  const steerWob = steering * Math.sin(w * 2.3) * 0.12 + steering * smooth(t0, t0 + 0.4, w) * (1 - smooth(t0 + 1.7, t0 + 2.4, w)) * 0.25;
  const padAt = V3(0, hipY + 0.2, -0.3);
  const lAt = padAt.clone().add(V3(-0.075, -0.012, 0.03));
  const rAt0 = padAt.clone().add(V3(0.075, -0.012, 0.03));
  const rUp = V3(0.2, hipY + 0.55, -0.3);
  const rAt = rAt0.clone().lerp(rUp, thumb);
  const pose: Pose = {
    sit: true,
    lift: -0.06,
    lean: 0.32 * (1 - looksUp) + 0.08 - 0.1 * caught,
    roll: steerWob * 0.6 * (1 - looksUp),
    e: { ...NEUTRAL, squint: 0.25 * (1 - caught), tongue: 0.6 * steering * (1 - looksUp), brow: 0.6 * caught * (1 - grin) - 0.1, jaw: 0.25 * caught * (1 - grin), smile: 0.85 * grin, eyePitch: -0.25 * (1 - looksUp) },
    look: looksUp > 0.5 ? driverEye : padAt.clone().applyAxisAngle(V3(0, 1, 0), yaw).add(OPERATOR_AT),
    armL: { at: lAt, hand: GRIP, palm: V3(0.4, 1, 0), pole: V3(-1, -1, 0.2) },
    armR: { at: rAt, hand: thumb > 0.5 ? THUMBS_UP : GRIP, palm: thumb > 0.5 ? V3(-1, 0, 0) : V3(-0.4, 1, 0), pole: V3(1, -1, 0.2) },
    feet: [V3(-0.14, 0.08, -0.42), V3(0.16, 0.08, -0.38)],
  };
  return (
    <group>
      <Cast who={OPERATOR} outfit={crewOutfit("#2B2F38")} cut="short" cutColor="#3E2716" pose={pose} at={OPERATOR_AT} yaw={yaw} t={w} headset>
        {/* the controller in his hands */}
        <group position={padAt.clone().add(V3(0, 0.0, 0.0))} rotation={[0.35, 0, steerWob]}>
          <Gamepad />
        </group>
        {/* the road case he sits on */}
        <mesh material={mat("roadcase", () => new THREE.MeshStandardMaterial({ color: "#1A1B1F", roughness: 0.5, metalness: 0.3 }))} position={[0, 0.24, 0.1]} scale={[0.6, 0.48, 0.45]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
        {/* the table beside him: the laptop open, its screen lit */}
        <group position={[0.75, 0, -0.1]}>
          <mesh material={M.black()} position={[0, 0.72, 0]} scale={[0.7, 0.03, 0.55]}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={M.steel()} position={[s * 0.3, 0.36, 0]} scale={[0.02, 0.72, 0.02]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
          ))}
          <mesh material={mat("laptop", () => new THREE.MeshStandardMaterial({ color: "#8A8E96", metalness: 0.8, roughness: 0.35 }))} position={[0, 0.745, 0.02]} scale={[0.34, 0.012, 0.24]}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
          <group position={[0, 0.75, -0.1]} rotation={[-0.25, 0, 0]}>
            <mesh material={mat("laptop", () => new THREE.MeshStandardMaterial({ color: "#8A8E96", metalness: 0.8, roughness: 0.35 }))} position={[0, 0.11, 0]} scale={[0.34, 0.22, 0.008]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
            <mesh material={M.light("laptopScreen", "#7FB0FF", 1.5)} position={[0, 0.11, 0.0045]}>
              <planeGeometry args={[0.31, 0.19]} />
            </mesh>
          </group>
        </group>
        {/* two antennas on tripods */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 1.3, 0, 0.9]}>
            {[0, 1, 2].map((i) => (
              <mesh key={i} material={M.black()} position={[Math.cos((i / 3) * Math.PI * 2) * 0.22, 0.6, Math.sin((i / 3) * Math.PI * 2) * 0.22]} rotation={[Math.sin((i / 3) * Math.PI * 2) * 0.35, 0, -Math.cos((i / 3) * Math.PI * 2) * 0.35]}>
                <cylinderGeometry args={[0.012, 0.012, 1.25, 6]} />
              </mesh>
            ))}
            <mesh material={M.black()} position={[0, 1.45, 0]}>
              <cylinderGeometry args={[0.014, 0.014, 0.9, 6]} />
            </mesh>
            <mesh material={mat("antenna", () => new THREE.MeshStandardMaterial({ color: "#E8E8EA", roughness: 0.6 }))} position={[0, 1.95, 0]} scale={[0.22, 0.3, 0.05]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
            <mesh material={M.light(`antLed${s}`, "#3BFF6A", 2.5)} position={[0.08, 2.08, -0.03]} scale={0.012}>
              <sphereGeometry args={[1, 8, 6]} />
            </mesh>
          </group>
        ))}
      </Cast>
    </group>
  );
};

// ------------------------------------------------------------------------------------- the front row
type Fan = { at: THREE.Vector3; who: Person; clothes: { top: string; bottom: string; legs: "pants"; sleeves: "long" | "short"; shoe: string; sole: string }; stance: Stance; k: number };

const fanPerson = (i: number): Person => {
  const r = (n: number) => hash(i * 17.3 + n * 3.7 + 0.5);
  const woman = r(1) < 0.45;
  const base = woman ? ADULT_F : ADULT_M;
  const tone = SKIN[Math.floor(r(5) * SKIN.length)];
  const hairCol = HAIR[Math.floor(r(7) * HAIR.length)];
  return {
    name: `fan${i}`,
    shape: { ...base, w: base.w * (0.96 + r(3) * 0.08), h: base.h * (0.97 + r(4) * 0.06) },
    skin: { tone, blush: 0.3 + r(9) * 0.6, freckles: r(10) < 0.25 ? r(11) * 0.6 : 0, lip: woman ? "#B8606A" : "#A87064", seed: 80 + i, browTint: hairCol },
    iris: ["#3A2A1A", "#4A3A26", "#3E62A0", "#56743F"][Math.floor(r(13) * 4)],
    hair: { style: woman ? (r(8) < 0.5 ? "long" : "pony") : r(8) < 0.5 ? "short" : "buzz", color: hairCol },
    brow: hairCol,
    lashes: woman ? 0.9 : 0.3,
    stubble: !woman && r(16) < 0.5 ? 0.4 : 0,
  };
};

const makeFans = (spots: [number, number, Stance][], seed: number): Fan[] =>
  spots.map(([x, z, stance], i) => {
    const r = (n: number) => hash((seed + i) * 9.1 + n * 1.3);
    const p = V3(x, 0, z);
    RESERVED.push(p);
    return {
      at: p,
      who: fanPerson(seed + i),
      clothes: { top: TOPS[Math.floor(r(1) * TOPS.length)], bottom: BOTTOMS[Math.floor(r(2) * BOTTOMS.length)], legs: "pants", sleeves: r(3) < 0.7 ? "long" : "short", shoe: "#1A1A1C", sole: "#E8E8E8" },
      stance,
      k: 0.94 + r(4) * 0.12,
    };
  });

/** The front row where the car stops, facing it. */
const STOP_FANS = makeFans(
  [
    [BARRIER_X - 0.45, -91.5, "phone"],
    [BARRIER_X - 0.5, -93.2, "cheer"],
    [BARRIER_X - 0.42, -97.0, "phone"],
    [BARRIER_X - 0.48, -98.6, "cheer"],
    [BARRIER_X - 0.45, -100.3, "wave"],
    [BARRIER_X - 0.5, -102.0, "phone"],
    [BARRIER_X - 0.45, -103.7, "cheer"],
    [BARRIER_X - 0.5, -105.5, "phone"],
    [BARRIER_X - 1.3, -96.2, "phone"],
    [BARRIER_X - 1.35, -99.6, "cheer"],
    [BARRIER_X - 1.3, -101.4, "phone"],
  ],
  10,
);
/** Round the phone that films the replay. */
const REPLAY_FANS = makeFans(
  [
    [BARRIER_X - 0.6, -46.4, "phone"],
    [BARRIER_X - 1.6, -48.9, "phone"],
    [BARRIER_X - 0.55, -49.6, "cheer"],
  ],
  40,
);

const FanGroup: React.FC<{ fans: Fan[]; w: number; lookAt: THREE.Vector3; cheer: number }> = ({ fans, w, lookAt, cheer }) => (
  <>
    {fans.map((f, i) => {
      const yaw = yawTo(f.at, lookAt);
      const local = lookAt.clone().sub(f.at).applyAxisAngle(V3(0, 1, 0), -yaw);
      const stance: Stance = f.stance === "cheer" && cheer < 0.3 ? "stand" : f.stance;
      const hop = f.stance === "cheer" ? Math.max(0, Math.sin(w * 8 + i * 2)) * 0.05 * cheer : 0;
      return (
        <group key={i} position={[f.at.x, hop, f.at.z]} rotation={[0, yaw, 0]}>
          <Person3D who={f.who} clothes={f.clothes} k={f.k} stance={stance} t={w + i} lookAt={local} e={{ smile: 0.4 + 0.5 * cheer, jaw: 0.35 * cheer * (0.5 + 0.5 * Math.sin(w * 3 + i)), brow: 0.4 * cheer }} />
        </group>
      );
    })}
  </>
);

export const FrontRow: React.FC<{ w: number; which: "stop" | "replay" }> = ({ w, which }) => {
  const car = carAt(w).pos.clone().add(V3(0, 0.8, 0));
  return <FanGroup fans={which === "stop" ? STOP_FANS : REPLAY_FANS} w={w} lookAt={car} cheer={cheerAt(w)} />;
};

void smoother;
