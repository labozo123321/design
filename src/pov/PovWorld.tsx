import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { interpolate, useCurrentFrame } from "remotion";
import {
  BALLOONS,
  FOUNTAIN,
  PEOPLE,
  RIVER,
  balloonPop,
  blobs,
  drops,
  leaves,
  simCars,
  simPeople,
} from "../whatif/sim";
import { Car, M, Person, Set } from "../whatif/World";
import { Arms, Legs } from "./Body";
import { Debris, LandingDust, Motes, Streaks } from "./Fx3d";
import { City, Planet } from "./Ground";
import { Clouds, SUN_DIR, SkyDome, Stars, Sun, horizonDip, skyColor, spaceness } from "./Sky";
import { PHYSICS, T, UPDRAFT_AT, camAt } from "./timeline";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Rig: React.FC<{ frame: number }> = ({ frame }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const c = camAt(frame);
  camera.position.set(c.x, c.y, c.z);
  camera.rotation.order = "YXZ";
  camera.rotation.set(c.pitch, c.yaw, c.roll);
  camera.fov = c.fov;
  camera.near = 0.04;
  camera.far = 2e7;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

export const PovWorld: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const c = camAt(frame);
  const cam = new THREE.Vector3(c.x, c.y, c.z);
  const alt = c.y;
  const s = spaceness(alt);
  const people = useMemo(() => simPeople(t, PHYSICS), [t]);
  const cars = useMemo(() => simCars(t, PHYSICS), [t]);
  const lift = (tt: number) => Math.max(0, tt - UPDRAFT_AT);
  const dip = horizonDip(alt);
  const horizon = skyColor(
    new THREE.Vector3(
      -Math.sin(c.yaw) * Math.cos(dip),
      Math.sin(-dip + 0.012),
      -Math.cos(c.yaw) * Math.cos(dip),
    ),
    alt,
  );
  const sunlit = new THREE.Color("#FFF4E6").lerp(new THREE.Color("#FFD9B0"), 0.35 * (1 - s));
  // fog: thick city haze on the ground, thin and far in the upper atmosphere
  const fogFar = Math.exp(
    interpolate(
      Math.log(Math.max(2, alt)),
      [Math.log(2), Math.log(400), Math.log(3000), Math.log(30000), Math.log(125000)],
      [Math.log(2600), Math.log(9000), Math.log(90000), Math.log(2.5e6), Math.log(9e6)],
      CLAMP,
    ),
  );
  const shadowR = Math.min(1600, Math.max(60, alt * 2.2));
  const lightPos = cam.clone().addScaledVector(SUN_DIR, shadowR * 2.5);
  const yawAtUpdraft = T.yaw[UPDRAFT_AT * 30];
  const motes = interpolate(t, [0.5, 3, 30, 36], [0, 1, 1, 0], CLAMP);
  const vel = T.vel[frame] ?? 0;

  // people step aside so nobody ever walks through the lens
  const shifted = people.map((p) => {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    const dy = Math.abs(p.y + 0.9 - c.y);
    if (d > 2.2 || dy > 2) return p;
    const nd = Math.sqrt(d * d + 1.6 * 1.6);
    const k = d > 1e-3 ? nd / d : 1;
    return { ...p, x: c.x + dx * k + (d < 1e-3 ? 1.6 : 0), z: c.z + dz * k };
  });

  return (
    <>
      <Rig frame={frame} />
      <fog attach="fog" args={[horizon, 40, fogFar]} />
      <SkyDome cam={cam} alt={alt} />
      <Stars cam={cam} o={Math.max(0, (s - 0.35) / 0.65)} />
      <Sun cam={cam} alt={alt} />
      <hemisphereLight
        args={[
          skyColor(new THREE.Vector3(0, 1, 0), alt).lerp(new THREE.Color("#CFE0F5"), 0.4),
          "#9A8A70",
          0.85 * (1 - s) + 0.08,
        ]}
      />
      <ambientLight intensity={0.14 * (1 - s) + 0.05} />
      <directionalLight
        position={lightPos}
        intensity={2.35 + s * 0.9}
        color={new THREE.Color("#FFFFFF").lerp(new THREE.Color("#FFD2A0"), 0.55 * (1 - s))}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-shadowR}
        shadow-camera-right={shadowR}
        shadow-camera-top={shadowR}
        shadow-camera-bottom={-shadowR}
        shadow-camera-near={1}
        shadow-camera-far={shadowR * 6}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      >
        <object3D attach="target" position={[c.x, Math.min(alt, 0), c.z]} />
      </directionalLight>

      <Planet />
      <City t={t} alt={alt} />
      <Set />

      {/* river, lifting into blobs after zero g */}
      {blobs(t, PHYSICS).map((b, i) => (
        <mesh
          key={i}
          position={[b.x, b.y + lift(t) * lift(t) * 0.9, b.z]}
          scale={[b.size * (1 + b.wob), b.size * (1 - b.wob), b.size * (1 + b.wob * 0.5)]}
          castShadow
        >
          <icosahedronGeometry args={[1, 3]} />
          <meshStandardMaterial
            color="#4A8FD4"
            roughness={0.08}
            metalness={0.15}
            transparent
            opacity={0.82}
          />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, RIVER.level + 0.01, (RIVER.z0 + RIVER.z1) / 2]}>
        <planeGeometry args={[160, RIVER.z1 - RIVER.z0 + 1]} />
        <meshStandardMaterial color="#3E80C4" roughness={0.2} metalness={0.15} />
      </mesh>

      {/* fountain */}
      <mesh
        position={[FOUNTAIN.x, FOUNTAIN.water, FOUNTAIN.z]}
        material={M("#5FA3DD", { roughness: 0.15, flatShading: false })}
      >
        <cylinderGeometry args={[FOUNTAIN.rim, FOUNTAIN.rim, 0.12, 40]} />
      </mesh>
      {alt < 600
        ? drops(t, 1, PHYSICS).map((d, i) => (
            <mesh key={i} position={[d.x, d.y + lift(t) * lift(t) * 0.5, d.z]} scale={d.s * 0.42}>
              <icosahedronGeometry args={[1, 1]} />
              <meshStandardMaterial color="#E4F2FE" transparent opacity={0.7 * d.o} roughness={0.05} />
            </mesh>
          ))
        : null}

      {/* balloon cart: the bunch slips free at zero g */}
      {BALLOONS.map((col, i) => {
        if (t >= balloonPop(i) + 40) return null;
        const a2 = (i / BALLOONS.length) * Math.PI * 2;
        const free = Math.max(0, t - 32.5 - i * 0.2);
        const bx = 3 + Math.cos(a2) * 0.7 + Math.sin(t * 0.8 + i) * 0.12;
        const by =
          4 +
          (i % 3) * 0.45 +
          Math.sin(t * 1.1 + i * 2) * 0.12 +
          free * free * 0.25 +
          lift(t) * lift(t) * 1.2;
        const bz = 13 + Math.sin(a2) * 0.7;
        return (
          <group key={i}>
            <mesh
              position={[bx, by, bz]}
              scale={[0.42, 0.52, 0.42]}
              castShadow
              material={M(col, { roughness: 0.35, flatShading: false })}
            >
              <sphereGeometry args={[1, 18, 14]} />
            </mesh>
            <mesh position={[bx, by - 1.1, bz]} material={M("#EEE")}>
              <cylinderGeometry args={[0.006, 0.006, 1.6, 3]} />
            </mesh>
          </group>
        );
      })}
      {leaves(t, PHYSICS).map((l, i) => (
        <mesh
          key={i}
          position={[l.x, l.y + lift(t) * lift(t) * 0.8, l.z]}
          rotation={[l.rot, l.rot * 0.7, 0]}
          material={M("#4E9E43", { side: THREE.DoubleSide })}
        >
          <planeGeometry args={[0.18, 0.12]} />
        </mesh>
      ))}
      {cars.map((cc, i) => (
        <Car key={i} {...cc} />
      ))}
      {shifted.map((p, i) => (i < PEOPLE.length ? <Person key={i} i={i} s={p} /> : null))}

      <Clouds cam={cam} sunlit={sunlit} />
      <Motes cam={cam} t={t} o={motes} />
      <LandingDust frame={frame} cam={cam} yaw={c.yaw} />
      <Streaks cam={cam} t={t} speed={vel} />
      <Debris cam={cam} t={t} yaw={yawAtUpdraft} />

      {/* your own body */}
      <group position={cam} rotation={new THREE.Euler(c.pitch, c.yaw, c.roll, "YXZ")}>
        <Arms frame={frame} />
      </group>
      <group position={cam} rotation={[0, c.yaw, 0]}>
        <Legs frame={frame} />
      </group>
    </>
  );
};
