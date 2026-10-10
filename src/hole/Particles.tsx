import React, { useMemo } from "react";
import * as THREE from "three";
import { rng } from "./mats";
import { HR, HX, HZ, depthAtWall, tempAt } from "./timeline";
import { heatJS } from "./rig";

/**
 * Specks in the shaft around you, fixed in the rock's frame so they stream past at the walls' speed and
 * give the space depth: dust in the crust (catching the lamps), embers in the mantle, sparks in the core.
 * They live within PERIOD/2 of your eyes along the shaft and wrap round far away, where they're tiny.
 * Each is stretched along the fall by the shutter, so at speed they draw as streaks.
 */

const N = 220;
const PERIOD = 70;

export const ShaftParticles: React.FC<{
  surf: number;
  wEye: number;
  side: number;
  blur: number;
  t: number;
}> = ({ surf, wEye, side, blur, t }) => {
  const { mesh, seeds, mat } = useMemo(() => {
    const R = rng(97531);
    const seeds = Array.from({ length: N }).map(() => ({
      th: R() * Math.PI * 2,
      r: 1.3 + Math.sqrt(R()) * 2.8,
      w: R() * PERIOD,
      s: 0.012 + R() * 0.025,
      k: 0.4 + R() * 0.6,
      drift: (R() - 0.5) * 2,
    }));
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1, 1, 1),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true,
    });
    const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), mat, N);
    m.frustumCulled = false;
    m.renderOrder = 3;
    return { mesh: m, seeds, mat };
  }, []);
  // colour and strength by what you're falling through
  const km = depthAtWall(side, Math.max(0, wEye));
  const T = tempAt(km);
  const hot = Math.min(1, Math.max(0, (T - 450) / 400));
  const glow = heatJS(T + 500);
  const dust = new THREE.Color(0.55, 0.5, 0.42);
  const col = dust
    .clone()
    .multiplyScalar(0.35 * (1 - hot))
    .add(glow.multiplyScalar(3.2 * hot));
  mat.color.copy(col);
  // thinner in the outer core's cavern, where the drifting iron drops already stream past
  const sm = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  const thin = 1 - 0.55 * sm(2700, 2950, km) + 0.35 * sm(5000, 5250, km);
  mat.opacity = Math.min(1, 0.25 + 0.75 * hot) * (wEye > 4 ? 1 : 0) * thin;
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  seeds.forEach((d, i) => {
    // nearest copy of this speck to your eyes along the shaft
    const w = wEye + ((((d.w - wEye) % PERIOD) + PERIOD * 1.5) % PERIOD) - PERIOD / 2;
    const th = d.th + t * 0.05 * d.drift;
    p.set(HX + Math.sin(th) * d.r, surf - w, HZ + Math.cos(th) * d.r);
    const size = d.s * (0.6 + 0.8 * hot);
    sc.set(size, size + blur * 1.6, size);
    mtx.compose(p, q, sc);
    mesh.setMatrixAt(i, mtx);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return <primitive object={mesh} />;
};

/**
 * Diamonds studding the kimberlite round 150 km down: little bright stones set in the wall, glinting as you
 * fall past (blur-stretched into streaks like the specks; the shader's own glints are too small to survive
 * its shutter samples at this speed).
 */
const ND = 460;
export const Diamonds: React.FC<{ surf: number; w0: number; w1: number; blur: number; t: number }> = ({
  surf,
  w0,
  w1,
  blur,
  t,
}) => {
  const { mesh, seeds, mat } = useMemo(() => {
    const R = rng(24680);
    const seeds = Array.from({ length: ND }).map(() => ({
      th: R() * Math.PI * 2,
      u: R(),
      s: 0.025 + R() * 0.045,
      ph: R() * Math.PI * 2,
      f: 5 + R() * 9,
    }));
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.3, 1.65, 2.15),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), mat, ND);
    m.frustumCulled = false;
    m.renderOrder = 3;
    return { mesh: m, seeds, mat };
  }, []);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  seeds.forEach((d, i) => {
    const w = w0 + (w1 - w0) * d.u;
    const r = HR - 0.03;
    p.set(HX + Math.sin(d.th) * r, surf - w, HZ + Math.cos(d.th) * r);
    // a glint comes and goes: each stone flashes when the light catches it
    const tw = Math.pow(0.5 + 0.5 * Math.sin(t * d.f + d.ph), 3);
    const size = d.s * (0.35 + 0.9 * tw);
    sc.set(size, size + blur * 1.6 * (0.4 + 0.6 * tw), size);
    mtx.compose(p, q, sc);
    mesh.setMatrixAt(i, mtx);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mat.opacity = 0.9;
  return <primitive object={mesh} />;
};
