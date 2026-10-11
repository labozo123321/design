import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { setArtFont } from "./art";
import { Backbox } from "./Backbox";
import { Pose, flapOpen, fxTime, plungerTip } from "./camera";
import { roomTexture, envMap } from "./env";
import { Inserts, Lighting } from "./Lights";
import { Monster } from "./Monster";
import { BumperLights, Bumpers, Ctx, EyedBall, Flippers, OtherBalls, Teeth } from "./Parts";
import { Plunger, Table } from "./Table";
import { showAt } from "./show";
import { EVENTS, M, T, clampF } from "./timeline";
import { DEBUG } from "./debug";

export { fxTime };

const tauOf = (kind: string) =>
  EVENTS.find((e) => e.kind === kind && !(e as { cold?: boolean }).cold)?.tau ?? 1e9;
const TAU_CHOMP = tauOf("chomp");
const TAU_BURP = tauOf("burp");

/** Layer for things the reflection camera must not see (you, from the inside). */
const HIDDEN = 1;

const Rig: React.FC<{ pose: Pose }> = ({ pose }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.position.copy(pose.pos);
  camera.quaternion.copy(pose.quat);
  camera.fov = pose.fov;
  camera.near = 0.003;
  camera.far = 30;
  camera.layers.enable(HIDDEN);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

/**
 * What the chrome reflects: the table itself, rendered into a cube from where the ball is, every frame
 * (so the steel shows the colours and lamps around it, not just the room).
 */
const LiveReflections: React.FC<{ at: THREE.Vector3 }> = ({ at }) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const cube = useMemo(() => {
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cam = new THREE.CubeCamera(0.004, 30, rt);
    cam.children.forEach((c) => c.layers.set(0));
    return { rt, cam };
  }, []);
  const room = useMemo(() => envMap(gl), [gl]);
  useFrame(() => {
    if (DEBUG.has("noenv")) {
      scene.environment = room;
      return;
    }
    cube.cam.position.copy(at);
    cube.cam.updateMatrixWorld();
    scene.environment = room;
    cube.cam.update(gl, scene);
    scene.environment = cube.rt.texture;
  }, -1);
  return null;
};

export const PinballWorld: React.FC<{ frame: number; pose: Pose; font: string }> = ({
  frame,
  pose,
  font,
}) => {
  setArtFont(font);
  const t = frame / 30;
  const te = fxTime(t);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useMemo(() => {
    scene.background = roomTexture();
    scene.environment = envMap(gl);
    scene.backgroundIntensity = 0.55;
    scene.environmentIntensity = 0.9;
  }, [scene, gl]);
  const ctx: Ctx = { frame, t, te, cam: pose.pos.clone(), cold: t < M.rewind[1] };
  const show = showAt(t, te, frame);
  // inside the monster's mouth from the chomp until you're spat back out past its lips (by pinball time, so
  // the rewind gets it right too)
  const tau = T.tau[clampF(frame)];
  const inside = tau >= TAU_CHOMP + 0.0026 && tau < TAU_BURP + 0.036;
  const you = useRef<THREE.Group>(null);
  useFrame(() => you.current?.traverse((o) => o.layers.set(HIDDEN)), -2);
  return (
    <>
      <Rig pose={pose} />
      <LiveReflections at={pose.ball} />
      <Lighting show={show} />
      <BumperLights ctx={ctx} lit={show.gi} />
      <Table flap={flapOpen(frame)} />
      <Plunger tip={plungerTip(frame)} />
      <Inserts show={show} />
      <Bumpers ctx={ctx} lit={show.gi} />
      <Flippers ctx={ctx} />
      <Teeth ctx={ctx} />
      <Monster ctx={ctx} inside={inside} />
      <OtherBalls ctx={ctx} />
      {pose.third ? (
        <group ref={you}>
          <EyedBall
            pos={pose.ball}
            cam={pose.pos}
            t={t}
            seed={3}
            brow={{ tilt: -0.38, lift: 0.25 }}
            jolt={Math.max(0, te - 0.525)}
          />
        </group>
      ) : null}
      <Backbox
        lines={show.dmd}
        frame={frame}
        extra={show.dmdExtra}
        glow={show.glass}
        font={font}
        beat={show.beat}
      />
    </>
  );
};
