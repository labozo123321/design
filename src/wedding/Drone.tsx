import React, { useMemo } from "react";
import * as THREE from "three";
import { RingBox } from "./Dog";
import { CUE_W, L, RIBBON, bodyTiltAt, boxAt, camAt, hash, smooth, wAt, type Cam } from "./flight";

/**
 * The drone's own parts you can see from its camera: the tips of the two front prop guards in the top
 * corners with the blades a blur inside them (the spin-up at the start, stopping in the cake), and the ring
 * box on its satin ribbon swinging underneath (when the camera looks down at it). Plus the grass blowing
 * flat round the drone as it spins up and lifts off.
 */

const SPIN_UP = 1.6;

/** Prop speed 0..1 at world time w. */
export const propSpeed = (w: number) => smooth(SPIN_UP, SPIN_UP + 1.2, w) * (1 - smooth(CUE_W.rest - 0.2, CUE_W.rest + 1.4, w));

export const DroneParts: React.FC<{ frame: number; c: Cam }> = ({ frame, c }) => {
  const w = wAt(frame);
  const spin = propSpeed(w);
  const mats = useMemo(
    () => ({
      guard: new THREE.MeshStandardMaterial({ color: "#5A5D63", roughness: 0.5 }),
      blur: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.05, 0.06), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
      blade: new THREE.MeshStandardMaterial({ color: "#1C1D20", roughness: 0.4 }),
    }),
    [],
  );
  const bt = bodyTiltAt(frame);
  // in camera space: the front props just above and ahead, the body's tilt seen from the gimbal
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15 + bt[0] * 0.5, 0, -bt[1] * 0.4));
  return (
    <group position={c.pos} quaternion={c.quat}>
      <group quaternion={tilt}>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.15, 0.142, -0.24]}>
            {/* the guard: a ring of grey plastic */}
            <mesh material={mats.guard} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.062, 0.0035, 8, 48]} />
            </mesh>
            {/* blades: a dark blur when spinning, two blades when stopped */}
            {spin > 0.3 ? (
              <mesh material={mats.blur} rotation={[Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.062, 40]} />
              </mesh>
            ) : (
              <group rotation={[0, frame * spin * 2.5 + s, 0]}>
                {[0, Math.PI].map((a) => (
                  <mesh key={a} material={mats.blade} rotation={[0, a, 0.08]} position={[Math.cos(a) * 0.03, 0, -Math.sin(a) * 0.03]} scale={[0.03, 0.002, 0.008]}>
                    <boxGeometry args={[2, 1, 1]} />
                  </mesh>
                ))}
              </group>
            )}
            <mesh material={mats.guard} scale={[0.012, 0.014, 0.012]}>
              <cylinderGeometry args={[1, 1, 1, 12]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
};

/** The ring box and its ribbon in the world (from the flight), until the ribbon snaps in the cake. */
export const RingOnRibbon: React.FC<{ frame: number }> = ({ frame }) => {
  const w = wAt(frame);
  const c = camAt(frame);
  const box = boxAt(frame);
  const satin = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#F4EEE6", roughness: 0.4, sheen: 1 }), []);
  if (w >= CUE_W.cakeHit) return null;
  const anchor = c.pos.clone().add(new THREE.Vector3(0, -0.06, 0));
  const top = box.clone().add(new THREE.Vector3(0, 0.03, 0));
  const d = top.clone().sub(anchor);
  const len = d.length();
  // on the grass the ribbon lies slack
  const slack = len < RIBBON * 0.9;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const swing = new THREE.Euler(0, Math.atan2(d.x, d.z), 0);
  return (
    <group>
      {!slack ? (
        <mesh material={satin} position={anchor.clone().addScaledVector(d, 0.5)} quaternion={q} scale={[0.008, len, 0.002]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ) : null}
      <RingBox at={box.clone().add(new THREE.Vector3(0, 0.0, 0))} rot={swing} />
    </group>
  );
};

/** Grass blades round the drone's take-off spot, blown flat by the props as it spins up and lifts off. */
export const GrassPatch: React.FC<{ frame: number }> = ({ frame }) => {
  const w = wAt(frame);
  const centre = useMemo(() => new THREE.Vector3(...L.droneStart).setY(0), []);
  const N = 9000;
  const { im, data } = useMemo(() => {
    const blade = new THREE.PlaneGeometry(0.012, 0.11, 1, 4);
    blade.translate(0, 0.055, 0);
    const p = blade.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) * (1 - y / 0.12));
    }
    blade.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, side: THREE.DoubleSide });
    const m = new THREE.InstancedMesh(blade, mat, N);
    const data: { x: number; z: number; h: number; a: number }[] = [];
    for (let i = 0; i < N; i++) {
      const r = Math.sqrt(hash(i * 1.37)) * 2.6;
      const a = hash(i * 7.13) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      data.push({ x, z, h: 0.6 + hash(i * 3.3) * 0.7, a: hash(i * 9.1) * 6.28 });
      m.setColorAt(i, new THREE.Color().setHSL(0.24 + hash(i * 2.2) * 0.05, 0.55, 0.16 + hash(i * 4.4) * 0.12));
    }
    m.frustumCulled = false;
    m.receiveShadow = true;
    return { im: m, data };
  }, []);
  if (w > CUE_W.reveal + 2) return null;
  const blow = propSpeed(w);
  const lift = Math.max(0, camAt(frame).pos.y - 0.14);
  const strength = blow * Math.max(0, 1 - lift / 2.5);
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  data.forEach((b, i) => {
    const r = Math.hypot(b.x, b.z) + 0.05;
    const away = new THREE.Vector3(b.x / r, 0, b.z / r);
    const push = strength * Math.min(1.2, 0.5 / r) * (0.75 + 0.25 * Math.sin(w * 31 + i));
    const axis = new THREE.Vector3(away.z, 0, -away.x);
    q.setFromAxisAngle(axis, push * 1.2 + 0.08 * Math.sin(w * 1.3 + b.a));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.a));
    tmp.compose(new THREE.Vector3(centre.x + b.x, 0.002, centre.z + b.z), q, new THREE.Vector3(1, b.h, 1));
    im.setMatrixAt(i, tmp);
  });
  im.instanceMatrix.needsUpdate = true;
  return <primitive object={im} />;
};
