import React, { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Props: the friend's leaf blower (handheld: an orange housing with a loop handle, the long tube), the
 * mogger's sunglasses when they're in his hand, a clipboard, and the glare off glass skin in the flash.
 */

const mats: Record<string, THREE.Material> = {};
const m = (key: string, make: () => THREE.Material) => (mats[key] ??= make());

/** The leaf blower in its own frame: the handle's grip at the origin, the tube out along -z (forward). */
export const LeafBlower: React.FC<{ run?: number; t?: number }> = ({ run = 0, t = 0 }) => {
  const g = useMemo(() => {
    const housing = new RoundedBoxGeometry(0.16, 0.2, 0.32, 5, 0.05);
    const tubePts = [new THREE.Vector3(0, -0.13, -0.12), new THREE.Vector3(0, -0.16, -0.3), new THREE.Vector3(0, -0.19, -0.62), new THREE.Vector3(0, -0.205, -0.82)];
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tubePts), 32, 0.034, 16, false);
    const handle = new THREE.TorusGeometry(0.075, 0.016, 10, 24, Math.PI);
    return { housing, tube, handle };
  }, []);
  const orange = m("bl-orange", () => new THREE.MeshPhysicalMaterial({ color: "#E4701E", roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
  const black = m("bl-black", () => new THREE.MeshStandardMaterial({ color: "#1C1D20", roughness: 0.6 }));
  const grey = m("bl-grey", () => new THREE.MeshStandardMaterial({ color: "#6E7178", roughness: 0.45, metalness: 0.4 }));
  const tubeM = m("bl-tube", () => new THREE.MeshPhysicalMaterial({ color: "#E8E3D8", roughness: 0.3, clearcoat: 0.4 }));
  // the engine shakes it a little when it runs
  const sh = run * 0.0015;
  return (
    <group position={[Math.sin(t * 177) * sh, Math.sin(t * 211) * sh, 0]}>
      <mesh geometry={g.housing} material={orange} position={[0, -0.13, 0.06]} castShadow />
      {/* the fan cover on its side, the pull cord's grip */}
      <mesh material={grey} position={[0.083, -0.13, 0.08]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.072, 0.072, 0.012, 28]} />
      </mesh>
      <mesh material={black} position={[0.092, -0.13, 0.08]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, 0.012, 16]} />
      </mesh>
      {/* the loop handle over the top (the grip is at the origin) */}
      <mesh geometry={g.handle} material={black} position={[0, -0.03, 0.05]} rotation={[0, Math.PI / 2, 0]} />
      <mesh material={black} position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.017, 0.017, 0.11, 12]} />
      </mesh>
      <mesh geometry={g.tube} material={tubeM} castShadow />
      {/* the flattened nozzle */}
      <mesh material={black} position={[0, -0.205, -0.84]} scale={[1.25, 0.65, 1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.036, 0.034, 0.05, 18, 1, true]} />
      </mesh>
    </group>
  );
};

/** Sunglasses held by one arm (a temple) in the fingers: in the hand's frame, hanging. */
export const HeldSunglasses: React.FC = () => {
  const frame = m("sg-frame", () => new THREE.MeshPhysicalMaterial({ color: "#141416", roughness: 0.25, clearcoat: 0.8 }));
  const lens = m("sg-lens", () => new THREE.MeshPhysicalMaterial({ color: "#0B0C10", roughness: 0.04, metalness: 0.4, clearcoat: 1 }));
  return (
    <group rotation={[0.2, 0.3, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.031, -0.05, 0.0]}>
          <mesh material={lens} scale={[1, 0.78, 0.16]}>
            <sphereGeometry args={[0.025, 20, 12]} />
          </mesh>
          <mesh material={frame} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.025, 0.0026, 6, 28]} />
          </mesh>
        </group>
      ))}
      <mesh material={frame} position={[0, -0.04, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.0015, 0.0015, 0.012, 6]} />
      </mesh>
      {/* the temple arm in the fingers */}
      <mesh material={frame} position={[0.056, -0.01, -0.03]} rotation={[0.9, 0, 0]}>
        <boxGeometry args={[0.003, 0.003, 0.11]} />
      </mesh>
    </group>
  );
};

/** A clipboard (its clip at the top), in its own frame: the board in the x-y plane. */
export const Clipboard: React.FC = () => {
  const board = m("cb-board", () => new THREE.MeshStandardMaterial({ color: "#8A5A32", roughness: 0.6 }));
  const paper = m("cb-paper", () => new THREE.MeshStandardMaterial({ color: "#F6F3EA", roughness: 0.9 }));
  const clip = m("cb-clip", () => new THREE.MeshStandardMaterial({ color: "#B8BCC4", metalness: 1, roughness: 0.3 }));
  return (
    <group>
      <mesh material={board} castShadow>
        <boxGeometry args={[0.23, 0.32, 0.006]} />
      </mesh>
      <mesh material={paper} position={[0, -0.01, 0.0035]}>
        <boxGeometry args={[0.21, 0.28, 0.001]} />
      </mesh>
      <mesh material={clip} position={[0, 0.15, 0.007]}>
        <boxGeometry args={[0.08, 0.03, 0.01]} />
      </mesh>
    </group>
  );
};

/** The flash blowing out off a face of glass skin: a hot white bloom in front of it. */
export const FaceGlare: React.FC<{ k: number }> = ({ k }) => {
  if (k <= 0.01) return null;
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#FFFFFF").multiplyScalar(1.15 + 1.6 * k), transparent: true, opacity: Math.min(0.92, k * 0.95), depthWrite: false });
  return (
    <group>
      <mesh material={mat} scale={[0.03, 0.04, 0.008]} position={[0.004, -0.004, 0.09]}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      {/* the hot spots: forehead, the nose, the cheekbones */}
      {[
        [0, 0.045, 0.092, 0.022],
        [0, -0.03, 0.12, 0.016],
        [0.035, -0.022, 0.09, 0.016],
        [-0.035, -0.022, 0.09, 0.016],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} material={mat} position={[x, y, z]} scale={r * 0.55}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
      ))}
    </group>
  );
};
