import React, { useMemo } from "react";
import * as THREE from "three";
import { Googly } from "./Googly";
import { glossy, plastic, std } from "./mats";
import { Ctx, since } from "./Parts";
import { LAY, M } from "./timeline";

/**
 * The monster: a big glossy toy head up in the top-left corner (mounted high: the balls rolling round
 * the top arch pass under its chin), googly eyes that follow you, horns, and a mouth. Its tongue is the
 * ramp: a pink ribbon from the playfield up into the mouth. Inside the mouth is a cave of its own (you
 * spend four seconds in there), with teeth that close on CHOMP, chew, and open for the burp.
 */

const TC = LAY.tongue as number[][]; // control points: table x, y, height
const HEAD = new THREE.Vector3(LAY.monster[0], 0.1, -LAY.monster[1]);
const HEAD_R = 0.072;
const MOUTH_TOP = new THREE.Vector3(TC[3][0], TC[3][2], -TC[3][1]); // where the tongue meets the mouth
const MOUTH_IN = new THREE.Vector3(LAY.mouthIn[0], LAY.mouthIn[2] + LAY.R, -LAY.mouthIn[1]);
// the mouth looks out along the tongue, down and towards the playfield
const MOUTH_DIR = MOUTH_TOP.clone().sub(MOUTH_IN).setY(0).normalize();
const MOUTH_C = MOUTH_IN.clone().add(MOUTH_DIR.clone().multiplyScalar(0.012));

/** The tongue's centre line (Catmull-Rom through the control points, as in the generator). */
export const tongueCurve = (() => {
  const pts = TC.map(([x, y, h]) => new THREE.Vector3(x, h, -y));
  return new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
})();

const tongueMat = () =>
  std("tongue", () => {
    // papillae: little bumps, a darker groove down the middle
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 1024;
    const g = c.getContext("2d")!;
    g.fillStyle = "#F0608E";
    g.fillRect(0, 0, 256, 1024);
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 2600; i++) {
      const x = r() * 256;
      const y = r() * 1024;
      g.fillStyle = r() > 0.5 ? "rgba(255,170,200,0.55)" : "rgba(170,30,80,0.35)";
      g.beginPath();
      g.arc(x, y, 1.5 + r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    const gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0.42, "rgba(120,10,50,0)");
    gr.addColorStop(0.5, "rgba(120,10,50,0.45)");
    gr.addColorStop(0.58, "rgba(120,10,50,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 1024);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return new THREE.MeshPhysicalMaterial({
      map: t,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
      side: THREE.DoubleSide,
    });
  });

/** The tongue as a ramp: a ribbon with curled-up edges and a groove, 4 mm thick. */
const Tongue: React.FC = () => {
  const geo = useMemo(() => {
    const N = 120;
    const U = 15;
    const half = 0.024;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const p = tongueCurve.getPointAt(s);
      const tan = tongueCurve.getTangentAt(s);
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      for (let j = 0; j <= U; j++) {
        const u = (j / U) * 2 - 1;
        const curl = Math.pow(Math.abs(u), 4) * 0.007;
        const groove = -0.0012 * Math.exp(-Math.pow(u / 0.22, 2));
        const q = p.clone().addScaledVector(side, u * half);
        q.y += curl + groove + 0.0006;
        pos.push(q.x, q.y, q.z);
        uv.push(j / U, s * 3);
      }
    }
    // underside (flat, 4 mm down) so it reads as a solid tongue from below and the sides
    const off = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const p = tongueCurve.getPointAt(s);
      const tan = tongueCurve.getTangentAt(s);
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      for (let j = 0; j <= U; j++) {
        const u = (j / U) * 2 - 1;
        const q = p.clone().addScaledVector(side, u * half * 0.96);
        q.y = Math.max(0.0002, q.y - 0.004);
        pos.push(q.x, q.y, q.z);
        uv.push(j / U, s * 3);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < U; j++) {
        const a = i * (U + 1) + j;
        const b = a + U + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
        idx.push(off + a, off + a + 1, off + b, off + b, off + a + 1, off + b + 1);
      }
      // the two side walls
      for (const j of [0, U]) {
        const a = i * (U + 1) + j;
        const b = a + U + 1;
        idx.push(a, off + a, b, b, off + a, off + b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
  return <mesh geometry={geo} material={tongueMat()} />;
};

/** Wet flesh: dark red with pink ridges across the roof of the mouth and a few veins. */
const fleshTexture = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const g = c.getContext("2d")!;
    const bg = g.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, "#9C1840");
    bg.addColorStop(0.5, "#C2335E");
    bg.addColorStop(1, "#7E1236");
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 512);
    // ridges
    for (let i = 0; i < 14; i++) {
      const y = 20 + i * 36;
      g.strokeStyle = "rgba(255, 150, 180, 0.55)";
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 8);
      g.stroke();
      g.strokeStyle = "rgba(80, 0, 30, 0.5)";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(0, y + 9);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + 9 + Math.sin(x * 0.05 + i) * 8);
      g.stroke();
    }
    // veins
    let s = 9;
    const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    g.strokeStyle = "rgba(90, 10, 60, 0.6)";
    g.lineWidth = 2.5;
    for (let i = 0; i < 26; i++) {
      let x = r() * 512;
      let y = r() * 512;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 60;
        y += (r() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 1);
    return t;
  };
})();
/** Inside the mouth the table's lights would shine straight through the head (no shadows), so the flesh
 * glows with its own colour and only takes the wet highlights from outside. */
const fleshProps = () => ({
  map: fleshTexture(),
  color: "#2A0A14",
  emissive: "#FFFFFF",
  emissiveMap: fleshTexture(),
  emissiveIntensity: 0.55,
  roughness: 0.35,
  clearcoat: 1,
  clearcoatRoughness: 0.12,
});
const flesh = () =>
  std("flesh", () => new THREE.MeshPhysicalMaterial({ ...fleshProps(), side: THREE.BackSide }));
const fleshPlate = () =>
  std("fleshPlate", () => new THREE.MeshPhysicalMaterial({ ...fleshProps(), side: THREE.DoubleSide }));
const toothM = () =>
  std(
    "tooth",
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#FFFDF4",
        emissive: "#FFF6E8",
        emissiveIntensity: 0.05,
        roughness: 0.3,
        clearcoat: 0.8,
      }),
  );
const coinM = () =>
  std("coin", () => new THREE.MeshStandardMaterial({ color: "#9EA3AC", metalness: 0.85, roughness: 0.5 }));
/** The tongue's back end inside the mouth: right under the camera, so matte (no flare). */
const tongueFloor = () =>
  std("tongueFloor", () => {
    const m = (tongueMat() as THREE.MeshPhysicalMaterial).clone();
    m.roughness = 0.6;
    m.clearcoat = 0.2;
    m.clearcoatRoughness = 0.5;
    // self-lit like the flesh round it
    m.color.set("#301018");
    m.emissive.set("#FFFFFF");
    m.emissiveMap = m.map;
    m.emissiveIntensity = 0.5;
    return m;
  });

/** How open the jaws are: 1 wide open; closes on the chomp, chews, opens for the burp. */
const jawOpen = (t: number) => {
  const c = M.chomp;
  const b = M.burp;
  if (t < c - 0.05) return 1;
  if (t < c + 0.18) return 1 - (t - (c - 0.05)) / 0.23;
  if (t < b - 0.35) {
    // chewing: opening a crack now and then
    const k = (t - c - 0.18) / (b - 0.35 - c - 0.18);
    const chew = Math.max(0, Math.sin((t - c) * 7.5)) * 0.28 * (0.6 + 0.4 * Math.sin(k * 9));
    return chew;
  }
  if (t < b) return ((t - (b - 0.35)) / 0.35) * 1.25;
  return Math.max(1, 1.25 - (t - b) * 0.5);
};

/** A row of teeth along an arc round the mouth (pointing `down` for the top row). */
const TeethRow: React.FC<{ n: number; r: number; spread: number; down: boolean; y: number }> = ({
  n,
  r,
  spread,
  down,
  y,
}) => (
  <group position={[0, y, 0]}>
    {Array.from({ length: n }).map((_, i) => {
      const a = (i / (n - 1) - 0.5) * spread;
      const big = i === 1 || i === n - 2 ? 1.5 : 1;
      return (
        <mesh
          key={i}
          position={[Math.sin(a) * r, 0, Math.cos(a) * r - r]}
          rotation={[down ? Math.PI : 0, 0, 0]}
          material={toothM()}
        >
          <coneGeometry args={[0.0045 * big, 0.012 * big, 10]} />
        </mesh>
      );
    })}
  </group>
);

export const Monster: React.FC<{ ctx: Ctx; inside: boolean }> = ({ ctx, inside }) => {
  const open = jawOpen(ctx.t);
  const gap = 0.006 + open * 0.022;
  // the head turns a little towards you, and wobbles when you hit it or it chomps
  const s = Math.min(since(ctx, "chomp"), since(ctx, "burp"));
  const wob = Math.exp(-s / 0.4) * Math.sin(s * 22) * 0.06;
  const yaw = Math.atan2(MOUTH_DIR.x, MOUTH_DIR.z);
  const head = (
    <group position={HEAD} rotation={[0, yaw, wob]}>
      {/* the head, glossy purple, a lighter muzzle */}
      <mesh scale={[1, 0.9, 1]} material={glossy("#7A2BD6")}>
        <sphereGeometry args={[HEAD_R, 48, 32]} />
      </mesh>
      <mesh position={[0, -0.03, 0.04]} scale={[1, 0.62, 0.8]} material={glossy("#9B5CF0")}>
        <sphereGeometry args={[0.05, 32, 20]} />
      </mesh>
      {/* horns */}
      {[-1, 1].map((sd) => (
        <mesh
          key={sd}
          position={[sd * 0.045, 0.058, -0.01]}
          rotation={[-0.25, 0, -sd * 0.45]}
          material={glossy("#FFE08A")}
        >
          <coneGeometry args={[0.012, 0.05, 18]} />
        </mesh>
      ))}
      {/* green spots */}
      {[
        [0.05, 0.03, 0.04],
        [-0.055, 0.01, 0.03],
        [0.02, 0.055, -0.03],
        [-0.03, -0.01, -0.06],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} material={glossy("#5BE34A")}>
          <sphereGeometry args={[0.012 + (i % 2) * 0.004, 16, 10]} />
        </mesh>
      ))}
      {/* the mouth from outside: dark, lips, teeth */}
      <group position={[0, -0.045, 0.058]} rotation={[0.35, 0, 0]}>
        <mesh scale={[1, Math.max(0.15, gap / 0.028), 0.35]} material={plastic("#1A0210", 0.6)}>
          <sphereGeometry args={[0.03, 24, 16]} />
        </mesh>
        <TeethRow n={6} r={0.028} spread={1.9} down y={gap * 0.55} />
        <TeethRow n={6} r={0.028} spread={1.9} down={false} y={-gap * 0.55} />
      </group>
    </group>
  );
  // eyes: world positions for the look-at
  const eyes = [-1, 1].map((sd) => {
    const local = new THREE.Vector3(sd * 0.03, 0.035, 0.055).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    return { sd, world: HEAD.clone().add(local) };
  });
  // inside the mouth: a fleshy cave round you with a window out (the open mouth), teeth round the window
  const caveQ = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, -1, 0),
    MOUTH_DIR.clone().setY(-0.25).normalize(),
  );
  return (
    <group>
      <Tongue />
      {/* a glow inside the mouth to see by (always there, dark when you're not inside: changing the number
          of lights would recompile every shader) */}
      <pointLight
        position={MOUTH_IN.clone().add(new THREE.Vector3(0, 0.03, 0))}
        color="#FF7A9A"
        intensity={inside ? 0.0005 : 0}
        distance={0}
        decay={2}
      />
      {!inside ? (
        <>
          {head}
          {eyes.map(({ sd, world }) => (
            <Googly
              key={sd}
              pos={[world.x, world.y, world.z]}
              r={0.024}
              worldPos={world}
              look={ctx.cam}
              jolt={since(ctx, "chomp")}
              seed={sd + 20}
              t={ctx.t}
              stare={0.95}
            />
          ))}
          {/* the post it stands on */}
          <mesh position={[HEAD.x, 0.03, HEAD.z]} material={plastic("#2B1446", 0.4)}>
            <cylinderGeometry args={[0.02, 0.028, 0.06, 20]} />
          </mesh>
        </>
      ) : (
        <group>
          {/* the tongue's back end under you, and old quarters lying about on it */}
          <mesh
            position={[MOUTH_IN.x, MOUTH_IN.y - LAY.R - 0.0003, MOUTH_IN.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={tongueFloor()}
          >
            <circleGeometry args={[0.034, 40]} />
          </mesh>
          {[
            [0.019, -0.008, 0.3, 0.06],
            [-0.017, 0.012, 1.2, -0.08],
            [0.006, 0.022, 2.1, 0.1],
            [-0.004, -0.021, 0.7, 0.0],
          ].map(([dx, dz, r, tilt], i) => (
            <mesh
              key={i}
              position={[
                MOUTH_IN.x + dx,
                MOUTH_IN.y - LAY.R + 0.0009 + Math.abs(tilt) * 0.006,
                MOUTH_IN.z + dz,
              ]}
              rotation={[tilt, r, 0]}
              material={coinM()}
            >
              <cylinderGeometry args={[0.0121, 0.0121, 0.0018, 28]} />
            </mesh>
          ))}
          <group position={MOUTH_C} quaternion={caveQ}>
            <mesh material={flesh()}>
              <sphereGeometry args={[0.045, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.72]} />
            </mesh>
            {/* the uvula */}
            <mesh
              position={[0, 0.03, 0.012]}
              material={std(
                "uvula",
                () => new THREE.MeshPhysicalMaterial({ color: "#C2275E", roughness: 0.3, clearcoat: 1 }),
              )}
            >
              <sphereGeometry args={[0.006, 16, 12]} />
            </mesh>
            {/* the window out, framed by teeth: they close when it chews */}
            <group position={[0, -0.034, 0]}>
              <group position={[0, 0, -0.012 - gap * 0.4]}>
                <TeethRow n={7} r={0.03} spread={2.1} down={false} y={0} />
              </group>
              <group position={[0, 0, 0.012 + gap * 0.4]} rotation={[0, Math.PI, 0]}>
                <TeethRow n={7} r={0.03} spread={2.1} down={false} y={0} />
              </group>
              {/* the jaws' flesh closing over the window */}
              <mesh
                position={[0, -0.002, -0.03 + (1 - Math.min(1, open)) * 0.018]}
                rotation={[-Math.PI / 2, 0, 0]}
                material={fleshPlate()}
              >
                <planeGeometry args={[0.09, 0.04]} />
              </mesh>
              <mesh
                position={[0, -0.002, 0.03 - (1 - Math.min(1, open)) * 0.018]}
                rotation={[-Math.PI / 2, 0, 0]}
                material={fleshPlate()}
              >
                <planeGeometry args={[0.09, 0.04]} />
              </mesh>
            </group>
          </group>
        </group>
      )}
    </group>
  );
};

export const MOUTH = { top: MOUTH_TOP, inside: MOUTH_IN, dir: MOUTH_DIR };
