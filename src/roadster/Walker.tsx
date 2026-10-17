import React from "react";
import * as THREE from "three";
import { Arm, Cup, WALK_CUP_HAND, type HandGoal } from "./Cockpit";
import { GRIP, RELAX, mixHand } from "../coaster/Hand";
import { PCUE } from "./path";
import { smooth } from "./timeline";

/**
 * Walking up to the car with a coffee: his right arm (the sleeve, the glove, the cup) in his own body's
 * frame (where he's walking, not where his head turns), swinging a little with the steps; over the sill it
 * comes round into the car's frame, ending where the seated arm takes over (the cup over his lap).
 */

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export const WalkerArm: React.FC<{ eye: THREE.Vector3; bodyYaw: number; bob: number; w: number }> = ({ eye, bodyYaw, bob, w }) => {
  // over the sill the body turns to face the car's forward (yaw 0)
  const k = smooth(PCUE.walk1, PCUE.seated, w);
  const yaw = bodyYaw * (1 - k);
  const rot = (v: THREE.Vector3) => v.clone().applyAxisAngle(V3(0, 1, 0), yaw);
  const ph = w * 1.85 * Math.PI * 2;
  const swing = V3(0.008 * Math.sin(ph / 2), 0.012 * Math.abs(Math.sin(ph / 2)), 0.01 * Math.sin(ph / 2)).multiplyScalar(bob);
  const sh = eye.clone().add(rot(V3(0.2, -0.23, 0.14)));
  const at = eye.clone().add(rot(WALK_CUP_HAND.clone().add(swing)));
  const goal: HandGoal = { at, fingers: rot(V3(-0.3, 0.1, -1)), palm: rot(V3(-1, 0.2, 0)), pose: mixHand(GRIP, RELAX, 0.2) };
  // the cup in the curled fingers (as the seated hand holds it)
  const fy = goal.fingers.clone().normalize().negate();
  let pz = goal.palm.clone().sub(fy.clone().multiplyScalar(goal.palm.dot(fy))).normalize();
  if (!Number.isFinite(pz.x)) pz = V3(0, 0, 1);
  const cupAt = at.clone().add(fy.clone().multiplyScalar(0.06)).add(pz.clone().multiplyScalar(0.045)).add(V3(0, -0.05, 0));
  // the coffee sloshes with the steps
  const slosh: [number, number] = [0.08 * Math.sin(ph / 2 + 0.6) * bob, 0.05 * Math.sin(ph + 0.4) * bob];
  return (
    <group>
      <Arm sh={sh} goal={goal} side={1} pole={rot(V3(0.6, -1, 0.4))} />
      <group position={cupAt} rotation={[0, yaw, 0]}>
        <Cup tilt={slosh} float={0} t={w} splash={0} />
      </group>
    </group>
  );
};
