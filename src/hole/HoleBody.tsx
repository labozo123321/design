import React from "react";
import * as THREE from "three";
import { interpolate } from "remotion";
import { Hand, SHIN, SKIN, SLEEVE, Sneaker, THIGH, TORSO, jeans, lathe, mat } from "../pov/Body";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * Your body before the jump, in yaw-only space (it stays upright): hoodie, jeans, sneakers. You stand,
 * walk two steps to the edge (2.2 to 3.2 s), push off and dive, the legs swinging back out of sight.
 */
export const StandingBody: React.FC<{ t: number }> = ({ t }) => {
  if (t > 3.75) return null;
  const walkW = smooth(2.1, 2.4, t) * (1 - smooth(3.0, 3.2, t));
  const ph = (t - 2.2) * Math.PI * 2;
  // push-off: knees bend, then the whole body tips forward into the dive (legs swing up behind you)
  const crouch = smooth(3.02, 3.2, t) * (1 - smooth(3.24, 3.36, t));
  const dive = smooth(3.22, 3.7, t);
  const Z = -0.02;
  const D = 0.6;
  const HIP_Y = -0.79;
  return (
    <group rotation={[-dive * 1.9, 0, 0]}>
      {/* hoodie down to the belt */}
      <mesh
        geometry={lathe("torso", TORSO)}
        position={[0, 0.0, Z + 0.1]}
        scale={[1, 0.79, D]}
        material={mat(SLEEVE, 0.92)}
      />
      <mesh position={[0, -0.69, Z + 0.1]} scale={[0.176, 0.05, 0.176 * D]} material={mat(SLEEVE, 0.92)}>
        <cylinderGeometry args={[1, 1, 1, 36, 1, true]} />
      </mesh>
      <mesh position={[0, -0.72, Z + 0.1]} scale={[0.17, 0.035, 0.17 * D]} material={mat("#3A2A20", 0.6)}>
        <cylinderGeometry args={[1, 1, 1, 36]} />
      </mesh>
      <mesh position={[0, HIP_Y + 0.02, Z + 0.1]} scale={[0.17, 0.12, 0.112]} material={jeans()}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      {[-1, 1].map((side) => {
        const swing = Math.sin(ph) * side;
        // the leg swinging forward lifts its knee; the planted one trails
        const hip = 0.12 + walkW * (0.3 * swing) + crouch * 0.55 - dive * 0.3;
        const knee = -(0.08 + walkW * 0.55 * Math.max(0, Math.cos(ph) * side) + crouch * 1.0 + dive * 0.25);
        const ankle = -0.05 + crouch * 0.4 + walkW * 0.15 * Math.max(0, Math.cos(ph) * side) - dive * 0.6;
        return (
          <group key={side} position={[side * 0.1, HIP_Y, Z + 0.1]} rotation={[hip, side * 0.04, side * 0.03]}>
            <mesh geometry={lathe("thigh", THIGH)} scale={[1, 0.93, 1]} material={jeans()} />
            <group position={[0, -0.41, 0]} rotation={[knee, 0, 0]}>
              <mesh scale={0.06} material={jeans()}>
                <sphereGeometry args={[1, 16, 12]} />
              </mesh>
              <mesh geometry={lathe("shin", SHIN)} scale={[1, 0.98, 1]} material={jeans()} />
              <group position={[0, -0.405, 0.005]} rotation={[ankle, 0, side * 0.05]}>
                <Sneaker />
              </group>
            </group>
          </group>
        );
      })}
    </group>
  );
};

/** How far your arms reach out in front of you (0 down by your sides, out of view; 1 straight ahead). */
export const armReach = (t: number) =>
  Math.max(
    interpolate(t, [3.25, 3.6, 5.1, 5.7], [0, 1, 1, 0], CLAMP),
    interpolate(t, [33.7, 34.5, 36.4, 37.4], [0, 1, 1, 0], CLAMP),
    interpolate(t, [45.4, 46.2, 47.35, 47.5], [0, 0.85, 1, 0], CLAMP),
    interpolate(t, [60.4, 61.3, 63.2, 64.0, 65.2, 66.0, 68.4, 69.0, 72], [0, 1, 1, 0.55, 0.55, 0.75, 0.75, 1, 0.85], CLAMP),
  );

/** Arms flailing as you drop back into the hole at the end. */
const flailAt = (t: number) => interpolate(t, [68.4, 68.8, 70.5, 72], [0, 1, 1, 0.6], CLAMP);

/** Both arms in camera space, reaching ahead into the frame from the bottom corners; the wind shakes them. */
export const DiveArms: React.FC<{ t: number; speed: number }> = ({ t, speed }) => {
  const reach = armReach(t);
  if (reach < 0.02) return null;
  const flail = flailAt(t);
  const buffet = Math.min(1, speed / 120) * 0.035;
  const shake = (k: number) =>
    buffet * (Math.sin(t * 41 + k * 1.7) * 0.6 + Math.sin(t * 67 + k * 3.1) * 0.4) +
    0.04 * Math.sin(t * 1.3 + k) +
    flail * 0.12 * Math.sin(t * 9 + k * 2.2);
  return (
    <group>
      {[-1, 1].map((side) => {
        const lift = reach;
        const sh = new THREE.Vector3(side * 0.2, -0.27 - (1 - lift) * 0.12, 0.07);
        // from hanging down (pitch -1.5) to straight ahead and a touch down
        const pitch = -1.5 + lift * 1.45 + shake(side) + flail * 0.2 * Math.sin(t * 6 + side) - flail * 0.25;
        const yaw = side * (0.2 * lift) + shake(side + 4) * 0.6;
        return (
          <group key={side} position={sh} rotation={[pitch, yaw, side * -0.25 * lift]}>
            <mesh position={[0, 0, -0.16]} rotation={[Math.PI / 2, 0, 0]} material={mat(SLEEVE, 0.9)}>
              <capsuleGeometry args={[0.055, 0.22, 6, 12]} />
            </mesh>
            <group position={[0, 0, -0.32]} rotation={[0.18 + shake(side + 8) * 0.5, 0, 0]}>
              {/* hoodie sleeve down to the wrist, a ribbed cuff, then the bare wrist */}
              <mesh position={[0, 0, -0.12]} rotation={[Math.PI / 2, 0, 0]} material={mat(SLEEVE, 0.9)}>
                <capsuleGeometry args={[0.05, 0.19, 6, 12]} />
              </mesh>
              <mesh position={[0, 0, -0.235]} rotation={[Math.PI / 2, 0, 0]} material={mat("#2E3542", 0.95)}>
                <cylinderGeometry args={[0.047, 0.05, 0.05, 14]} />
              </mesh>
              <mesh position={[0, 0, -0.27]} rotation={[Math.PI / 2, 0, 0]} material={mat(SKIN, 0.6)}>
                <cylinderGeometry args={[0.034, 0.036, 0.05, 12]} />
              </mesh>
              <group position={[0, 0, -0.28]} rotation={[0.05 + shake(side + 11) * 0.5, 0, side * 0.15]}>
                <Hand side={side} spread={0.75 + flail * 0.2} curl={0.25 + Math.abs(shake(side + 13))} />
              </group>
            </group>
          </group>
        );
      })}
    </group>
  );
};
