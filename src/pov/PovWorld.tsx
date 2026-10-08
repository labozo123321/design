import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { interpolate, useCurrentFrame } from "remotion";
import { BALLOONS, FOUNTAIN, balloonPop, blobs, drops, leaves } from "../whatif/sim";
import { Car, M } from "../whatif/World";
import { SPECS, crowdAt } from "./crowd";
import { Human, lookFor } from "./Human";
import { Arms, Legs } from "./Body";
import { Debris, LandingDust, Motes, Streaks } from "./Fx3d";
import { City, Planet } from "./Ground";
import { Clouds, SUN_DIR, SkyDome, Stars, Sun, horizonDip, skyColor, spaceness } from "./Sky";
import { PHYSICS, T, UPDRAFT_AT, camAt, gravity } from "./timeline";
import { Plaza } from "./Plaza";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const LOOKS = SPECS.map(lookFor);

/** Cars parked along the plaza road (clear of the speed bumps); at zero g they drift up off the tarmac. */
const PARKED = [
  { z: 28, color: "#C0392B" },
  { z: 13.5, color: "#2C3E50" },
  { z: 6.5, color: "#ECF0F1" },
  { z: -4, color: "#D4AC0D" },
];

/** The viewer's column once floating (x, z drift), so rising river blobs never pass through the lens. */
const camColumnDist = (x: number, z: number) => {
  const ax = T.x[T.floatAt];
  const az = T.z[T.floatAt];
  const bx = T.x[T.frames - 1];
  const bz = T.z[T.frames - 1];
  const dx = bx - ax;
  const dz = bz - az;
  const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (ax + dx * u), z - (az + dz * u));
};

/**
 * The sun, created imperatively so every shadow parameter (map size, frustum, far plane, bias) is applied
 * on every frame. three.js only recomputes a shadow camera's projection when the map is first created,
 * so prop changes alone would leave a render process stuck with whatever it saw first.
 */
const SunLight: React.FC<{
  position: THREE.Vector3;
  target: THREE.Vector3;
  intensity: number;
  color: THREE.Color;
  size: number;
  r: number;
  far: number;
  bias: number;
  normalBias: number;
}> = ({ position, target, intensity, color, size, r, far, bias, normalBias }) => {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight();
    l.castShadow = true;
    return l;
  }, []);
  light.position.copy(position);
  light.target.position.copy(target);
  light.target.updateMatrixWorld();
  light.intensity = intensity;
  light.color.copy(color);
  const sh = light.shadow;
  if (sh.mapSize.x !== size) {
    sh.mapSize.set(size, size);
    if (sh.map) {
      sh.map.dispose();
      sh.map = null;
    }
  }
  const cam = sh.camera as THREE.OrthographicCamera;
  cam.left = -r;
  cam.right = r;
  cam.top = r;
  cam.bottom = -r;
  cam.near = 1;
  cam.far = far;
  cam.updateProjectionMatrix();
  sh.bias = bias;
  sh.normalBias = normalBias;
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
};

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
  const people = useMemo(() => crowdAt(frame), [frame]);
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
  // golden hour: clouds lit pink-gold, a strong orange key, cool blue sky fill in the shadows
  const sunlit = new THREE.Color("#FFF4E6").lerp(new THREE.Color("#FFC39A"), 0.7 * (1 - s));
  // fog: thick city haze on the ground, thin and far in the upper atmosphere
  const fogFar = Math.exp(
    interpolate(
      Math.log(Math.max(2, alt)),
      [Math.log(2), Math.log(400), Math.log(3000), Math.log(30000), Math.log(125000)],
      [Math.log(2600), Math.log(9000), Math.log(90000), Math.log(2.5e6), Math.log(9e6)],
      CLAMP,
    ),
  );
  // shadows never follow the camera (no crawling edges): a fine map over the plaza while we are on or
  // near the ground, then a city-wide map, switched at 39 s while the view is turned up to the sky
  const plazaShadow = t < 39;
  const shadowR = plazaShadow ? 46 : 1650;
  const shadowTarget = plazaShadow ? new THREE.Vector3(-2, 0, 6) : new THREE.Vector3(0, 0, 0);
  const lightPos = shadowTarget.clone().addScaledVector(SUN_DIR, plazaShadow ? 90 : 4200);
  const yawAtUpdraft = T.yaw[UPDRAFT_AT * 30];
  const motes = interpolate(t, [0.5, 3, 30, 36], [0, 1, 1, 0], CLAMP);
  const vel = T.vel[frame] ?? 0;

  return (
    <>
      <Rig frame={frame} />
      <fog attach="fog" args={[horizon, 40, fogFar]} />
      <SkyDome cam={cam} alt={alt} />
      <Stars cam={cam} o={Math.max(0, (s - 0.35) / 0.65)} />
      <Sun cam={cam} alt={alt} />
      <hemisphereLight
        args={[
          skyColor(new THREE.Vector3(0, 1, 0), alt).lerp(new THREE.Color("#9DB6EA"), 0.35),
          "#8A6A50",
          0.92 * (1 - s) + 0.08,
        ]}
      />
      <ambientLight intensity={0.1 * (1 - s) + 0.05} />
      <SunLight
        position={lightPos}
        target={shadowTarget}
        intensity={2.9 + s * 0.4}
        color={new THREE.Color("#FFFFFF").lerp(new THREE.Color("#FFB26E"), 0.8 * (1 - s))}
        size={plazaShadow ? 2048 : 4096}
        r={shadowR}
        far={plazaShadow ? 220 : 9000}
        bias={plazaShadow ? -0.0003 : -0.0008}
        normalBias={plazaShadow ? 0.03 : 0.6}
      />

      <Planet />
      <City t={t} alt={alt} />
      <Plaza t={t} g={gravity(t)} />

      {/* river, lifting into blobs after zero g */}
      {blobs(t, PHYSICS)
        .filter((b) => camColumnDist(b.x, b.z) > b.size * 1.35 + 2.4)
        .map((b, i) => (
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
            {/* tied to the umbrella tip; once a balloon slips free its string swings down to hang below it */}
            {(() => {
              const top = new THREE.Vector3(bx, by - 0.5, bz);
              const tie = new THREE.Vector3(3, 3.07, 13);
              const hang = new THREE.Vector3(bx, by - 2.0, bz);
              const k = Math.min(1, free / 0.5);
              const end = tie.lerp(hang, k * k * (3 - 2 * k));
              const d = top.clone().sub(end);
              const len = d.length();
              const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
              return (
                <mesh
                  position={end.add(top).multiplyScalar(0.5)}
                  quaternion={q}
                  scale={[1, len, 1]}
                  material={M("#EEE")}
                >
                  <cylinderGeometry args={[0.006, 0.006, 1, 3]} />
                </mesh>
              );
            })()}
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
      {PARKED.map((pc, i) => {
        const drift = Math.max(0, t - 32.4 - i * 0.35);
        const y = 0.03 * drift * drift * (1 + i * 0.25) + lift(t) * lift(t) * (0.55 + i * 0.08);
        return <Car key={i} z={pc.z} y={y} pitch={drift * 0.035 * (i % 2 ? 1 : -1)} color={pc.color} />;
      })}
      {alt < 320
        ? people.map((p, i) => (
            <Human
              key={i}
              sp={SPECS[i]}
              look={LOOKS[i]}
              st={p}
              t={t}
              cam={cam}
              detail={Math.hypot(p.x - c.x, p.y + 1.6 - c.y, p.z - c.z) < 28}
            />
          ))
        : null}

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
