import React, { useMemo } from "react";
import * as THREE from "three";
import { playfieldTexture } from "./art";
import { chrome, plastic, rubber, steelDull, translucent, wood } from "./mats";
import { LAY } from "./timeline";

/**
 * Everything on the table that doesn't move: the printed playfield, the walls and the top arch, lane
 * guides, posts with their rubber rings, the slingshots' frames, the plunger lane and the apron, the
 * cabinet round it all. Three.js metres: x across, y up off the playfield, z = -(table y).
 */

const W = LAY.W;
const L = LAY.L;
const XC = LAY.XC;

/** A wall (thin box) standing on the playfield between two table points. */
const Wall: React.FC<{
  a: [number, number];
  b: [number, number];
  h: number;
  t?: number;
  mat: THREE.Material;
  y0?: number;
}> = ({ a, b, h, t = 0.004, mat, y0 = 0 }) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  return (
    <mesh position={[(a[0] + b[0]) / 2, y0 + h / 2, -(a[1] + b[1]) / 2]} rotation={[0, ang, 0]} material={mat}>
      <boxGeometry args={[len + t, h, t]} />
    </mesh>
  );
};

/** A chrome post with a rubber ring round it. */
export const Post: React.FC<{ x: number; y: number; ring?: string; h?: number }> = ({ x, y, ring = "#F4F1EA", h = 0.032 }) => (
  <group position={[x, 0, -y]}>
    <mesh position={[0, h / 2, 0]} material={chrome()}>
      <cylinderGeometry args={[0.0032, 0.0036, h, 14]} />
    </mesh>
    <mesh position={[0, h, 0]} material={chrome()}>
      <sphereGeometry args={[0.0036, 12, 8]} />
    </mesh>
    <mesh position={[0, 0.014, 0]} rotation={[Math.PI / 2, 0, 0]} material={rubber(ring)}>
      <torusGeometry args={[0.0062, 0.0028, 10, 20]} />
    </mesh>
  </group>
);

/** The top arch: a curved steel band. */
const Arch: React.FC = () => {
  const geo = useMemo(() => {
    const [cx, cy] = LAY.archC;
    const r = LAY.archR + 0.002;
    const g = new THREE.CylinderGeometry(r, r, 0.036, 96, 1, true, 0, Math.PI);
    // CylinderGeometry's theta starts at +z; rotate so it spans the top half (table +y)
    g.rotateY(Math.PI / 2);
    g.translate(cx, 0.018, -cy);
    return g;
  }, []);
  return <mesh geometry={geo} material={steelDull()} />;
};

/** The printed playfield, glossy with clear coat. */
const Playfield: React.FC = () => {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: playfieldTexture(),
        roughness: 0.22,
        metalness: 0,
        envMapIntensity: 0.55,
      }),
    [],
  );
  return (
    <mesh position={[W / 2, 0, -L / 2]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <planeGeometry args={[W, L]} />
    </mesh>
  );
};

/** The slingshots: a triangle of posts with a rubber band round them and a coloured plastic on top. */
const Slingshot: React.FC<{ side: "L" | "R" }> = ({ side }) => {
  const pts = LAY.slings[side] as [number, number][];
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const c = pts.map(([x, y]) => new THREE.Vector2(x, y));
    const cen = c[0].clone().add(c[1]).add(c[2]).multiplyScalar(1 / 3);
    const grow = c.map((p) => p.clone().sub(cen).multiplyScalar(1.12).add(cen));
    s.moveTo(grow[0].x, grow[0].y);
    s.lineTo(grow[1].x, grow[1].y);
    s.lineTo(grow[2].x, grow[2].y);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false });
    // shape is in table x,y: lay it flat at height 0.034
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.034, 0);
    return g;
  }, [pts]);
  const band = useMemo(() => {
    const c = pts.map(([x, y]) => new THREE.Vector3(x, 0.017, -y));
    const curve = new THREE.CatmullRomCurve3([...c, c[0]], true, "catmullrom", 0.05);
    return new THREE.TubeGeometry(curve, 60, 0.0028, 8, true);
  }, [pts]);
  return (
    <group>
      {pts.map(([x, y], i) => (
        <Post key={i} x={x} y={y} ring="#F4F1EA" h={0.034} />
      ))}
      <mesh geometry={band} material={rubber("#F7F4EE")} />
      <mesh geometry={shape} material={translucent(side === "L" ? "#FF4FA0" : "#3FD8FF", 0.85, 0.45)} />
    </group>
  );
};

const Apron: React.FC = () => {
  const geo = useMemo(() => {
    // a plate across the bottom with the drain gap in the middle
    const s = new THREE.Shape();
    const gap0 = XC - 0.03;
    const gap1 = XC + 0.03;
    s.moveTo(0, -0.03);
    s.lineTo(LAY.laneX, -0.03);
    s.lineTo(LAY.laneX, LAY.apronY);
    s.lineTo(XC + 0.105, LAY.apronY);
    s.lineTo(gap1, 0.042);
    s.lineTo(gap0, 0.042);
    s.lineTo(XC - 0.105, LAY.apronY);
    s.lineTo(0, LAY.apronY);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  return <mesh geometry={geo} material={plastic("#2B1446", 0.4)} />;
};

/** The cabinet: side walls up to the glass, the front, the dark under the apron. */
const Cabinet: React.FC = () => (
  <group>
    <mesh position={[-0.02, 0.06, -L / 2]} material={wood()}>
      <boxGeometry args={[0.04, 0.12, L + 0.12]} />
    </mesh>
    <mesh position={[W + 0.02, 0.06, -L / 2]} material={wood()}>
      <boxGeometry args={[0.04, 0.12, L + 0.12]} />
    </mesh>
    <mesh position={[W / 2, 0.06, 0.05]} material={wood()}>
      <boxGeometry args={[W + 0.08, 0.12, 0.04]} />
    </mesh>
    <mesh position={[W / 2, -0.06, -0.01]} material={wood()}>
      <boxGeometry args={[W, 0.02, 0.12]} />
    </mesh>
  </group>
);

/** The plunger at the bottom of the shooter lane: rod, spring and rubber tip (pulled back by `pull`). */
export const Plunger: React.FC<{ pull: number }> = ({ pull }) => {
  const x = 0.4945;
  const tipY = 0.06 - pull * 0.04;
  return (
    <group position={[x, LAY.R, 0]}>
      <mesh position={[0, 0, -tipY + 0.006]} rotation={[Math.PI / 2, 0, 0]} material={rubber("#141018")}>
        <cylinderGeometry args={[0.0075, 0.0075, 0.012, 18]} />
      </mesh>
      <mesh position={[0, 0, -tipY + 0.04]} rotation={[Math.PI / 2, 0, 0]} material={chrome()}>
        <cylinderGeometry args={[0.003, 0.003, 0.07, 10]} />
      </mesh>
    </group>
  );
};

export const Table: React.FC = () => {
  const steel = steelDull();
  const g = LAY.laneGuides;
  return (
    <group>
      <Playfield />
      <Cabinet />
      <Arch />
      {/* side walls, the shooter lane, the right-hand lane */}
      <Wall a={[0, LAY.apronY]} b={[0, LAY.archC[1]]} h={0.036} t={0.003} mat={steel} />
      <Wall a={[W, 0]} b={[W, LAY.archC[1]]} h={0.036} t={0.003} mat={steel} />
      <Wall a={[LAY.laneX, 0.06]} b={[LAY.laneX, 0.74]} h={0.028} t={0.008} mat={wood()} />
      <Wall a={[LAY.laneX, 0.06]} b={[LAY.laneX, 0.74]} h={0.003} t={0.009} mat={steel} y0={0.028} />
      <Wall a={[LAY.rightLane[0], LAY.rightLane[1]]} b={[LAY.rightLane[0], LAY.rightLane[2]]} h={0.026} t={0.003} mat={steel} />
      {/* top lane guides */}
      {g.map((x, i) => (
        <group key={i}>
          <Wall a={[x, LAY.laneY[0]]} b={[x, LAY.laneY[1]]} h={0.022} t={0.002} mat={steel} />
          <Post x={x} y={LAY.laneY[0]} ring="#FF4FA0" h={0.026} />
        </group>
      ))}
      {/* inlane guides: steel wire forms, posts at the bends */}
      {(["L", "R"] as const).map((side) => {
        const p = LAY.inlanes[side] as [number, number][];
        return (
          <group key={side}>
            <Wall a={p[0]} b={p[1]} h={0.02} t={0.003} mat={steel} />
            <Wall a={p[1]} b={p[2]} h={0.02} t={0.003} mat={steel} />
            <Post x={p[1][0]} y={p[1][1]} ring="#3FD8FF" />
            <Post x={p[2][0]} y={p[2][1]} ring="#3FD8FF" />
          </group>
        );
      })}
      <Slingshot side="L" />
      <Slingshot side="R" />
      <Apron />
      {/* the one-way gate at the top of the shooter lane */}
      <mesh position={[(LAY.laneX + W) / 2, 0.022, -LAY.gateY]} material={chrome()}>
        <boxGeometry args={[W - LAY.laneX, 0.0015, 0.0015]} />
      </mesh>
    </group>
  );
};
