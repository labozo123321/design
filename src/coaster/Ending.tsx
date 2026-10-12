import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { continueRender, delayRender, staticFile } from "remotion";
import { SkyDome, SkyEnv } from "./Sky";
import { Terrain } from "./Terrain";
import { Track3D } from "./Track3D";
import { Station } from "./Station";
import { Rides } from "./Rides";
import { Scenery } from "./Scenery";
import { Person3D } from "./Person3D";
import { SISTER } from "./cast";
import { NEUTRAL } from "./face/sculpt";
import { HER_SEAT, SEATS, YOUR_SEAT, frameAt, sAt } from "./track";
import { FPS, PHOTO_FRAME, SUN, photoUV, smooth, type Cam } from "./world";
import ENDING from "./ending.json";

/**
 * The end: you're off the ride, at the photo booth by the exit. The photo comes up on the screen (ding):
 * everyone screaming, you loudest of all, and your sister in the middle of it with her arms up, gum all
 * over her face, bored. The camera pushes in on the two of you, then you look down at her: she's grinning
 * up at you. "again?"
 */

export const BOOTH = { x: -26, z: 9.3, screenY: 1.78, w: 1.92, h: 1.08 };
const EYE = new THREE.Vector3(-26, 1.68, 11.65);
const HER = new THREE.Vector3(-25.32, 0, 11.82);
const RE = ENDING.rideEnd;

/** Where on the screen (world) the photo shows a point of the train at the photo moment. */
const onScreen = (p: THREE.Vector3) => {
  const uv = photoUV(p);
  return new THREE.Vector3(BOOTH.x + (uv.u - 0.5) * BOOTH.w, BOOTH.screenY + (0.5 - uv.v) * BOOTH.h, BOOTH.z + 0.06);
};

/** The two faces in the photo: yours and hers, and the point between them. */
const faces = (() => {
  const f = frameAt(sAt(PHOTO_FRAME));
  const you = f.P.clone().addScaledVector(f.R, SEATS[YOUR_SEAT]).addScaledVector(f.U, 0.39);
  const her = f.P.clone().addScaledVector(f.R, SEATS[HER_SEAT]).addScaledVector(f.U, 0.22);
  return { you: onScreen(you), her: onScreen(her), mid: onScreen(you.clone().lerp(her, 0.5)) };
})();

export const endingCam = (frame: number): Cam => {
  const e = frame / FPS - RE;
  const wob = (k: number) => Math.sin(e * 0.9 + k) * 0.004 + Math.sin(e * 2.3 + k * 2) * 0.002;
  const pos = EYE.clone().add(new THREE.Vector3(wob(1), wob(2) + 0.006 * Math.sin(e * 1.4), -0.25 * smooth(0, 2.4, e) + wob(3)));
  // look: the screen's middle, then the faces in the photo, then down at her
  const screen = new THREE.Vector3(BOOTH.x, BOOTH.screenY, BOOTH.z);
  const z = smooth(ENDING.zoom[0], ENDING.zoom[1], e);
  const turn = smooth(ENDING.turn[0], ENDING.turn[1], e);
  const herFace = HER.clone().add(new THREE.Vector3(0, 1.22, 0));
  const target = screen.clone().lerp(faces.mid, z);
  const look = target.clone().sub(pos).normalize();
  const lookHer = herFace.clone().sub(pos).normalize();
  const dir = look.clone().lerp(lookHer, turn).normalize();
  const m = new THREE.Matrix4().lookAt(pos, pos.clone().add(dir), new THREE.Vector3(0, 1, 0));
  const quat = new THREE.Quaternion().setFromRotationMatrix(m);
  // a little roll as you swing down to her
  quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.08 * Math.sin(Math.PI * turn)));
  const fov = THREE.MathUtils.lerp(THREE.MathUtils.lerp(64, 15, z), 60, turn);
  return { pos, quat, fov, f: frameAt(0) };
};

const Rig: React.FC<{ c: Cam }> = ({ c }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.position.copy(c.pos);
  camera.quaternion.copy(c.quat);
  camera.fov = c.fov;
  camera.near = 0.03;
  camera.far = 30000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

const Sun: React.FC = () => {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight("#FFD2A1", 2.6);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = -22;
    cam.right = 22;
    cam.top = 22;
    cam.bottom = -22;
    cam.near = 50;
    cam.far = 600;
    cam.updateProjectionMatrix();
    l.shadow.bias = -0.0003;
    l.shadow.normalBias = 0.03;
    l.position.copy(EYE).addScaledVector(SUN, 300);
    l.target.position.copy(EYE);
    l.target.updateMatrixWorld();
    return l;
  }, []);
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
};

let photoTex: THREE.Texture | null = null;
let photoLoaded = false;
let photoReady: Promise<void> | null = null;
/** Starts loading the ride photo (call early, so it's there by the time the ending comes round). */
export const preloadPhoto = () => {
  if (!photoTex) {
    photoReady = new Promise((res) => {
      photoTex = new THREE.TextureLoader().load(
        staticFile("coaster/photo.jpg"),
        () => {
          photoLoaded = true;
          res();
        },
        undefined,
        () => res(),
      );
      photoTex.colorSpace = THREE.SRGBColorSpace;
      photoTex.anisotropy = 8;
    });
  }
  return photoReady!;
};
/**
 * The ride photo as a texture. While rendering, the canvas only draws when the frame changes, so if the
 * photo arrives after this frame was drawn, upload it and draw the frame again before letting it go.
 */
const usePhoto = () => {
  const { advance, gl } = useThree();
  const [handle] = useState(() => (photoLoaded ? null : delayRender("ride photo")));
  preloadPhoto();
  useEffect(() => {
    if (handle === null) return;
    preloadPhoto().then(() => {
      gl.initTexture(photoTex!);
      advance(performance.now());
      continueRender(handle);
    });
  }, [handle, advance, gl]);
  return photoTex!;
};

/** The booth: a wall of screens under a canopy, the big one with your photo. */
const Booth: React.FC<{ e: number }> = ({ e }) => {
  const tex = usePhoto();
  const on = smooth(ENDING.ding - 0.08, ENDING.ding, e);
  const flash = Math.exp(-Math.max(0, e - ENDING.ding) * 6) * on;
  const g = useMemo(() => {
    const dark = new THREE.MeshStandardMaterial({ color: "#1E2026", roughness: 0.6, metalness: 0.2 });
    const orange = new THREE.MeshStandardMaterial({ color: "#FF6A2B", roughness: 0.5 });
    const steel = new THREE.MeshStandardMaterial({ color: "#2C2F35", roughness: 0.45, metalness: 0.6 });
    return { dark, orange, steel };
  }, []);
  const screenMat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  screenMat.color.setScalar(on * (1.05 + 0.6 * flash));
  const sideMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#7FA6D8", toneMapped: false }), []);
  return (
    <group>
      {/* the wall and its frame */}
      <mesh position={[BOOTH.x, 1.5, BOOTH.z - 0.12]} material={g.dark} castShadow receiveShadow>
        <boxGeometry args={[6.2, 3.0, 0.2]} />
      </mesh>
      <mesh position={[BOOTH.x, 3.15, BOOTH.z + 0.02]} material={g.orange}>
        <boxGeometry args={[6.2, 0.36, 0.06]} />
      </mesh>
      {/* the big screen and its bezel */}
      <mesh position={[BOOTH.x, BOOTH.screenY, BOOTH.z - 0.005]} material={g.steel}>
        <boxGeometry args={[BOOTH.w + 0.08, BOOTH.h + 0.08, 0.06]} />
      </mesh>
      <mesh position={[BOOTH.x, BOOTH.screenY, BOOTH.z + 0.03]} material={screenMat}>
        <planeGeometry args={[BOOTH.w, BOOTH.h]} />
      </mesh>
      {/* two small screens either side, showing the next trains' photos (out of focus) */}
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <mesh position={[BOOTH.x + sd * 2.05, BOOTH.screenY + 0.1, BOOTH.z - 0.005]} material={g.steel}>
            <boxGeometry args={[1.0, 0.62, 0.05]} />
          </mesh>
          <mesh position={[BOOTH.x + sd * 2.05, BOOTH.screenY + 0.1, BOOTH.z + 0.025]} material={sideMat}>
            <planeGeometry args={[0.94, 0.56]} />
          </mesh>
        </group>
      ))}
      {/* the counter and the canopy on two posts */}
      <mesh position={[BOOTH.x, 0.5, BOOTH.z + 0.55]} material={g.dark} castShadow receiveShadow>
        <boxGeometry args={[4.4, 1.0, 0.7]} />
      </mesh>
      <mesh position={[BOOTH.x, 1.02, BOOTH.z + 0.55]} material={g.orange}>
        <boxGeometry args={[4.42, 0.04, 0.72]} />
      </mesh>
      <mesh position={[BOOTH.x, 3.05, BOOTH.z + 1.6]} material={g.steel} castShadow>
        <boxGeometry args={[6.6, 0.14, 3.4]} />
      </mesh>

      <pointLight position={[BOOTH.x, 2.7, BOOTH.z + 1.4]} intensity={2.2} distance={7} decay={1.5} color="#FFE1BE" />
      {/* the screen's glow on the counter and on you */}
      <pointLight position={[BOOTH.x, BOOTH.screenY, BOOTH.z + 0.6]} intensity={0.9 * on + 3 * flash} distance={5} decay={1.6} color="#DDE8FF" />
    </group>
  );
};

/** Her pigtails hanging (she's standing still): out from the ties, then down. */
const hangingPigtails = () => {
  const sh = SISTER.shape;
  return [-1, 1].map((sd) => {
    const pts: THREE.Vector3[] = [];
    const root = new THREE.Vector3(sd * sh.w * 0.98, sh.eyeY + 0.052, -0.03);
    let p = root.clone();
    pts.push(p.clone());
    for (let i = 1; i < 9; i++) {
      const out = Math.max(0, 1 - i * 0.35);
      p = p.clone().add(new THREE.Vector3(sd * 0.016 * out + sd * 0.002, -0.022 * (1 - out * 0.6), -0.006 * out));
      pts.push(p);
    }
    return pts;
  });
};

export const EndingWorld: React.FC<{ frame: number }> = ({ frame }) => {
  const u = frame / FPS;
  const e = u - RE;
  const c = endingCam(frame);
  const tails = useMemo(() => hangingPigtails(), []);
  // she watches the screen, then turns up to you, grinning; at "again?" she bounces with a thumbs up
  const toYou = smooth(ENDING.turn[0] - 0.3, ENDING.turn[1] - 0.2, e);
  const look = c.pos.clone().lerp(new THREE.Vector3(BOOTH.x + 0.3, BOOTH.screenY, BOOTH.z), 1 - toYou);
  const hop = Math.max(0, Math.sin((e - ENDING.again) * Math.PI * 2 * 1.6)) * 0.06 * smooth(ENDING.again, ENDING.again + 0.1, e);
  const theta = THREE.MathUtils.lerp(Math.PI * 0.05, Math.PI * 0.42, toYou);
  const herPos = HER.clone().add(new THREE.Vector3(0, hop, 0));
  const local = look.clone().sub(herPos).applyAxisAngle(new THREE.Vector3(0, 1, 0), -theta);
  const grin = smooth(ENDING.turn[1] - 0.4, ENDING.turn[1] + 0.2, e);
  return (
    <>
      <Rig c={c} />
      <SkyEnv />
      <SkyDome cam={c.pos} />
      <hemisphereLight args={["#AFC4E8", "#6B5F45", 0.55]} />
      <Sun />
      <Terrain time={u} />
      <Track3D chainShift={u * 6.8} />
      <Station frame={0} cam={new THREE.Vector3(0, -999, 0)} />
      <Rides t={u + 40} />
      <Scenery t={u} avoid={EYE} />
      <Booth e={e} />
      <group position={herPos} rotation={[0, theta, 0]}>
        <Person3D
          who={SISTER}
          clothes={{ top: "#FFD23F", sleeves: "short", bottom: "#3B6FB6", legs: "shorts", shoe: "#FF6FAE", sole: "#FFFFFF" }}
          k={0.78}
          headY={1.22}
          stance={e > ENDING.again - 0.2 ? "thumb" : "stand"}
          t={u}
          lookAt={local}
          e={{ ...NEUTRAL, smile: 0.35 + 0.65 * grin, jaw: 0.08 + 0.36 * grin, squint: 0.3 * grin, brow: 0.35 * grin }}
          chains={tails}
          gum={1}
        />
      </group>
    </>
  );
};
