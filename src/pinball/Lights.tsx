import React, { useMemo } from "react";
import * as THREE from "three";
import { INSERTS, Insert } from "./art";
import { Show } from "./show";

/**
 * Light: the lamp inserts glowing up through the playfield (flat shapes just above the print, HDR so
 * they bloom), the general illumination (warm lamps low round the edges, under the plastics), the
 * flashers (the monster's pink, the jackpot's white), and a dim purple fill.
 */

const insertGeo = (ins: Insert) => {
  const s = new THREE.Shape();
  const r = ins.r;
  if (ins.shape === "circle") s.absarc(0, 0, r, 0, Math.PI * 2, false);
  else if (ins.shape === "rect") {
    s.moveTo(-r * 0.7, -r * 1.6);
    s.lineTo(r * 0.7, -r * 1.6);
    s.lineTo(r * 0.7, r * 1.6);
    s.lineTo(-r * 0.7, r * 1.6);
    s.closePath();
  } else if (ins.shape === "tri") {
    s.moveTo(0, r * 1.2);
    s.lineTo(r * 1.1, -r * 0.8);
    s.lineTo(-r * 1.1, -r * 0.8);
    s.closePath();
  } else if (ins.shape === "arrow") {
    s.moveTo(0, r * 1.5);
    s.lineTo(r, r * 0.2);
    s.lineTo(r * 0.42, r * 0.2);
    s.lineTo(r * 0.42, -r * 1.3);
    s.lineTo(-r * 0.42, -r * 1.3);
    s.lineTo(-r * 0.42, r * 0.2);
    s.lineTo(-r, r * 0.2);
    s.closePath();
  } else {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      const rr = k % 2 ? r * 0.45 : r;
      if (k === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    s.closePath();
  }
  const g = new THREE.ShapeGeometry(s, 16);
  // shape space (x, y up the table) -> flat on the playfield
  g.rotateZ(ins.rot);
  g.rotateX(-Math.PI / 2);
  return g;
};

export const Inserts: React.FC<{ show: Show }> = ({ show }) => {
  const items = useMemo(
    () =>
      INSERTS.map((ins) => ({
        ins,
        geo: insertGeo(ins),
        mat: new THREE.MeshBasicMaterial({
          color: new THREE.Color(ins.color),
          toneMapped: false,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      })),
    [],
  );
  const groupIdx: Record<string, number> = {};
  return (
    <group>
      {items.map(({ ins, geo, mat }) => {
        const i = (groupIdx[ins.group] = (groupIdx[ins.group] ?? -1) + 1);
        const k = show.lamp(ins.group, i);
        mat.color.set(ins.color).multiplyScalar(k);
        if (k < 0.01) return null;
        return <mesh key={ins.id} geometry={geo} material={mat} position={[ins.x, 0.0004, -ins.y]} />;
      })}
    </group>
  );
};

const GI_POS: [number, number, number][] = [
  [0.04, 0.075, -0.26],
  [0.43, 0.075, -0.28],
  [0.04, 0.08, -0.62],
  [0.42, 0.08, -0.62],
  [0.26, 0.085, -0.93],
  [0.24, 0.075, -0.16],
];

/**
 * Light levels are physical (candela at a few centimetres): a bulb 7 cm off the playfield at 0.012 cd
 * gives a pool of light about as bright as the white of the display, not a blown-out hotspot.
 */
export const Lighting: React.FC<{ show: Show }> = ({ show }) => {
  const gi = show.gi;
  return (
    <group>
      <hemisphereLight args={["#8A6BE0", "#1A0E2A", 0.25 + 0.55 * gi]} />
      <directionalLight position={[0.3, 1.0, 0.4]} color="#FFE8D0" intensity={0.55 * gi + 0.05} />
      {GI_POS.map((p, i) => (
        <pointLight key={i} position={p} color="#FFD3A0" intensity={0.012 * gi} distance={0} decay={2} />
      ))}
      <pointLight position={[0.13, 0.12, -0.9]} color="#FF4FB8" intensity={0.004 + 0.05 * show.flash.monster} distance={0} decay={2} />
      <pointLight position={[0.24, 0.1, -0.42]} color="#FFFFFF" intensity={0.04 * show.flash.centre} distance={0} decay={2} />
    </group>
  );
};
