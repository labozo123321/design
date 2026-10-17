import React, { useMemo } from "react";
import * as THREE from "three";
import { M, mat } from "./materials";
import { hash } from "./timeline";

/**
 * The show's light in the haze: moving heads along the barrier and round the ramp throwing beams up and
 * across (slow sweeps, the odd snap on a beat), two searchlights straight up into the night, and the
 * lasers: thin fans over the pad from a projector by the crowd. All additive, soft-edged, broken up by the
 * haze's noise.
 */

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const beamMat = (key: string) =>
  mat(
    `beam-${key}`,
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uK: { value: 1 }, uTime: { value: 0 }, uLen: { value: 40 } },
        vertexShader: /* glsl */ `
          varying float vAlong;
          varying vec3 vN;
          varying vec3 vView;
          varying vec3 vW;
          void main() {
            vAlong = uv.y;
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            vN = normalize(mat3(modelMatrix) * normal);
            vView = normalize(cameraPosition - w.xyz);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uK;
          uniform float uTime;
          varying float vAlong;
          varying vec3 vN;
          varying vec3 vView;
          varying vec3 vW;
          float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          float n3(vec3 p) {
            vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
          }
          void main() {
            // soft at the cone's silhouette, bright through its middle
            float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
            // from the lamp out: bright near it, thinning to nothing
            float along = (1.0 - vAlong);
            float fall = smoothstep(0.0, 0.03, along) * pow(1.0 - along, 1.4);
            // the haze's grain drifting through
            float hz = 0.55 + 0.45 * n3(vW * 0.35 + vec3(uTime * 0.25, uTime * 0.06, 0.0)) * (0.6 + 0.4 * n3(vW * 1.1 - uTime * 0.2));
            float a = edge * fall * hz * uK;
            gl_FragColor = vec4(uColor * a, 1.0);
          }`,
      }),
  );

/** One beam: a cone from its lamp, aimed by yaw and pitch. */
const Beam: React.FC<{ at: THREE.Vector3; yaw: number; pitch: number; len: number; spread: number; color: string; k: number; t: number; id: string }> = ({ at, yaw, pitch, len, spread, color, k, t, id }) => {
  const geo = useMemo(() => {
    // a cone along +y with uv.y from 1 at the lamp to 0 at the end
    const g = new THREE.CylinderGeometry(0.12, len * spread, len, 28, 6, true);
    g.translate(0, len / 2, 0);
    return g;
  }, [len, spread]);
  const m = beamMat(id);
  m.uniforms.uColor.value.set(color);
  m.uniforms.uK.value = k;
  m.uniforms.uTime.value = t;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  const dir = V3(0, 1, 0).applyQuaternion(q);
  const qq = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir);
  return (
    <group position={at} quaternion={qq}>
      <mesh geometry={geo} material={m} renderOrder={6} />
      {/* the lamp's lens */}
      <mesh material={M.light(`lens-${id}`, color, 6 * k)} position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.13, 20]} />
      </mesh>
    </group>
  );
};

/** A moving head fixture's body (a yoke and a head) under its beam. */
const Fixture: React.FC<{ at: THREE.Vector3 }> = ({ at }) => (
  <group position={at}>
    <mesh material={mat("fixture", () => new THREE.MeshStandardMaterial({ color: "#15161A", roughness: 0.4, metalness: 0.5 }))} position={[0, -0.25, 0]} scale={[0.45, 0.3, 0.45]}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  </group>
);

type Head = { at: THREE.Vector3; color: string; phase: number; kind: "sweep" | "search" | "fan" };
export const HEADS: Head[] = [
  ...[-6, -26, -46, -66, -86, -106].map((z, i) => ({ at: V3(-26.4, 0.55, z), color: i % 2 ? "#BFD4FF" : "#FFFFFF", phase: i * 1.7, kind: "sweep" as const })),
  ...[-1, 1].map((s, i) => ({ at: V3(s * 5.5, 0.55, -88), color: "#7FA8FF", phase: 3 + i * 2.1, kind: "fan" as const })),
  ...[-1, 1].map((s, i) => ({ at: V3(-14 + s * 6.5, 0.4, -58), color: "#FF3A2A", phase: 5 + i * 1.3, kind: "fan" as const })),
  { at: V3(28, 0.5, -60), color: "#FFFFFF", phase: 0, kind: "search" },
  { at: V3(-52, 0.5, -130), color: "#FFFFFF", phase: 2, kind: "search" },
];

export const Beams: React.FC<{ t: number; k?: number; beat?: number }> = ({ t, k = 1, beat = 0 }) => (
  <group>
    {HEADS.map((h, i) => {
      let yaw = 0;
      let pitch = 0;
      let len = 45;
      let spread = 0.05;
      let kk = 0.08;
      if (h.kind === "sweep") {
        // from the barrier out over the pad: sweeping up and across
        yaw = -Math.PI / 2 + 0.6 * Math.sin(t * 0.37 + h.phase) + 0.15 * beat * Math.sin(h.phase * 3);
        pitch = 0.75 + 0.3 * Math.sin(t * 0.29 + h.phase * 1.3);
        len = 60;
        spread = 0.045;
        kk = 0.075;
      } else if (h.kind === "fan") {
        yaw = (h.at.x > -14 && h.color === "#FF3A2A") || (h.at.x > 0 && h.color !== "#FF3A2A") ? -0.35 : 0.35;
        yaw += 0.25 * Math.sin(t * 0.5 + h.phase);
        pitch = 0.35 + 0.15 * Math.sin(t * 0.43 + h.phase);
        len = 40;
        spread = 0.06;
        kk = h.color === "#FF3A2A" ? 0.06 : 0.07;
      } else {
        yaw = 0.2 * Math.sin(t * 0.2 + h.phase);
        pitch = 0.08 + 0.06 * Math.sin(t * 0.17 + h.phase);
        len = 400;
        spread = 0.012;
        kk = 0.09;
      }
      return (
        <group key={i}>
          <Fixture at={h.at} />
          <Beam id={`b${i}`} at={h.at} yaw={yaw} pitch={pitch} len={len} spread={spread} color={h.color} k={kk * k * (1 + 0.8 * beat)} t={t} />
        </group>
      );
    })}
  </group>
);

/** Lasers: a projector by the crowd fanning thin lines over the pad, sweeping, flicking off and on. */
export const Lasers: React.FC<{ t: number; k?: number }> = ({ t, k = 1 }) => {
  const at = V3(0, 19.6, -88.5);
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.012, 0.03, 1, 6, 1, true);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  const n = 9;
  const lines = [];
  for (let i = 0; i < n; i++) {
    // from the top of the ramp's tower, out over everything toward the crowd
    const fan = (i / (n - 1) - 0.5) * 1.3;
    const yaw = Math.PI * 0.82 + fan + 0.3 * Math.sin(t * 0.6);
    const pitch = Math.PI / 2 - 0.06 - 0.05 * Math.sin(t * 0.9 + i * 0.4);
    const on = hash(Math.floor(t * 2.5) * 7.1 + i) > 0.25 ? 1 : 0;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, 0, 0)));
    const dir = V3(0, 1, 0).applyQuaternion(q);
    const qq = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir);
    lines.push(
      <mesh key={i} geometry={geo} position={at} quaternion={qq} scale={[1.6, 140, 1.6]} material={M.light(`laser${i}`, "#2EFFC8", 2.4 * k * on)} renderOrder={6} />,
    );
  }
  return <group>{lines}</group>;
};
