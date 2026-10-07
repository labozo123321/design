import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Easing, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import {
  BALLOONS,
  BUMP_Z,
  FOUNTAIN,
  PEOPLE,
  RIVER,
  ROAD_X,
  TREES,
  balloonPop,
  balloonSwell,
  blobs,
  drops,
  leaves,
  simCars,
  simPeople,
} from "./sim";
import { AIR_START, ZERO_AT, air, gravity } from "./timeline";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SMOOTH = Easing.bezier(0.45, 0, 0.25, 1);

/* ------------------------------------------------------------------ */
/* Materials + textures                                                 */
/* ------------------------------------------------------------------ */

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const M = (color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key))
    matCache.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...opts }),
    );
  return matCache.get(key)!;
};

const texCache = new Map<string, THREE.Texture>();
const facade = (base: string, cols: number, rows: number, seed: number) => {
  const key = `${base}${cols}${rows}${seed}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const c = document.createElement("canvas");
  c.width = cols * 32;
  c.height = rows * 40;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const lit = random(`fw${seed}${r}${k}`);
      g.fillStyle = "#F4F1EA";
      g.fillRect(k * 32 + 6, r * 40 + 8, 20, 26);
      g.fillStyle = lit > 0.85 ? "#E9C77B" : lit > 0.5 ? "#3B4A5E" : "#55667E";
      g.fillRect(k * 32 + 8, r * 40 + 10, 16, 22);
      if (lit > 0.92) {
        g.fillStyle = "#C0392B";
        g.fillRect(k * 32 + 8, r * 40 + 10, 16, 8);
      }
    }
  // ground-floor shopfronts
  g.fillStyle = "#2B2B2E";
  g.fillRect(0, c.height - 30, c.width, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
};

let tileTex: THREE.Texture | null = null;
const tiles = () => {
  if (tileTex) return tileTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#DCD6CC";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "#C9C2B6";
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0);
    g.lineTo(i * 64, 256);
    g.moveTo(0, i * 64);
    g.lineTo(256, i * 64);
    g.stroke();
  }
  tileTex = new THREE.CanvasTexture(c);
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.repeat.set(18, 14);
  tileTex.colorSpace = THREE.SRGBColorSpace;
  return tileTex;
};

/** The live gravity sign, redrawn each frame. */
let signCanvas: HTMLCanvasElement | null = null;
let signTex: THREE.CanvasTexture | null = null;
const sign = (text: string) => {
  if (!signCanvas) {
    signCanvas = document.createElement("canvas");
    signCanvas.width = 256;
    signCanvas.height = 128;
    signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
  }
  const g = signCanvas.getContext("2d")!;
  g.fillStyle = "#111";
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#F5C451";
  g.font = "bold 64px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 68);
  signTex!.needsUpdate = true;
  return signTex!;
};

/* ------------------------------------------------------------------ */
/* Static set                                                           */
/* ------------------------------------------------------------------ */

const BUILDINGS: { x: number; z: number; w: number; d: number; h: number; c: string }[] = [
  { x: -40, z: -34, w: 12, d: 10, h: 26, c: "#C8693E" },
  { x: -26, z: -36, w: 14, d: 12, h: 30, c: "#8C9DB5" },
  { x: -10, z: -33, w: 14, d: 10, h: 21, c: "#A9483A" },
  { x: 6, z: -40, w: 10, d: 10, h: 38, c: "#C9B9A3" },
  { x: 18, z: -38, w: 9, d: 9, h: 34, c: "#B9B4AE" },
  { x: 34, z: -33, w: 14, d: 10, h: 24, c: "#C8693E" },
  { x: 48, z: -36, w: 12, d: 12, h: 30, c: "#A9483A" },
  { x: -56, z: -38, w: 12, d: 12, h: 22, c: "#B9B4AE" },
];

const Set: React.FC = () => (
  <group>
    {/* plaza */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 12]} receiveShadow>
      <planeGeometry args={[120, 52]} />
      <meshStandardMaterial map={tiles()} roughness={0.9} />
    </mesh>
    {/* road + bumps */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROAD_X, 0.02, 14]} receiveShadow material={M("#55585E")}>
      <planeGeometry args={[7, 56]} />
    </mesh>
    {Array.from({ length: 12 }).map((_, i) => (
      <mesh
        key={i}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[ROAD_X, 0.03, -10 + i * 4.4]}
        material={M("#F2F2F2")}
      >
        <planeGeometry args={[0.2, 2]} />
      </mesh>
    ))}
    {BUMP_Z.map((z) => (
      <mesh key={z} position={[ROAD_X, 0.08, z]} material={M("#E6B33E")}>
        <boxGeometry args={[6.6, 0.16, 0.6]} />
      </mesh>
    ))}
    {/* embankment + railing */}
    <mesh position={[0, -0.6, -13.5]} receiveShadow castShadow material={M("#CFC6B5")}>
      <boxGeometry args={[140, 1.4, 1]} />
    </mesh>
    {Array.from({ length: 36 }).map((_, i) => (
      <mesh key={i} position={[-34 + i * 1.9, 0.55, -12.7]} castShadow material={M("#2A2A2E")}>
        <boxGeometry args={[0.08, 1.1, 0.08]} />
      </mesh>
    ))}
    <mesh position={[0, 1.1, -12.7]} material={M("#2A2A2E")}>
      <boxGeometry args={[68, 0.08, 0.08]} />
    </mesh>
    {/* far bank */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, -45]} receiveShadow material={M("#CFC6B5")}>
      <planeGeometry args={[160, 42]} />
    </mesh>
    <mesh position={[0, -0.5, -24.5]} material={M("#CFC6B5")}>
      <boxGeometry args={[160, 1.4, 1]} />
    </mesh>
    {BUILDINGS.map((b, i) => (
      <mesh key={i} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
        <boxGeometry args={[b.w, b.h, b.d]} />
        {[0, 1, 2, 3, 4, 5].map((f) =>
          f === 2 || f === 3 ? (
            <meshStandardMaterial key={f} attach={`material-${f}`} color={b.c} roughness={0.9} flatShading />
          ) : (
            <meshStandardMaterial
              key={f}
              attach={`material-${f}`}
              map={facade(b.c, Math.round(b.w / 2.2), Math.round(b.h / 3), i * 10 + f)}
              roughness={0.9}
            />
          ),
        )}
      </mesh>
    ))}
    {/* bridge: blue truss */}
    <group position={[-25, 0, -19]}>
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow material={M("#2F5D8C")}>
        <boxGeometry args={[5, 0.5, 13]} />
      </mesh>
      {[-2.4, 2.4].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 4.3, 0]} castShadow material={M("#2F5D8C")}>
            <boxGeometry args={[0.25, 0.25, 13]} />
          </mesh>
          {Array.from({ length: 7 }).map((_, i) => (
            <group key={i} position={[0, 0, -6 + i * 2]}>
              <mesh position={[0, 2.8, 0]} castShadow material={M("#2F5D8C")}>
                <boxGeometry args={[0.18, 3, 0.18]} />
              </mesh>
              {i < 6 ? (
                <mesh position={[0, 2.8, 1]} rotation={[i % 2 ? 0.58 : -0.58, 0, 0]} material={M("#2F5D8C")}>
                  <boxGeometry args={[0.14, 3.6, 0.14]} />
                </mesh>
              ) : null}
            </group>
          ))}
        </group>
      ))}
    </group>
    {/* subway entrance */}
    <group position={[8, 0, -2]}>
      <mesh position={[0, 0.5, 0]} castShadow material={M("#1E1E22")}>
        <boxGeometry args={[4, 1, 6]} />
      </mesh>
      <mesh position={[0, 1.01, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M("#08080A")}>
        <planeGeometry args={[3.4, 5.4]} />
      </mesh>
    </group>
    {/* benches */}
    {[-14, -4, 4, 14].map((x) => (
      <mesh key={x} position={[x, 0.45, -11.4]} castShadow material={M("#D9773F")}>
        <boxGeometry args={[2.6, 0.18, 0.7]} />
      </mesh>
    ))}
    {/* lamps */}
    {[
      [-20, 6],
      [-2, -9],
      [12, -10],
      [16, 4],
      [-14, 18],
      [6, 20],
      [-28, -8],
    ].map(([x, z]) => (
      <group key={`${x}${z}`} position={[x, 0, z]}>
        <mesh position={[0, 2.4, 0]} castShadow material={M("#1F1F24")}>
          <cylinderGeometry args={[0.09, 0.12, 4.8, 6]} />
        </mesh>
        <mesh
          position={[0, 4.95, 0]}
          material={M("#FFF6E0", { emissive: "#FFE7B8", emissiveIntensity: 0.4 })}
        >
          <icosahedronGeometry args={[0.38, 1]} />
        </mesh>
      </group>
    ))}
    {/* fountain */}
    <group position={[FOUNTAIN.x, 0, FOUNTAIN.z]}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow material={M("#E9E1D1")}>
        <cylinderGeometry args={[FOUNTAIN.rim + 0.3, FOUNTAIN.rim + 0.4, 0.7, 28]} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow material={M("#E9E1D1")}>
        <cylinderGeometry args={[0.45, 0.6, 1.8, 12]} />
      </mesh>
      <mesh position={[0, 2.2, 0]} castShadow material={M("#E9E1D1")}>
        <cylinderGeometry args={[1.3, 0.5, 0.4, 16]} />
      </mesh>
    </group>
    {/* balloon cart */}
    <group position={[3, 0, 13]}>
      <mesh position={[0, 0.7, 0]} castShadow material={M("#F2C230")}>
        <boxGeometry args={[2.2, 1.1, 1.2]} />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 0.25, 0.62]} rotation={[0, 0, Math.PI / 2]} material={M("#222")}>
          <cylinderGeometry args={[0.25, 0.25, 0.1, 10]} />
        </mesh>
      ))}
    </group>
    {/* trees */}
    {TREES.map((t, i) => (
      <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
        <mesh position={[0, 1.6, 0]} castShadow material={M("#6B4A2F")}>
          <cylinderGeometry args={[0.22, 0.32, 3.2, 6]} />
        </mesh>
        {[
          [0, 4.2, 0, 1.9],
          [1.3, 3.6, 0.4, 1.4],
          [-1.2, 3.8, -0.3, 1.5],
          [0.4, 5.3, -0.6, 1.3],
          [-0.5, 4.6, 1.0, 1.2],
        ].map(([x, y, z, r], k) => (
          <mesh key={k} position={[x, y, z]} castShadow material={M(k % 2 ? "#3F8A3A" : "#4E9E43")}>
            <icosahedronGeometry args={[r, 0]} />
          </mesh>
        ))}
      </group>
    ))}
  </group>
);

/* ------------------------------------------------------------------ */
/* Dynamic actors                                                       */
/* ------------------------------------------------------------------ */

const Person: React.FC<{ i: number; s: ReturnType<typeof simPeople>[number] }> = ({ i, s }) => {
  const p = PEOPLE[i];
  const sc = p.kid ? 0.68 : 1;
  const swing = s.airborne ? 0.5 : Math.sin(s.walk) * 0.55;
  const armsUp = s.airborne ? 2.4 : 0;
  return (
    <group position={[s.x, s.y, s.z]} rotation={[s.tumble, s.heading, s.tumble * 0.6]} scale={sc}>
      {[-1, 1].map((k) => (
        <mesh
          key={k}
          position={[k * 0.13, 0.85, 0]}
          rotation={[k * swing, 0, 0]}
          castShadow
          material={M(p.pants)}
        >
          <boxGeometry args={[0.2, 0.9, 0.22]} />
        </mesh>
      ))}
      <mesh position={[0, 1.27, 0]} castShadow material={M(p.shirt)}>
        <boxGeometry args={[0.52, 0.7, 0.3]} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh
          key={k}
          position={[k * 0.33, 1.3, 0]}
          rotation={[-k * swing * 0.8 - armsUp * 0.3, 0, k * (0.08 + armsUp * 0.25)]}
          castShadow
          material={M(p.shirt)}
        >
          <boxGeometry args={[0.14, 0.62, 0.16]} />
        </mesh>
      ))}
      <mesh position={[0, 1.78, 0]} castShadow material={M(p.skin)}>
        <icosahedronGeometry args={[0.2, 1]} />
      </mesh>
    </group>
  );
};

const Car: React.FC<{ z: number; y: number; pitch: number; color: string }> = ({ z, y, pitch, color }) => (
  <group position={[ROAD_X + 1.5, y, z]} rotation={[pitch, Math.PI, 0]}>
    <mesh position={[0, 0.65, 0]} castShadow material={M(color)}>
      <boxGeometry args={[1.9, 0.75, 4.2]} />
    </mesh>
    <mesh position={[0, 1.25, -0.2]} castShadow material={M("#2B3A4A")}>
      <boxGeometry args={[1.7, 0.6, 2.2]} />
    </mesh>
    {[
      [-0.9, 1.3],
      [0.9, 1.3],
      [-0.9, -1.3],
      [0.9, -1.3],
    ].map(([x, zz]) => (
      <mesh key={`${x}${zz}`} position={[x, 0.32, zz]} rotation={[0, 0, Math.PI / 2]} material={M("#18181B")}>
        <cylinderGeometry args={[0.32, 0.32, 0.25, 10]} />
      </mesh>
    ))}
  </group>
);

/* ------------------------------------------------------------------ */
/* Camera + world                                                       */
/* ------------------------------------------------------------------ */

const KEYS: [number, [number, number, number], [number, number, number]][] = [
  [0, [0, 30, 44], [-2, 0, -10]],
  [22, [-2, 23, 35], [-3, 1, -8]],
  [26, [-2, 21, 36], [-3, 5, -9]],
  [31, [0, 21, 37], [-2, 7, -10]],
  [41, [2, 31, 52], [0, 10, -14]],
];

const CameraRig: React.FC<{ t: number }> = ({ t }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const v = (k: 1 | 2, i: number) =>
    interpolate(
      t,
      KEYS.map((x) => x[0]),
      KEYS.map((x) => x[k][i]),
      { ...CLAMP, easing: SMOOTH },
    );
  camera.position.set(v(1, 0), v(1, 1), v(1, 2));
  camera.lookAt(v(2, 0), v(2, 1), v(2, 2));
  camera.fov = 56;
  camera.near = 0.5;
  camera.far = 400;
  camera.updateProjectionMatrix();
  return null;
};

const lerpColor = (a: string, b: string, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k);
export const skyAt = (t: number) => {
  const a = air(t);
  return {
    top: lerpColor("#020206", "#8FB2DA", a),
    mid: lerpColor("#05060C", "#E7D2B6", a),
    horizon: lerpColor("#0B0E1A", "#F4CDA0", a),
  };
};

export const World: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const a = air(t);
  const people = useMemo(() => simPeople(t), [t]);
  const cars = useMemo(() => simCars(t), [t]);
  const dropList = drops(t, 0.25 + 0.75 * a);
  const sky = skyAt(t);
  const g = gravity(t);
  const flagWave = a;
  const boatLift = Math.max(0, t - ZERO_AT - 2.5);

  return (
    <>
      <CameraRig t={t} />
      <fog attach="fog" args={[sky.horizon, 70 + (1 - a) * 400, 220 + (1 - a) * 800]} />
      <hemisphereLight args={[sky.top, "#8C7B66", 0.35 + 0.65 * a]} />
      <ambientLight intensity={0.08 + 0.12 * a} />
      <directionalLight
        position={[-30, 26, -24]}
        intensity={2.2 + (1 - a) * 0.8}
        color={lerpColor("#FFFFFF", "#FFD9A8", a)}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-bias={-0.0005}
      />
      <Set />

      {/* river */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[
          0,
          RIVER.level - (t > ZERO_AT + 1 ? Math.min(0.4, (t - ZERO_AT - 1) * 0.05) : 0),
          (RIVER.z0 + RIVER.z1) / 2,
        ]}
      >
        <planeGeometry args={[160, RIVER.z1 - RIVER.z0 + 1]} />
        <meshStandardMaterial color="#3E80C4" roughness={0.25} metalness={0.15} flatShading />
      </mesh>
      {blobs(t).map((b, i) => (
        <mesh
          key={i}
          position={[b.x, b.y, b.z]}
          scale={[b.size * (1 + b.wob), b.size * (1 - b.wob), b.size * (1 + b.wob * 0.5)]}
          castShadow
        >
          <icosahedronGeometry args={[1, 2]} />
          <meshStandardMaterial color="#4A8FD4" roughness={0.15} metalness={0.1} transparent opacity={0.85} />
        </mesh>
      ))}
      {/* boat */}
      <group
        position={[8 - t * 0.35, RIVER.level + 0.2 + boatLift * boatLift * 0.04, -19]}
        rotation={[boatLift * 0.03, 0, boatLift * 0.02]}
      >
        <mesh position={[0, 0.4, 0]} castShadow material={M("#F4F4F4")}>
          <boxGeometry args={[5.5, 0.8, 2]} />
        </mesh>
        <mesh position={[0.8, 1.2, 0]} castShadow material={M("#C0392B")}>
          <boxGeometry args={[2, 0.8, 1.6]} />
        </mesh>
      </group>

      {/* fountain water */}
      <mesh
        position={[FOUNTAIN.x, FOUNTAIN.water, FOUNTAIN.z]}
        material={M("#5FA3DD", { roughness: 0.2, flatShading: false })}
      >
        <cylinderGeometry args={[FOUNTAIN.rim, FOUNTAIN.rim, 0.12, 28]} />
      </mesh>
      {dropList.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, d.z]} scale={d.s}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={t > AIR_START + 1 ? "#F2F6FA" : "#CFE6FA"}
            transparent
            opacity={0.9 * d.o}
            roughness={0.2}
          />
        </mesh>
      ))}

      {/* flag */}
      <group position={[-1, 0, -9]}>
        <mesh position={[0, 3.5, 0]} castShadow material={M("#D0D0D0")}>
          <cylinderGeometry args={[0.06, 0.08, 7, 6]} />
        </mesh>
        {Array.from({ length: 6 }).map((_, k) => (
          <mesh
            key={k}
            position={[
              0.3 + k * 0.4,
              6.2 - (1 - flagWave) * k * 0.3,
              Math.sin(t * 6 - k * 0.9) * 0.12 * k * flagWave,
            ]}
            rotation={[0, Math.cos(t * 6 - k * 0.9) * 0.4 * flagWave, -(1 - flagWave) * 0.6]}
            castShadow
            material={M("#D63A2F")}
          >
            <boxGeometry args={[0.42, 1.4, 0.03]} />
          </mesh>
        ))}
      </group>

      {/* gravity sign */}
      <group position={[15, 0, -3]}>
        <mesh position={[0, 1.6, 0]} material={M("#222")}>
          <cylinderGeometry args={[0.08, 0.08, 3.2, 6]} />
        </mesh>
        <mesh position={[0, 3.4, 0.06]}>
          <planeGeometry args={[2.6, 1.3]} />
          <meshBasicMaterial map={sign(`${Math.round(g * 100)}% g`)} toneMapped={false} />
        </mesh>
      </group>

      {/* balloons */}
      {BALLOONS.map((c, i) => {
        if (t >= balloonPop(i)) return null;
        const sw = balloonSwell(t, i);
        const a2 = (i / BALLOONS.length) * Math.PI * 2;
        const bx = 3 + Math.cos(a2) * 0.7 + Math.sin(t * 0.8 + i) * 0.15 * Math.sqrt(Math.max(0.05, g));
        const by = 4 + (i % 3) * 0.45 + Math.sin(t * 1.1 + i * 2) * 0.12;
        const bz = 13 + Math.sin(a2) * 0.7;
        return (
          <group key={i}>
            <mesh
              position={[bx, by, bz]}
              scale={[0.42 * sw, 0.5 * sw, 0.42 * sw]}
              castShadow
              material={M(c, { roughness: 0.4 })}
            >
              <icosahedronGeometry args={[1, 1]} />
            </mesh>
            <mesh position={[(bx + 3) / 2, (by + 1.2) / 2, (bz + 13) / 2]} material={M("#EEE")}>
              <cylinderGeometry args={[0.01, 0.01, by - 1.2, 3]} />
            </mesh>
          </group>
        );
      })}

      {leaves(t).map((l, i) => (
        <mesh
          key={i}
          position={[l.x, l.y, l.z]}
          rotation={[l.rot, l.rot * 0.7, 0]}
          material={M("#4E9E43", { side: THREE.DoubleSide })}
        >
          <planeGeometry args={[0.28, 0.18]} />
        </mesh>
      ))}

      {cars.map((c, i) => (
        <Car key={i} {...c} />
      ))}
      {people.map((s, i) => (
        <Person key={i} i={i} s={s} />
      ))}
    </>
  );
};
