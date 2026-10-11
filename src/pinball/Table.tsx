import React, { useMemo } from "react";
import * as THREE from "three";
import { detailTexture, pcbTexture, playfieldTexture, sideTexture } from "./art";
import { black, chrome, plastic, rubber, std, steelDull, translucent, wood } from "./mats";
import { LAY } from "./timeline";

/**
 * Everything on the table that doesn't move: the printed playfield (clear-coated), the cabinet walls with
 * their art and steel ball guides, the top arch, lane guides, posts with rubber rings, the slingshots,
 * the shooter lane with its plunger and trapdoor, the raised apron, and under it the trough the ball
 * drains into. Three.js metres: x across, y up off the playfield, z = -(table y).
 */

const W = LAY.W;
const L = LAY.L;
const XC = LAY.XC;
/** The playfield stops here under the apron: past it a ball drops into the trough. */
export const DRAIN_EDGE = 0.03;
/** The trapdoor in the shooter lane floor (the trough's eject comes up through it). */
export const FLAP = { x0: 0.4775, x1: 0.5115, y0: 0.06, y1: 0.09 };
/** Heights of things under the playfield. */
const TROUGH_FLOOR = -0.0435;
const APRON_H = 0.029;
const APRON_T = 0.004;

/** A flat piece of the playfield over a table rectangle; UVs come from the table position, so every piece
 * shows its part of the one print. */
const fieldGeo = (x0: number, x1: number, y0: number, y1: number, h = 0, down = false) => {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
  g.translate((x0 + x1) / 2, h, -(y0 + y1) / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W, -pos.getZ(i) / L);
  return g;
};

export const playfieldMat = () =>
  std(
    "playfield",
    () =>
      new THREE.MeshPhysicalMaterial({
        map: playfieldTexture(),
        roughness: 0.62,
        metalness: 0,
        clearcoat: 0.65,
        clearcoatRoughness: 0.75,
        clearcoatRoughnessMap: detailTexture(),
        envMapIntensity: 0.7,
      }),
  );

/** A wall (thin box) standing on the playfield between two table points. */
export const Wall: React.FC<{
  a: [number, number];
  b: [number, number];
  h: number;
  t?: number;
  mat: THREE.Material | THREE.Material[];
  y0?: number;
}> = ({ a, b, h, t = 0.004, mat, y0 = 0 }) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  return (
    <mesh
      position={[(a[0] + b[0]) / 2, y0 + h / 2, -(a[1] + b[1]) / 2]}
      rotation={[0, ang, 0]}
      material={mat}
    >
      <boxGeometry args={[len + t, h, t]} />
    </mesh>
  );
};

/** A chrome post with a rubber ring round it. */
export const Post: React.FC<{ x: number; y: number; ring?: string; h?: number }> = ({
  x,
  y,
  ring = "#F4F1EA",
  h = 0.032,
}) => (
  <group position={[x, 0, -y]}>
    <mesh position={[0, h / 2, 0]} material={chrome()}>
      <cylinderGeometry args={[0.0032, 0.0036, h, 16]} />
    </mesh>
    <mesh position={[0, h, 0]} material={chrome()}>
      <sphereGeometry args={[0.0036, 14, 10]} />
    </mesh>
    <mesh position={[0, 0.014, 0]} rotation={[Math.PI / 2, 0, 0]} material={rubber(ring)}>
      <torusGeometry args={[0.0062, 0.0028, 12, 24]} />
    </mesh>
  </group>
);

/** Polished stainless steel for the ball guides and the arch. */
const guideSteel = () =>
  std(
    "guideSteel",
    () => new THREE.MeshStandardMaterial({ color: "#D9DEE6", metalness: 1, roughness: 0.18 }),
  );

/** The top arch: a curved steel band with a rolled top edge. */
const Arch: React.FC = () => {
  const geos = useMemo(() => {
    const [cx, cy] = LAY.archC;
    const r = LAY.archR + 0.002;
    const band = new THREE.CylinderGeometry(r, r, 0.036, 128, 1, true, 0, Math.PI);
    // CylinderGeometry's theta starts at +z; rotate so it spans the top half (table +y)
    band.rotateY(Math.PI / 2);
    band.translate(cx, 0.018, -cy);
    const lip = new THREE.TorusGeometry(r - 0.0005, 0.0018, 8, 128, Math.PI);
    lip.rotateX(-Math.PI / 2);
    lip.translate(cx, 0.036, -cy);
    return { band, lip };
  }, []);
  return (
    <group>
      <mesh geometry={geos.band} material={guideSteel()} />
      <mesh geometry={geos.lip} material={guideSteel()} />
    </group>
  );
};

/** The printed playfield, in pieces round the drain, the shooter lane's trapdoor and its pocket. */
const Playfield: React.FC<{ flap: number }> = ({ flap }) => {
  const geos = useMemo(
    () => ({
      main: fieldGeo(0, W, FLAP.y1, L),
      low: fieldGeo(0, FLAP.x0, DRAIN_EDGE, FLAP.y1),
      lane: fieldGeo(FLAP.x0, W, -0.028, FLAP.y0),
      laneR: fieldGeo(FLAP.x1, W, FLAP.y0, FLAP.y1),
      // the trapdoor, relative to its hinge (the far edge)
      flapTop: (() => {
        const g = fieldGeo(FLAP.x0, FLAP.x1, FLAP.y0, FLAP.y1);
        g.translate(0, 0, FLAP.y1);
        return g;
      })(),
      flapUnder: (() => {
        const g = fieldGeo(FLAP.x0, FLAP.x1, FLAP.y0, FLAP.y1, -0.002, true);
        g.translate(0, 0, FLAP.y1);
        return g;
      })(),
      // the underside of the shooter lane, seen from the trough
      laneUnder: fieldGeo(FLAP.x0 - 0.004, W, -0.028, FLAP.y0, -0.001, true),
      pocketUnder: fieldGeo(FLAP.x0 - 0.004, W, FLAP.y1, FLAP.y1 + 0.006, -0.001, true),
    }),
    [],
  );
  const mat = playfieldMat();
  return (
    <group>
      <mesh geometry={geos.main} material={mat} />
      <mesh geometry={geos.low} material={mat} />
      <mesh geometry={geos.lane} material={mat} />
      <mesh geometry={geos.laneR} material={mat} />
      <group position={[0, 0, -FLAP.y1]} rotation={[flap * 1.52, 0, 0]}>
        <mesh geometry={geos.flapTop} material={mat} />
        <mesh geometry={geos.flapUnder} material={steelDull()} />
      </group>
      <mesh geometry={geos.laneUnder} material={black()} />
      <mesh geometry={geos.pocketUnder} material={black()} />
    </group>
  );
};

/** The slingshots: a triangle of posts with a rubber band round them and a coloured plastic on top. */
const Slingshot: React.FC<{ side: "L" | "R" }> = ({ side }) => {
  const pts = LAY.slings[side] as [number, number][];
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const c = pts.map(([x, y]) => new THREE.Vector2(x, y));
    const cen = c[0]
      .clone()
      .add(c[1])
      .add(c[2])
      .multiplyScalar(1 / 3);
    const grow = c.map((p) => p.clone().sub(cen).multiplyScalar(1.12).add(cen));
    s.moveTo(grow[0].x, grow[0].y);
    s.lineTo(grow[1].x, grow[1].y);
    s.lineTo(grow[2].x, grow[2].y);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.003,
      bevelEnabled: true,
      bevelSize: 0.001,
      bevelThickness: 0.001,
      bevelSegments: 2,
    });
    // shape is in table x,y: lay it flat at height 0.034
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.034, 0);
    return g;
  }, [pts]);
  const band = useMemo(() => {
    const c = pts.map(([x, y]) => new THREE.Vector3(x, 0.017, -y));
    const curve = new THREE.CatmullRomCurve3([...c, c[0]], true, "catmullrom", 0.05);
    return new THREE.TubeGeometry(curve, 90, 0.0028, 10, true);
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

/**
 * The apron: a raised plastic plate across the bottom. Its front edge comes down to the playfield at the
 * sides; in the middle (the drain) it stands clear, and the ball rolls under it, off the end of the
 * playfield and into the trough.
 */
const Apron: React.FC = () => {
  const a0 = XC - 0.105;
  const a1 = XC + 0.105;
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.028);
    s.lineTo(LAY.laneX, -0.028);
    s.lineTo(LAY.laneX, LAY.apronY);
    s.lineTo(a1, LAY.apronY);
    s.lineTo(XC + 0.035, 0.046);
    s.lineTo(XC - 0.035, 0.046);
    s.lineTo(a0, LAY.apronY);
    s.lineTo(0, LAY.apronY);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: APRON_T,
      bevelEnabled: true,
      bevelSize: 0.0015,
      bevelThickness: 0.0015,
      bevelSegments: 3,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, APRON_H, 0);
    return g;
  }, [a0, a1]);
  const mat = plastic("#2B1446", 0.35);
  const lip = plastic("#1E0C33", 0.45);
  const stripe = useMemo(() => {
    // hazard stripes on the drain's lip
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 32;
    const g = c.getContext("2d")!;
    g.fillStyle = "#14051F";
    g.fillRect(0, 0, 512, 32);
    g.fillStyle = "#FFC93C";
    for (let x = -32; x < 512; x += 32) {
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 16, 32);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 16, 0);
      g.closePath();
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(4, 1);
    t.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 });
  }, []);
  const lipH = APRON_H + APRON_T;
  return (
    <group>
      <mesh geometry={geo} material={mat} />
      {/* the front lip: down to the playfield at the sides (the outlanes end here) */}
      <Wall a={[0, LAY.apronY]} b={[a0, LAY.apronY]} h={lipH} t={0.003} mat={lip} />
      <Wall a={[a1, LAY.apronY]} b={[LAY.laneX, LAY.apronY]} h={lipH} t={0.003} mat={lip} />
      {/* ...and clear of the ball over the drain */}
      <Wall a={[a0, LAY.apronY]} b={[XC - 0.035, 0.046]} h={0.0045} y0={0.0285} t={0.003} mat={stripe} />
      <Wall a={[XC - 0.035, 0.046]} b={[XC + 0.035, 0.046]} h={0.0045} y0={0.0285} t={0.003} mat={stripe} />
      <Wall a={[XC + 0.035, 0.046]} b={[a1, LAY.apronY]} h={0.0045} y0={0.0285} t={0.003} mat={stripe} />
    </group>
  );
};

/** Red LEDs on the trough's opto board (they glow in the dark). */
const LED_X = [0.06, 0.14, 0.22, 0.3, 0.38, 0.45];

/**
 * The trough: a steel channel under the apron, sloping to the right, where drained balls wait. A green
 * opto board along the back with red LEDs, a ball stop, the eject coil at the right-hand end, and a
 * pocket running under the shooter lane up to the trapdoor.
 */
const Trough: React.FC = () => {
  const floor = steelDull();
  const dark = black();
  const pcbMat = useMemo(() => new THREE.MeshStandardMaterial({ map: pcbTexture(), roughness: 0.5 }), []);
  const led = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.2, 0.15), toneMapped: false }),
    [],
  );
  const copper = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#C87533", metalness: 1, roughness: 0.32 }),
    [],
  );
  const h = -TROUGH_FLOOR;
  return (
    <group>
      {/* floor */}
      <mesh
        position={[(0.002 + FLAP.x1) / 2, TROUGH_FLOOR - 0.001, -(-0.028 + DRAIN_EDGE + 0.001) / 2]}
        material={floor}
      >
        <boxGeometry args={[FLAP.x1 - 0.002, 0.002, DRAIN_EDGE + 0.029]} />
      </mesh>
      <mesh
        position={[(FLAP.x0 + FLAP.x1) / 2, TROUGH_FLOOR - 0.001, -(DRAIN_EDGE + FLAP.y1 + 0.004) / 2]}
        material={floor}
      >
        <boxGeometry args={[FLAP.x1 - FLAP.x0, 0.002, FLAP.y1 + 0.004 - DRAIN_EDGE]} />
      </mesh>
      {/* the back wall under the playfield's end: the opto board */}
      <mesh
        position={[(0.002 + FLAP.x0) / 2, TROUGH_FLOOR / 2, -(DRAIN_EDGE + 0.001)]}
        material={[dark, dark, dark, dark, pcbMat, dark]}
      >
        <boxGeometry args={[FLAP.x0 - 0.002, h, 0.002]} />
      </mesh>
      {LED_X.map((x) => (
        <mesh key={x} position={[x, TROUGH_FLOOR + 0.012, -DRAIN_EDGE + 0.0005]} material={led}>
          <sphereGeometry args={[0.0018, 10, 8]} />
        </mesh>
      ))}
      {/* the front: the cabinet's front wall, up to the apron */}
      <mesh position={[W / 2, (TROUGH_FLOOR + APRON_H + APRON_T) / 2, 0.029]} material={dark}>
        <boxGeometry args={[W, APRON_H + APRON_T - TROUGH_FLOOR, 0.002]} />
      </mesh>
      {/* the pocket under the shooter lane */}
      <mesh
        position={[FLAP.x0 - 0.001, TROUGH_FLOOR / 2, -(DRAIN_EDGE + FLAP.y1 + 0.004) / 2]}
        material={floor}
      >
        <boxGeometry args={[0.002, h, FLAP.y1 + 0.004 - DRAIN_EDGE]} />
      </mesh>
      <mesh position={[(FLAP.x0 + FLAP.x1) / 2, TROUGH_FLOOR / 2, -(FLAP.y1 + 0.005)]} material={floor}>
        <boxGeometry args={[FLAP.x1 - FLAP.x0, h, 0.002]} />
      </mesh>
      {/* end walls */}
      <mesh position={[0.001, TROUGH_FLOOR / 2, -(DRAIN_EDGE - 0.028) / 2]} material={dark}>
        <boxGeometry args={[0.002, h, DRAIN_EDGE + 0.028]} />
      </mesh>
      <mesh position={[FLAP.x1 + 0.001, TROUGH_FLOOR / 2, -(FLAP.y1 + 0.004 - 0.028) / 2]} material={floor}>
        <boxGeometry args={[0.002, h, FLAP.y1 + 0.032]} />
      </mesh>
      {/* the ball stop: a steel tab sticking up just past where the ball waits */}
      <mesh position={[0.4875, TROUGH_FLOOR + 0.006, -0.008]} material={chrome()}>
        <boxGeometry args={[0.002, 0.012, 0.016]} />
      </mesh>
      {/* the eject coil hanging under the playfield at the end, copper windings and a black wrap */}
      <group position={[0.4945, -0.012, 0.012]} rotation={[0, 0, 0]}>
        <mesh material={copper}>
          <cylinderGeometry args={[0.009, 0.009, 0.02, 24]} />
        </mesh>
        <mesh material={dark}>
          <cylinderGeometry args={[0.0093, 0.0093, 0.008, 24]} />
        </mesh>
        <mesh position={[0, -0.012, 0]} material={chrome()}>
          <cylinderGeometry args={[0.003, 0.003, 0.008, 12]} />
        </mesh>
      </group>
      {/* wires */}
      {[
        ["#E8263A", 0.004],
        ["#FFC020", 0.007],
        ["#2FA0FF", 0.01],
      ].map(([c, o], i) => (
        <mesh
          key={i}
          position={[0.25, -0.0045 - (o as number) * 0.4, -0.022 + (o as number)]}
          rotation={[0, 0, Math.PI / 2]}
          material={plastic(c as string, 0.5)}
        >
          <cylinderGeometry args={[0.0011, 0.0011, 0.46, 8]} />
        </mesh>
      ))}
    </group>
  );
};

/** The cabinet: side walls up to the glass with their art, the front. */
const Cabinet: React.FC = () => {
  const mats = useMemo(() => {
    const t = sideTexture();
    const a = t.clone();
    a.repeat.set(1, 1.4167);
    a.offset.set(0, -0.4167);
    a.needsUpdate = true;
    const b = a.clone();
    b.repeat.set(-1, 1.4167);
    b.offset.set(1, -0.4167);
    b.needsUpdate = true;
    const artL = new THREE.MeshStandardMaterial({ map: a, roughness: 0.8 });
    const artR = new THREE.MeshStandardMaterial({ map: b, roughness: 0.8 });
    return { artL, artR };
  }, []);
  const w = wood();
  const H = 0.17;
  const Y = 0.12 - H / 2;
  return (
    <group>
      {/* faces: +x, -x, +y, -y, +z, -z */}
      <mesh position={[-0.02, Y, -L / 2 + 0.01]} material={[mats.artL, w, w, w, w, w]}>
        <boxGeometry args={[0.04, H, L + 0.1]} />
      </mesh>
      <mesh position={[W + 0.02, Y, -L / 2 + 0.01]} material={[w, mats.artR, w, w, w, w]}>
        <boxGeometry args={[0.04, H, L + 0.1]} />
      </mesh>
      <mesh position={[W / 2, Y, 0.05]} material={w}>
        <boxGeometry args={[W + 0.08, H, 0.04]} />
      </mesh>
      {/* the back */}
      <mesh position={[W / 2, Y, -L - 0.02]} material={w}>
        <boxGeometry args={[W + 0.08, H, 0.04]} />
      </mesh>
    </group>
  );
};

/** A coil spring along z, one unit long (scaled to length). */
const springGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    const turns = 14;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= turns * 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.0052, Math.sin(a) * 0.0052, i / (turns * 24)));
    }
    g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, 0.0007, 6, false);
    return g;
  };
})();

/** The plunger at the bottom of the shooter lane: rubber tip, rod, spring; `tip` is the table y of its
 * front face (0.06 at rest). */
export const Plunger: React.FC<{ tip: number }> = ({ tip }) => {
  const x = 0.4945;
  // the spring runs from the back of the tip to the housing in the cabinet's front wall
  const back = tip - 0.0132;
  const springLen = back + 0.028;
  return (
    <group position={[x, LAY.R, 0]}>
      <mesh position={[0, 0, -tip + 0.006]} rotation={[Math.PI / 2, 0, 0]} material={rubber("#141018")}>
        <cylinderGeometry args={[0.0075, 0.0075, 0.012, 24]} />
      </mesh>
      <mesh position={[0, 0, -back - 0.0006]} rotation={[Math.PI / 2, 0, 0]} material={chrome()}>
        <cylinderGeometry args={[0.0064, 0.0064, 0.0012, 24]} />
      </mesh>
      <mesh position={[0, 0, -tip + 0.045]} rotation={[Math.PI / 2, 0, 0]} material={chrome()}>
        <cylinderGeometry args={[0.003, 0.003, 0.075, 12]} />
      </mesh>
      <mesh geometry={springGeo()} position={[0, 0, 0.028]} scale={[1, 1, -springLen]} material={chrome()} />
    </group>
  );
};

export const Table: React.FC<{ flap: number }> = ({ flap }) => {
  const steel = guideSteel();
  const g = LAY.laneGuides;
  return (
    <group>
      <Playfield flap={flap} />
      <Cabinet />
      <Trough />
      <Arch />
      {/* steel ball guides along the side walls, the shooter lane wall, the right-hand lane */}
      <Wall a={[0.0015, -0.028]} b={[0.0015, LAY.archC[1]]} h={0.036} t={0.003} mat={steel} />
      <Wall a={[W - 0.0015, -0.028]} b={[W - 0.0015, LAY.archC[1]]} h={0.036} t={0.003} mat={steel} />
      <Wall a={[LAY.laneX, -0.028]} b={[LAY.laneX, 0.74]} h={0.028} t={0.008} mat={wood()} />
      <Wall a={[LAY.laneX, -0.028]} b={[LAY.laneX, 0.74]} h={0.003} t={0.0095} mat={steel} y0={0.028} />
      <Wall
        a={[LAY.rightLane[0], LAY.rightLane[1]]}
        b={[LAY.rightLane[0], LAY.rightLane[2]]}
        h={0.026}
        t={0.003}
        mat={steel}
      />
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

export const TROUGH_LEDS = LED_X;
