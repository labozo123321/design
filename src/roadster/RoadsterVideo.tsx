import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, getInputProps, useCurrentFrame } from "remotion";
import { useThree } from "@react-three/fiber";
import { DURATION } from "./timeline";
import { carAt } from "./path";
import { Roadster } from "./Roadster";
import { M } from "./materials";
import { Cockpit, EYE } from "./Cockpit";
import { shotAt } from "./camera";
import { Barrier, FLOODS, FarSite, FloodTower, LineupPlatform, Pad, Ramp, Sky } from "./Venue";
import { SiteLights } from "./Lights";
import { LineupCar } from "./Teslas";
import { CO2, CO2_SHOTS, Haze, Sparks, ThrusterGas } from "./Effects";
import { Beams, Lasers } from "./Beams";
import { Crew, Crowd, FrontRow, OPERATOR_AT, Operator, Starter, cheerAt } from "./People";
import { LINEUP, LANES } from "./path";
import { WalkerArm } from "./Walker";
import { RoadsterPost } from "./Post";
import { Overlay } from "./Overlay";
import { CUE, CUE_W, segAt, wAt, smooth } from "./timeline";
import { PCUE } from "./path";
import { NightEnv } from "./Env";

/**
 * POV: you're driving the new Tesla Roadster at its demo. The night at the test site: the walk up to the car
 * under the lights, in, the canopy down, the coffee in the cupholder, the count; 0-60 in 0.81 s; up the
 * inverted ramp and off the top upside down, the half roll (the coffee floats out of its cup), the
 * thrusters easing it down into their own cloud; the same again from a phone in the crowd; then over the
 * lineup of Teslas with a barrel roll above the Semi (time stops; the camera steps outside); the slide to a
 * stop in front of the crowd... and the yoke turns by itself.
 */

export const ROADSTER_DURATION = DURATION;

type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const look = (pos: THREE.Vector3, at: THREE.Vector3, fov: number, roll = 0): Pose => {
  const m = new THREE.Matrix4().lookAt(pos, at, V3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), roll));
  return { pos: pos.clone(), quat: q, fov };
};

/** The follow spot: on the car, until the driver looks round at the man with the controller; then it swings
 * onto him (caught). */
const followAt = (w: number, st: { pos: THREE.Vector3 }) => {
  const k = smooth(PCUE.creep0 + 2.45, PCUE.creep0 + 2.75, w);
  const car = st.pos.clone().add(V3(0, 0.6, 0));
  return k > 0 ? car.lerp(OPERATOR_AT.clone().add(V3(0, 1.0, 0)), k) : car;
};

/** Once the car's stopped with its canopy up the spot eases off it (it would glare in the cockpit); it comes
 * back full on the man with the controller. */
/** Climbing in, right over the sill: the follow spot's highlight on the paint's flat facets would flash. */
const climbK = (w: number) => smooth(PCUE.walk1 - 0.4, PCUE.walk1, w) * (1 - smooth(PCUE.seated + 0.2, PCUE.seated + 0.8, w));
const followK = (w: number) =>
  (1 - 0.65 * smooth(PCUE.stop2, PCUE.stop2 + 1.2, w) * (1 - smooth(PCUE.creep0 + 2.45, PCUE.creep0 + 2.6, w))) * (1 - 0.9 * climbK(w));

const carM = (st: { pos: THREE.Vector3; quat: THREE.Quaternion }) => new THREE.Matrix4().compose(st.pos, st.quat, new THREE.Vector3(1, 1, 1));

const Rig: React.FC<{ c: Pose; near?: number }> = ({ c, near = 0.02 }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.position.copy(c.pos);
  camera.quaternion.copy(c.quat);
  camera.fov = c.fov;
  camera.near = near;
  camera.far = 3000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

/** Debug: the car parked at the origin, seen from round about. */
const CarTest: React.FC<{ frame: number; cam?: string; w?: number }> = ({ frame, cam, w }) => {
  const st = carAt(w ?? 0.5);
  const s = { ...st, pos: V3(0, 0, 0), quat: new THREE.Quaternion() };
  const a = (frame / 8) * Math.PI * 2;
  const r = 10.5;
  const pose =
    cam === "side"
      ? look(V3(-11, 1.3, 0), V3(0, 0.6, 0), 34)
      : cam === "front"
        ? look(V3(0, 1.0, -11), V3(0, 0.6, 0), 30)
        : cam === "top"
          ? look(V3(0.01, 12, 0), V3(0, 0, 0), 36)
          : cam === "rear"
            ? look(V3(4.5, 1.8, 9.5), V3(0, 0.6, 0), 32)
            : cam === "low"
              ? look(V3(-4.2, 0.55, -7.2), V3(0, 0.6, 0), 40)
              : look(V3(Math.sin(a) * r, 2.1, -Math.cos(a) * r), V3(0, 0.55, 0), 34);
  return (
    <>
      <Rig c={pose} />
      <color attach="background" args={["#05060a"]} />
      <NightEnv />
      <hemisphereLight args={["#8090B0", "#202020", 0.35]} />
      <directionalLight position={[-6, 9, -4]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} />
      <spotLight position={[5, 6, 6]} intensity={60} angle={0.6} penumbra={0.8} decay={1.5} color="#9FB8FF" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#2A2B2E" roughness={0.75} />
      </mesh>
      <Roadster st={s} />
    </>
  );
};

/** Debug: sitting in the car (parked at the origin), at world time w for everything else. */
const CockpitTest: React.FC<{ frame: number; cam?: string; w?: number }> = ({ frame, cam, w: w0 }) => {
  const w = (w0 ?? 8) + frame / 30;
  const st = carAt(w);
  const s = { ...st, pos: V3(0, 0, 0), quat: new THREE.Quaternion() };
  const head = EYE.clone().add(st.head);
  const yaw = THREE.MathUtils.degToRad(cam === "free" ? 0 : st.yaw);
  const pitch = THREE.MathUtils.degToRad(cam === "free" ? -6 : st.pitch);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  const pose = cam === "outside" ? look(V3(-2.6, 1.5, 1.8), V3(-0.2, 0.7, -0.3), 50) : { pos: head, quat: q, fov: 78 };
  return (
    <>
      <Rig c={pose} near={0.01} />
      <color attach="background" args={["#05060a"]} />
      <NightEnv />
      <hemisphereLight args={["#8090B0", "#202020", 0.35]} />
      <directionalLight position={[-6, 9, -4]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
      <spotLight position={[5, 6, -10]} intensity={80} angle={0.6} penumbra={0.8} decay={1.5} color="#9FB8FF" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#2A2B2E" roughness={0.75} />
      </mesh>
      {[-12, -6, 0, 6, 12].map((x) => (
        <mesh key={x} position={[x, 2, -30]}>
          <boxGeometry args={[1.5, 4, 1.5]} />
          <meshStandardMaterial color="#4060A0" emissive="#203050" />
        </mesh>
      ))}
      <Roadster st={s} parts={{ interior: <Cockpit st={st} w={w} /> }} />
    </>
  );
};

/** The whole night: the site, the car, the camera for this frame. */
const Scene: React.FC<{ frame: number; cam?: string; hide?: string[] }> = ({ frame, cam, hide = [] }) => {
  const shot = shotAt(frame);
  const prev = shotAt(Math.max(0, frame - 1));
  const w = shot.w;
  const st = carAt(w);
  const debug =
    cam === "high"
      ? look(V3(-40, 30, 30), V3(-5, 0, -45), 50)
      : cam === "ramp"
        ? look(V3(-22, 6, -40), V3(0, 8, -78), 50)
        : cam === "lineup"
          ? look(V3(-27, 2.2, -30), V3(-14, 2, -46), 50)
          : cam === "lineup2"
            ? look(V3(-30, 3.0, -46), V3(-14, 1.6, -45), 44)
            : cam === "lineup3"
              ? look(V3(-4, 1.8, -33), V3(-14, 1.4, -45), 50)
          : cam === "start"
            ? look(V3(-6, 2.2, 9), V3(0, 1, -10), 55)
            : null;
  const pose = debug ?? shot.pose;
  const seated = w >= PCUE.seated || shot.seg !== "pov1";
  // (and the clear coat a little softer while he's over it)
  M.paint().clearcoatRoughness = 0.1 + 0.22 * climbK(w);
  // in the bullet time the follow spot eases off: going round the car, the Semi's roof under it mirrors it
  const v = frame / 30;
  const frozen = smooth(CUE.bullet0, CUE.bullet0 + 0.3, v) * (1 - smooth(CUE.bullet1 - 0.3, CUE.bullet1, v));
  // a cut: no motion blur across it
  const cut = frame === 0 || segAt(frame - 1) !== segAt(frame) || Math.abs(wAt(frame - 1) - w) > 0.5;
  // the launch's punch
  const punch = (w >= CUE_W.launch1 - 0.02 ? Math.exp(-Math.max(0, w - CUE_W.launch1 - 0.5) / 0.35) * smooth(CUE_W.launch1 - 0.02, CUE_W.launch1 + 0.08, w) : 0) * (w < 30 ? 1 : 0);
  return (
    <>
      <Rig c={pose} near={shot.inCar && !debug ? 0.012 : 0.05} />
      <color attach="background" args={["#000000"]} />
      <NightEnv />
      <Sky />
      {hide.includes("lights") ? <hemisphereLight args={["#3A4870", "#101012", 1.1]} /> : <SiteLights car={st} follow={followAt(w, st)} followK={followK(w) * (1 - 0.7 * frozen)} cheer={cheerAt(w)} />}
      <Pad />
      <Ramp />
      <LineupPlatform />
      {LINEUP.map((v) => (
        <group key={v.name} position={[LANES.b, 0.18, v.z]} rotation={[0, Math.PI / 2, 0]}>
          <LineupCar name={v.name} />
        </group>
      ))}
      {FLOODS.map((f, i) => (
        <FloodTower key={i} at={f.at} aim={f.aim} />
      ))}
      <Barrier />
      <FarSite t={w} />
      {hide.includes("people") ? null : (
        <>
          <Crowd w={w} />
          {w < 16 && shot.seg === "pov1" ? <Starter w={w} /> : null}
          {w < 14 && shot.seg === "pov1" ? <Crew w={w} you={shot.pose.pos} /> : null}
          {w > 40 ? <FrontRow w={w} which="stop" /> : null}
          {w > 40 ? <Operator w={w} /> : null}
          {shot.seg === "replay" ? <FrontRow w={w} which="replay" /> : null}
        </>
      )}
      {hide.includes("fx") ? null : (
        <>
          <ThrusterGas w={w} />
          <CO2 w={w} shots={CO2_SHOTS(PCUE)} />
          <Sparks w={w} t0={PCUE.stop2 + 0.1} t1={PCUE.stop2 + 4.6} />
          <Haze t={w} />
          <Beams t={w} />
          <Lasers t={w} />
        </>
      )}
      <Roadster st={st} parts={{ interior: hide.includes("cockpit") ? null : <Cockpit st={st} w={w} driver={seated} />, canopy: !hide.includes("canopy"), exterior: !hide.includes("exterior") }} />
      {shot.walk && !debug && !hide.includes("walker") ? <WalkerArm eye={shot.walk.pos} bodyYaw={shot.walk.bodyYaw} bob={shot.walk.bob} w={w} /> : null}
      <RoadsterPost
        prev={debug || cut ? pose : prev.pose}
        blur={debug ? 0 : shot.seg === "bullet" ? 0.45 : 1}
        car={{ now: carM(st), prev: carM(cut ? st : carAt(prev.w)) }}
        look={{
          time: frame / 30,
          punch: punch,
          phone: shot.seg === "replay" ? 1 : 0,
          ca: 0.0006 + 0.004 * punch,
          fade: smooth(0, 0.4, frame / 30),
        }}
        bloom={0.6}
      />
    </>
  );
};

export const RoadsterVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const props = getInputProps() as { test?: string; cam?: string; w?: number; hide?: string[] };
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas width={1080} height={1920} shadows camera={{ fov: 40, near: 0.02, far: 3000, position: [0, 1.2, 6] }} gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}>
        {props.test === "cockpit" ? <CockpitTest frame={frame} cam={props.cam} w={props.w} /> : props.test === "car" ? <CarTest frame={frame} cam={props.cam} w={props.w} /> : <Scene frame={frame} cam={props.cam} hide={props.hide} />}
      </ThreeCanvas>
      {!props.test && !props.cam ? <Overlay frame={frame} seg={segAt(frame)} fps={30} /> : null}
    </AbsoluteFill>
  );
};
