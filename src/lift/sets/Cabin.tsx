import React from "react";
import * as THREE from "three";
import { flat, gloss, toon } from "../toon";
import { Fx } from "../Fx";
import { Earth } from "../Globe";
import { SkyDome, Stars, Label } from "./common";
import { RocketBody, Flames } from "./Rocket";
import { StripGeometry } from "../hose";

/**
 * Inside the climber, a week up: a cosy cabin with an armchair, a lamp and a big window on Earth's
 * curve. And the top: the station deck at the end of the ride, Earth huge below, the ribbon going down
 * to it, and the elevator's door with its light.
 */

const W = 3.4; // cabin width (x)
const H = 2.6;
const D = 3.2;
const WIN = { w: 2.2, h: 1.5, y: 1.45 };

/** Out of the window: space, Earth's curve below, maybe a rocket going by. rocket: 0..1 its pass. */
const Outside: React.FC<{ t: number; rocket?: number }> = ({ t, rocket }) => (
  <group>
    <SkyDome r={600} stops={[[0, "#0a1038"], [0.5, "#1b2568"], [1, "#0a1038"]]} />
    <Stars n={1200} r={500} size={2.8} />
    <ambientLight intensity={0.35} color="#9fb0ff" />
    <directionalLight position={[40, 30, 20]} intensity={2.0} color="#fff6ea" />
    <Earth r={55} pos={[4, -52, -62]} spin={t * 0.02 + 1.2} tilt={0.25} />
    {rocket !== undefined && rocket > 0 && rocket < 1 ? (
      <group position={[-26 + rocket * 52, 1 + rocket * 7, -16]} rotation={[0, 0, -Math.PI / 2 + 0.25]} scale={0.8}>
        <RocketBody t={t} />
        <Flames k={1} t={t} len={5} />
      </group>
    ) : null}
  </group>
);

export const Cabin: React.FC<{ t: number; rocket?: number; children?: React.ReactNode }> = ({ t, rocket, children }) => (
  <group>
    <Outside t={t} rocket={rocket} />
    <hemisphereLight args={["#fff2e2", "#6a5a52", 0.9]} />
    <pointLight position={[1.2, 2.2, 0.6]} intensity={4} distance={6} color="#ffd9a8" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.001} />
    {/* floor and ceiling */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={toon("#b8a58f")} receiveShadow>
      <planeGeometry args={[W, D]} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0.2]} material={toon("#c85a4a")} receiveShadow>
      <circleGeometry args={[1.0, 40]} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]} material={toon("#eef0f4")}>
      <planeGeometry args={[W, D]} />
    </mesh>
    {/* side walls and the back wall */}
    {[-1, 1].map((s) => (
      <mesh key={s} position={[(s * W) / 2, H / 2, 0]} rotation={[0, -s * (Math.PI / 2), 0]} material={toon("#f3f4f7")} receiveShadow>
        <planeGeometry args={[D, H]} />
      </mesh>
    ))}
    <mesh position={[0, H / 2, D / 2]} rotation={[0, Math.PI, 0]} material={toon("#f3f4f7")} receiveShadow>
      <planeGeometry args={[W, H]} />
    </mesh>
    {/* the window wall (-z), built round the opening */}
    <group position={[0, 0, -D / 2]}>
      <mesh position={[0, (WIN.y - WIN.h / 2) / 2, 0]} material={toon("#f3f4f7")}>
        <boxGeometry args={[W, WIN.y - WIN.h / 2, 0.1]} />
      </mesh>
      <mesh position={[0, (H + WIN.y + WIN.h / 2) / 2, 0]} material={toon("#f3f4f7")}>
        <boxGeometry args={[W, H - (WIN.y + WIN.h / 2), 0.1]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + WIN.w / 2) / 2, WIN.y, 0]} material={toon("#f3f4f7")}>
          <boxGeometry args={[(W - WIN.w) / 2, WIN.h, 0.1]} />
        </mesh>
      ))}
      {/* the frame */}
      {[
        [0, WIN.y + WIN.h / 2, WIN.w + 0.16, 0.08],
        [0, WIN.y - WIN.h / 2, WIN.w + 0.16, 0.08],
        [-WIN.w / 2, WIN.y, 0.08, WIN.h],
        [WIN.w / 2, WIN.y, 0.08, WIN.h],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.06]} material={toon("#c9cfdb")}>
          <boxGeometry args={[w, h, 0.14]} />
        </mesh>
      ))}
      <mesh position={[0, WIN.y - WIN.h / 2 - 0.08, 0.18]} material={toon("#d9dde6")}>
        <boxGeometry args={[WIN.w + 0.3, 0.06, 0.32]} />
      </mesh>
    </group>
    {/* the armchair */}
    <group position={[0.15, 0, -0.1]}>
      <mesh position={[0, 0.22, 0]} material={toon("#3d6fd6")} castShadow receiveShadow>
        <boxGeometry args={[0.95, 0.44, 0.8]} />
      </mesh>
      <mesh position={[0, 0.72, 0.36]} material={toon("#3d6fd6")} castShadow>
        <boxGeometry args={[0.95, 0.65, 0.18]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.52, 0.48, 0.02]} material={toon("#3561c0")} castShadow>
          <boxGeometry args={[0.16, 0.34, 0.8]} />
        </mesh>
      ))}
    </group>
    {/* a side table and a lamp */}
    <group position={[-1.0, 0, -0.4]}>
      <mesh position={[0, 0.3, 0]} material={toon("#a0683f")} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.6, 24]} />
      </mesh>
      <mesh position={[0, 0.75, 0]} material={toon("#e9e3d6")}>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
      </mesh>
      <mesh position={[0, 0.98, 0]} material={toon("#ffe2b0", { emissive: "#ffcf86", ei: 0.9 })}>
        <cylinderGeometry args={[0.1, 0.18, 0.2, 20, 1, true]} />
      </mesh>
    </group>
    {children}
  </group>
);

/** The station at the top. ding: 0..1 the light over the door. */
export const TopDeck: React.FC<{ t: number; ding?: number; children?: React.ReactNode }> = ({ t, ding = 0, children }) => {
  const strip = React.useMemo(() => new StripGeometry(40), []);
  strip.update(
    (s) => new THREE.Vector3(0, -0.2 - s * 120, -s * 20),
    () => new THREE.Vector3(1, 0, 0),
    (s) => 0.5 * (1 - 0.6 * s),
  );
  return (
    <group>
      <SkyDome r={700} stops={[[0, "#0a1038"], [0.5, "#1b2568"], [1, "#0a1038"]]} />
      <Stars n={1600} r={600} size={2.8} />
      <ambientLight intensity={0.5} color="#a9b6ff" />
      <directionalLight position={[30, 25, 25]} intensity={2.0} color="#fff6ea" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-bias={-0.0005} />
      <Earth r={120} pos={[0, -150, -60]} spin={t * 0.01 + 2.0} tilt={0.18} />
      {/* the ribbon down to Earth */}
      <mesh geometry={strip} material={toon("#2b2e38", { emissive: "#9fb4d8", ei: 0.35, side: THREE.DoubleSide })} />
      {/* the deck */}
      <mesh position={[0, -0.2, 0]} material={toon("#e9edf3")} castShadow receiveShadow>
        <cylinderGeometry args={[4.2, 3.6, 0.4, 48]} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={toon("#cfd6e2")} receiveShadow>
        <ringGeometry args={[2.6, 2.75, 64]} />
      </mesh>
      <Fx>
        <mesh position={[0, 0.5, 0]} material={flat("#9fe6ff", 1, { opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })}>
          <cylinderGeometry args={[4.15, 4.15, 1.0, 64, 1, true]} />
        </mesh>
      </Fx>
      <mesh position={[0, 1.0, 0]} rotation={[Math.PI / 2, 0, 0]} material={toon("#ffcc22")}>
        <torusGeometry args={[4.15, 0.05, 8, 96]} />
      </mesh>
      {/* the elevator's door: an arch at the back of the deck */}
      <group position={[0, 0, -2.6]}>
        <mesh position={[0, 1.4, 0]} material={toon("#f4f6f9")} castShadow receiveShadow>
          <boxGeometry args={[2.2, 2.8, 0.7]} />
        </mesh>
        <mesh position={[0, 1.05, 0.36]} material={gloss("#aab4c6", 0.3)}>
          <boxGeometry args={[1.3, 2.0, 0.04]} />
        </mesh>
        <mesh position={[0, 1.05, 0.385]} material={toon("#7d889c")}>
          <boxGeometry args={[0.02, 2.0, 0.01]} />
        </mesh>
        <mesh position={[0, 2.35, 0.37]} material={toon("#1e2230")}>
          <boxGeometry args={[0.7, 0.32, 0.03]} />
        </mesh>
        <Label text="▲" h={0.24} pos={[0, 2.35, 0.4]} o={{ size: 120, color: ding > 0.5 ? "#5cff8a" : "#ffd23f" }} glow={1 + 0.5 * ding} />
        {ding > 0 ? <pointLight position={[0, 2.4, 0.9]} intensity={0.8 * ding} distance={2.5} color="#7dffa8" /> : null}
      </group>
      {children}
    </group>
  );
};
