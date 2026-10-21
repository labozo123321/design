import React from "react";
import { OUTLET, SHELF, TREAD, treadPlace } from "./layout";
import type { Dressing as D } from "./direct";
import { glow } from "../home/materials";

/**
 * The rooms' dressing by era (placeholder shapes until the prop library is in): your shelf on the wall above
 * your pillow with the green T-rex (jolting when you knock, toppling), Nora's crooked outlet with the moon
 * nightlight.
 */
export const Dressing: React.FC<{ d: D; t: number }> = ({ d }) => {
  const sx = SHELF.at.x + SHELF.d / 2;
  return (
    <group>
      {/* your shelf and the T-rex */}
      <group position={[sx, SHELF.at.y + d.jolt * 0.004, SHELF.at.z]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[SHELF.d, 0.02, SHELF.w]} />
          <meshStandardMaterial color="#D2A36A" roughness={0.6} />
        </mesh>
        <group position={[0.02, 0.01, 0]} rotation={[0, 0, -d.trex * Math.PI * 0.5]}>
          <mesh position={[0, 0.055, 0]} castShadow>
            <boxGeometry args={[0.04, 0.11, 0.08]} />
            <meshStandardMaterial color="#3E9A3A" roughness={0.45} />
          </mesh>
        </group>
      </group>
      {/* mom's treadmill in Nora's room from 2014 (placeholder until the prop is in) */}
      {["2014", "2016", "2025"].includes(d.era) ? (
        <group position={treadPlace(d.era).at} rotation={[0, treadPlace(d.era).rotY, 0]}>
          <mesh position={[0, TREAD.deck / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.72, TREAD.deck, TREAD.z1 - TREAD.z0]} />
            <meshStandardMaterial color="#2B2D31" roughness={0.6} />
          </mesh>
          <mesh position={[0, TREAD.deck + 0.003, -0.08]} receiveShadow>
            <boxGeometry args={[0.5, 0.006, TREAD.z1 - TREAD.z0 - 0.3]} />
            <meshStandardMaterial color="#141416" roughness={0.85} />
          </mesh>
          {[-0.33, 0.33].map((x) => (
            <mesh key={x} position={[x, 0.68, (TREAD.z1 - TREAD.z0) / 2 - 0.12]} rotation={[0.18, 0, 0]} castShadow>
              <boxGeometry args={[0.05, 1.0, 0.06]} />
              <meshStandardMaterial color="#3A3D42" roughness={0.5} metalness={0.3} />
            </mesh>
          ))}
          <mesh position={[0, TREAD.console.y, TREAD.console.z - (TREAD.z0 + TREAD.z1) / 2]} rotation={[-0.6, 0, 0]} castShadow>
            <boxGeometry args={[0.72, 0.05, 0.26]} />
            <meshStandardMaterial color="#2F3236" roughness={0.45} />
          </mesh>
        </group>
      ) : null}
      {/* Nora's outlet and the moon nightlight */}
      <group position={[OUTLET.x - 0.004, OUTLET.y, OUTLET.z]}>
        <mesh>
          <boxGeometry args={[0.008, 0.115, 0.07]} />
          <meshStandardMaterial color="#F2EEE6" roughness={0.5} />
        </mesh>
        <mesh position={[-0.02, 0.02, 0]} material={glow("moonNL", "#FFC27A", 2.2)}>
          <sphereGeometry args={[0.03, 16, 12]} />
        </mesh>
      </group>
    </group>
  );
};
