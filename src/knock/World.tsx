import React from "react";
import * as THREE from "three";
import { FPS } from "./script";
import { cameraFor } from "./layout";
import { House } from "./House";
import { SharedWall } from "./SharedWall";
import { Bed, airRect, plainSheet, type BedLook, type BedSpec } from "./Beds";
import { KnockPost } from "./Post";
import { Rig } from "./KnockVideo";
import { ringsAt, setRipples } from "./ripple";
import { NightLights } from "./Lights";
import { LyingSib, lieBody } from "./People";
import { PosedSib } from "./Motion";
import { frameAt, type BedState, type Floor, type SibFrame, type Walker } from "./direct";
import { glow } from "../home/materials";
import { Dressing } from "./Dressing";
import { FoldedNote } from "./props/wall";
import { WALL } from "./layout";

/** Everything in the picture for one frame, as the director has it. */

const ERA_PAINT = { nora: "#C9B6DC", you: "#9FB9D6", noraCarpet: "#CFC3B2", youCarpet: "#C8C0B2" };
const BEDS: Record<string, BedLook> = {
  nora2004: { frame: "#F2EFEA", cover: plainSheet("#8E7BB8"), sheet: plainSheet() },
  nora2007: { frame: "#F2EFEA", cover: plainSheet("#A58CC4"), sheet: plainSheet() },
  nora2011: { frame: "#F2EFEA", cover: plainSheet("#C9A9B8"), sheet: plainSheet() },
  you2004: { frame: "#C99B66", cover: plainSheet("#C0392B"), sheet: plainSheet() },
  you2007: { frame: "#C99B66", cover: plainSheet("#2E7D4F"), sheet: plainSheet() },
  you2009: { frame: "#C99B66", cover: plainSheet("#3F6E9A"), sheet: plainSheet() },
  you2011: { frame: "#C99B66", cover: plainSheet("#2A3A5E"), sheet: plainSheet() },
  bare: { frame: "#F2EFEA", cover: plainSheet("#3E5E4A"), sheet: plainSheet() },
  air: { frame: "#5E6368", cover: plainSheet("#B9A27E"), sheet: plainSheet("#EEE9DF") },
  guest: { frame: "#C99B66", cover: plainSheet("#D8CDB8"), sheet: plainSheet("#F2EDE4") },
};
const AIR_MID: BedSpec = { x0: -1.78, x1: -0.79, z0: -3.25, z1: -1.35, top: 0.45 };

/** One sibling in their bed: the body, and the bed with covers shaped over it and the pillow dented. */
const InBed: React.FC<{ f: SibFrame | null; side: -1 | 1; bed: BedState; t: number; hide: string[] }> = ({ f, side, bed, t, hide }) => {
  const look = BEDS[bed.look] ?? BEDS.nora2004;
  const spec = bed.spec === "air-mid" ? AIR_MID : bed.kind === "air" ? airRect() : undefined;
  const pillowAt = bed.kind === "air" ? { x: spec ? (spec.x0 + spec.x1) / 2 + 0.12 * (bed.spec === "air-mid" ? 0 : 1) : -0.5, z: bed.spec === "air-mid" ? spec!.z0 + 0.3 : -3.3 } : undefined;
  if (!f) {
    if (bed.kind === "none") return null;
    // a made bed, or (someone just got out) the covers thrown back to the foot
    const zTop = (spec?.z0 ?? -3.6) + 0.55 + (bed.thrown ?? 0) * 0.85;
    return <Bed side={side} look={look} kind={bed.kind} spec={spec} bare={bed.bare} pillowAt={pillowAt} covers={bed.bare ? null : { zTop, caps: [], loft: bed.thrown ? 0.05 * bed.thrown : undefined }} />;
  }
  const b = lieBody(f.s, side, f.lie);
  const zTop = f.covers === null ? null : b.f.pos.z + (b.eye.z - b.f.pos.z) * f.covers;
  return (
    <>
      <LyingSib s={f.s} side={side} st={f.lie} t={t} />
      <Bed
        side={side}
        look={look}
        kind={bed.kind}
        spec={spec}
        bare={bed.bare}
        pillowAt={pillowAt}
        covers={zTop === null || hide.includes("nocover") ? null : { zTop, caps: b.caps, bag: f.bag }}
        rest={b.rest}
      />
      {f.phone ? <Phone f={f} side={side} b={b} /> : null}
      {hide.includes("caps")
        ? b.caps.map((c, i) => {
            const d = c.b.clone().sub(c.a);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
            return (
              <mesh key={i} position={c.a.clone().add(c.b).multiplyScalar(0.5)} quaternion={q}>
                <capsuleGeometry args={[c.r, d.length(), 4, 8]} />
                <meshBasicMaterial color="#00FF88" wireframe />
              </mesh>
            );
          })
        : null}
    </>
  );
};

/** A phone: in the far hand in front of the face (its screen lighting the face), or face down on the
 * covers. */
const Phone: React.FC<{ f: SibFrame; side: -1 | 1; b: ReturnType<typeof lieBody> }> = ({ f, b }) => {
  const ph = f.phone!;
  const far = f.lie.far;
  const hand = far ? (far.to && (far.k ?? 0) > 0.5 ? far.to : far.rest) : null;
  if (!hand) return null;
  const at = hand.body ? hand.at.clone().applyQuaternion(b.f.q).add(b.f.pos) : hand.eye ? b.eye.clone().add(hand.at) : hand.at.clone();
  if (ph.down) {
    return (
      <mesh position={[at.x, at.y - 0.02, at.z]} rotation={[-Math.PI / 2, 0, 0.4]} castShadow>
        <boxGeometry args={[0.072, 0.15, 0.009]} />
        <meshPhysicalMaterial color="#141418" roughness={0.35} clearcoat={0.6} />
      </mesh>
    );
  }
  if (ph.ear) {
    // held to the ear: against the side of the head, its long side along the head, the screen to the cheek
    const U = new THREE.Vector3(0, 1, 0).applyQuaternion(b.f.q);
    const head = b.eye.clone().addScaledVector(U, -0.02);
    const p = at.clone().lerp(head, 0.18);
    const m = new THREE.Matrix4().lookAt(p, head, U);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    return (
      <mesh position={p} quaternion={q} castShadow>
        <boxGeometry args={[0.072, 0.15, 0.009]} />
        <meshPhysicalMaterial color="#141418" roughness={0.35} clearcoat={0.6} />
      </mesh>
    );
  }
  // between the hand and the eyes, the screen toward them
  const p = at.clone().lerp(b.eye, 0.12).add(new THREE.Vector3(0, -0.015, 0));
  const m = new THREE.Matrix4().lookAt(p, b.eye, new THREE.Vector3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return (
    <group position={p} quaternion={q}>
      <mesh castShadow>
        <boxGeometry args={[0.072, 0.15, 0.009]} />
        <meshPhysicalMaterial color="#141418" roughness={0.35} clearcoat={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.0052]} rotation={[0, Math.PI, 0]} material={glow(`screen${Math.round(ph.on * 10)}`, "#9FC2FF", 0.15 + 1.4 * ph.on)}>
        <planeGeometry args={[0.066, 0.142]} />
      </mesh>
      {ph.on > 0.01 ? <pointLight position={[0, 0, -0.06]} color="#A9C6FF" intensity={0.05 * ph.on} distance={0.7} decay={1.4} /> : null}
    </group>
  );
};

/** Someone up and about, and what they carry (a pillow held to the chest). */
const Up: React.FC<{ w: Walker; t: number }> = ({ w, t }) => {
  const k = w.s.k;
  const chest = w.p.hip.clone().add(new THREE.Vector3(0, 0.4 * k, 0).applyQuaternion(w.p.q)).add(new THREE.Vector3(0, 0, -0.17).applyQuaternion(w.p.q));
  return (
    <>
      <PosedSib s={w.s} p={w.p} t={t} />
      {w.carry === "pillow" ? <CarriedPillow at={chest} q={w.p.q} /> : null}
      {w.carry === "bundle" ? <Bundle at={chest} q={w.p.q} t={t} /> : null}
    </>
  );
};

/** A pillow held against the chest: a soft squashed cushion. */
const pillowGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    // a squashed sphere pulled toward a rectangle (a pillow's corners), with a seam bulge
    const s = new THREE.SphereGeometry(1, 40, 24);
    const p = s.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const sq = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.55);
      const cx = sq(x);
      const cy = sq(y);
      const thick = 1 - 0.75 * Math.max(Math.abs(cx), Math.abs(cy)) ** 3;
      p.setXYZ(i, cx * 0.25, cy * 0.17, z * 0.075 * thick);
    }
    s.computeVertexNormals();
    g = s;
    return g;
  };
})();
const CarriedPillow: React.FC<{ at: THREE.Vector3; q: THREE.Quaternion }> = ({ at, q }) => (
  <mesh position={at} quaternion={q} geometry={pillowGeo()} castShadow>
    <meshStandardMaterial color="#EFE9DE" roughness={0.92} />
  </mesh>
);
/** Her pillow and quilt bundled in her arms: the quilt in loose folds around the pillow, a corner trailing. */
const Bundle: React.FC<{ at: THREE.Vector3; q: THREE.Quaternion; t: number }> = ({ at, q, t }) => (
  <group position={at} quaternion={q}>
    <mesh geometry={pillowGeo()} position={[0, 0.06, -0.02]} castShadow>
      <meshStandardMaterial color="#E9E0EE" roughness={0.92} />
    </mesh>
    {[
      [-0.09, -0.03, -0.05, 0.13, 0.09, 0.075],
      [0.08, -0.05, -0.045, 0.14, 0.085, 0.07],
      [0.0, -0.1, -0.06, 0.16, 0.07, 0.065],
      [0.17, -0.19 - 0.02 * Math.sin(t * 7), -0.03, 0.05, 0.13, 0.025],
    ].map(([x, y, z, a, b, c], i) => (
      <mesh key={i} position={[x, y, z]} scale={[a, b, c]} castShadow>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#8E7BB8" roughness={0.95} />
      </mesh>
    ))}
  </group>
);

/** Lying on the floor (on a rug) with a pillow: the pillow from the moment it's dropped, the person once
 * they're down. */
const OnFloor: React.FC<{ f: Floor; t: number }> = ({ f, t }) => {
  const b = f.body ? lieBody(f.s, f.side, f.lie) : null;
  const spec = { x0: f.spot.x - 0.45, x1: f.spot.x + 0.45, z0: f.spot.pillowZ - 0.25, z1: f.spot.pillowZ + 1.7, top: f.spot.top };
  return (
    <>
      {b ? <LyingSib s={f.s} side={f.side} st={f.lie} t={t} /> : null}
      <Bed
        side={f.side}
        look={f.look ? BEDS[f.look] ?? BEDS.guest : BEDS.guest}
        kind="none"
        spec={spec}
        pillowAt={{ x: f.spot.x, z: f.spot.pillowZ }}
        rest={b ? b.rest : null}
        covers={b && f.covers !== null ? { zTop: b.f.pos.z + (b.eye.z - b.f.pos.z) * f.covers, caps: b.caps, loft: 0.03, drape: 0.02 } : null}
      />
    </>
  );
};

/** The wall's own eye: inside the cavity's top, between the two studs by Nora's pillow, looking straight
 * down the slot (the frame's up toward the back wall). */
const MACRO = { x: 0, y: 1.07, z: -3.04, fov: 58 };
const macroCam = (y = MACRO.y) => {
  const pos = new THREE.Vector3(MACRO.x, y, MACRO.z);
  const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(MACRO.x, 0, MACRO.z - 0.0001), new THREE.Vector3(0, 0, -1));
  return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov: MACRO.fov, near: 0.01 };
};

/** Dust in the slot: motes drifting in the nightlight's sliver (and lifting when the rings pass). */
const Motes: React.FC<{ t: number; lift: number }> = ({ t, lift }) => {
  const geo = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(60 * 3), 3));
    return g;
  }, []);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < 60; i++) {
    const h = (n: number) => {
      const v = Math.sin((i + 1) * 91.7 + n * 47.3) * 43758.5453;
      return v - Math.floor(v);
    };
    const y = 0.08 + ((h(1) + t * (0.012 + 0.03 * h(2)) * (1 + 3 * lift)) % 1) * 0.95;
    p.setXYZ(i, (h(3) - 0.5) * 0.08 + 0.004 * Math.sin(t * 1.3 + i), y, -3.2 + h(4) * 0.32 + 0.006 * Math.cos(t * 0.9 + i * 2));
  }
  p.needsUpdate = true;
  return (
    <points geometry={geo}>
      <pointsMaterial color="#FFD8A8" size={0.0022} sizeAttenuation transparent opacity={0.7} depthWrite={false} />
    </points>
  );
};

/** The note: falling down the slot, or lying on the plate. */
const Note: React.FC<{ n: NonNullable<ReturnType<typeof frameAt>["note"]> }> = ({ n }) => (
  <group position={n.pos} rotation={n.rot}>
    <FoldedNote open={n.open} />
  </group>
);

/** A pillow pulled down over a head (held there with a forearm): squashed into a dome. */
const PillowOver: React.FC<{ at: THREE.Vector3; q?: THREE.Quaternion }> = ({ at, q }) => (
  <mesh position={at} quaternion={q} rotation={q ? undefined : [Math.PI / 2 - 0.25, 0.1, Math.PI / 2]} geometry={pillowGeo()} castShadow receiveShadow>
    <meshStandardMaterial color="#DCE3EE" roughness={0.92} />
  </mesh>
);

const debugCam = (cam?: string) => {
  const at = (p: [number, number, number], q: [number, number, number]) => {
    const pos = new THREE.Vector3(...p);
    const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(...q), new THREE.Vector3(0, 1, 0));
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov: 30 };
  };
  if (cam === "sideN") return at([-2.3, 1.5, -0.9], [-0.45, 0.55, -2.7]);
  if (cam === "sideY") return at([2.3, 1.5, -0.9], [0.45, 0.55, -2.7]);
  return null;
};

export const World: React.FC<{ frame: number; cam?: string; hide: string[]; tOverride?: number }> = ({ frame, cam, hide, tOverride }) => {
  const t = tOverride ?? frame / FPS;
  const F = frameAt(t);
  const macro = (F.macro ?? 0) > 0 && !cam;
  // (the payoff's macro pushes slowly down the slot toward the note)
  const my = MACRO.y - (t > 50 ? 0.32 * Math.sin(Math.PI * 0.5 * Math.min(1, Math.max(0, (t - 59.3) / 0.8))) : 0);
  const c = debugCam(cam) ?? (macro ? macroCam(my) : cameraFor(F.cam));
  // inside the cavity the seam's bloom is all around the lens: a fraction of it reads as the same glow
  setRipples(ringsAt(t), F.seam * (macro ? 0.07 : 0.45), -3.15);
  const focus = macro ? (F.note ? Math.max(0.1, my - F.note.pos.y) : my - 0.05) : F.cam.dist;
  return (
    <>
      <Rig c={c} />
      <color attach="background" args={[(F.light.sun ?? 0) > 0.3 ? "#2A3138" : "#05060A"]} />
      <House paint={ERA_PAINT} />
      <SharedWall noraPaint={ERA_PAINT.nora} youPaint={ERA_PAINT.you} dust={0} cobweb={0} />
      <InBed f={F.nora} side={-1} bed={F.dress.beds.nora} t={t} hide={hide} />
      <InBed f={F.you} side={1} bed={F.dress.beds.you} t={t} hide={hide} />
      {(F.walkers ?? []).map((w) => (
        <Up key={w.key} w={w} t={t} />
      ))}
      {(F.floor ?? []).map((f, i) => (
        <OnFloor key={i} f={f} t={t} />
      ))}
      <Dressing d={F.dress} t={t} />
      {F.note ? <Note n={F.note} /> : null}
      {(F.items ?? []).map((it, i) => (it.kind === "pillowOver" ? <PillowOver key={i} at={it.pos} q={it.q} /> : null))}
      {macro ? (
        <>
          <Motes t={t} lift={F.seam} />
          {/* the warm sliver through the gap at the top of the outlet box, and the cavity's own darkness */}
          <pointLight position={[-WALL.half + 0.03, 0.64, -2.98]} color="#FFB067" intensity={0.05} distance={0.9} decay={1.6} />
          <pointLight position={[0, 1.0, -3.04]} color="#5A6A90" intensity={0.012} distance={1.4} decay={1.0} />
        </>
      ) : null}
      {hide.includes("lit") ? (
        <>
          <hemisphereLight args={["#FFFFFF", "#806850", 2.2]} />
          <directionalLight position={[2, 8, 3]} intensity={1.5} castShadow shadow-normalBias={0.03} shadow-mapSize={[2048, 2048]} />
        </>
      ) : (
        <NightLights
          t={t}
          hall={F.light.hall}
          street={F.light.street}
          moon={F.light.moon}
          nightlight={F.light.nightlight}
          fill={F.light.fill}
          strings={F.light.strings ?? 0}
          lightning={F.light.lightning ?? 0}
          sun={F.light.sun ?? 0}
          sunAz={F.light.sunAz ?? 0.5}
        />
      )}
      <KnockPost look={{ time: t, ...F.look }} bloom={F.bloom} lens={macro ? { focus, aperture: 0.0035, maxR: 0.014 } : { focus, aperture: F.aperture }} />
    </>
  );
};
