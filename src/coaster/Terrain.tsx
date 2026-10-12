import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TR, frameAt, type Frame } from "./track";
import { NOISE } from "../tsunami/glsl";

/**
 * The ground the park stands on: lawns, paved paths and plazas (drawn into a mask), flower beds, the lake
 * (a dip in the ground under a water surface), and the cut the drop dives into: retaining walls, a portal,
 * the tunnel under the station's forecourt (with its strip lights), the exit portal and the cut the
 * Immelmann climbs out of.
 *
 * World metres: x east, z south. The detailed ground covers the park; a plain plain runs to the horizon.
 */

export const LAKE = TR.site.lake as { cx: number; cz: number; rx: number; rz: number; y: number };
const lakeR = (ang: number) => 1.0 + 0.07 * Math.sin(3 * ang + 0.6) + 0.05 * Math.sin(5 * ang + 2.1) + 0.03 * Math.sin(9 * ang + 0.4);
/** Signed: <1 inside the lake (1 at the shore). */
export const lakeD = (x: number, z: number) => {
  const dx = (x - LAKE.cx) / LAKE.rx;
  const dz = (z - LAKE.cz) / LAKE.rz;
  const ang = Math.atan2(dz, dx);
  return (Math.abs(dx) ** 2.4 + Math.abs(dz) ** 2.4) ** (1 / 2.4) / lakeR(ang);
};
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Ground height (m): flat, dipping under the lake. */
export const groundY = (x: number, z: number) => {
  const d = lakeD(x, z);
  if (d > 1.12) return 0;
  // a bank a few metres wide, then the lake bed
  return -1.9 * smooth(1.04, 0.86, d) - 0.25 * smooth(1.12, 1.0, d);
};

/* ------------------------------------------------------------------ */
/* The plan: paths, plazas, beds (a mask texture over the park)        */
/* ------------------------------------------------------------------ */

export const PLAN = { x0: -330, z0: -270, size: 560 };
const MASK = 2048;

type Stroke = { pts: [number, number][]; w: number };
/** The paths, as polylines with widths (m). */
export const PATHS: Stroke[] = [
  // the midway, east-west north of the coaster
  { pts: [[-320, -34], [-150, -30], [-60, -28], [40, -30], [140, -36], [230, -40]], w: 13 },
  // from the midway down past the station's east end to the lake front
  { pts: [[8, -30], [44, -16], [47, 22], [6, 24], [-24, 22]], w: 7 },
  // the lake front, round the north shore
  { pts: [[-24, 22], [-60, 18], [-110, 17], [-160, 20], [-200, 30], [-214, 52], [-200, 80]], w: 6 },
  // round the south of the lake
  { pts: [[-200, 80], [-150, 82], [-100, 80], [-50, 76], [-20, 62], [-10, 40], [-6, 20]], w: 6 },
  // south to the far rides and the car park
  { pts: [[-100, 80], [-96, 130], [-80, 200], [-60, 260]], w: 8 },
  // east: toward the big wheel and the drop tower
  { pts: [[60, -30], [96, -10], [120, 20], [130, 60], [110, 110]], w: 8 },
  // north: to the gate
  { pts: [[-20, -30], [-24, -90], [-10, -160], [20, -250]], w: 10 },
  // west: past the swoop to the water rides
  { pts: [[-150, -30], [-210, -10], [-250, 20], [-280, 60]], w: 7 },
  // a loop round the carousel and the swings
  { pts: [[-120, -30], [-130, -70], [-90, -100], [-50, -80], [-40, -32]], w: 6 },
  { pts: [[60, -30], [70, -80], [40, -120], [-10, -110]], w: 6 },
];
/** Plazas: [cx, cz, rx, rz] ellipses or rects ([x0, z0, x1, z1] when rect). */
export const PLAZAS: { kind: "rect" | "ell"; v: number[] }[] = [
  { kind: "rect", v: [-56, -30, 4, -9] }, // the station forecourt and queue
  { kind: "ell", v: [-130, -70, 22, 22] }, // carousel
  { kind: "ell", v: [-60, -95, 34, 30] }, // big wheel? (north)
  { kind: "ell", v: [40, -85, 24, 24] }, // drop tower
  { kind: "ell", v: [125, 45, 26, 26] }, // east rides
  { kind: "ell", v: [-20, -160, 30, 22] }, // gate plaza
  { kind: "rect", v: [-74, 22, -38, 30] }, // the splash viewing deck's approach
];
export const BEDS: { kind: "ell"; v: number[] }[] = [
  { kind: "ell", v: [-20, -42, 7, 4] },
  { kind: "ell", v: [30, -42, 9, 4] },
  { kind: "ell", v: [-90, -42, 8, 4] },
  { kind: "ell", v: [-130, -70, 6, 6] },
  { kind: "ell", v: [12, 2, 5, 4] },
  { kind: "ell", v: [-30, -160, 10, 6] },
  { kind: "ell", v: [100, -50, 7, 4] },
];

const toPx = (x: number, z: number): [number, number] => [((x - PLAN.x0) / PLAN.size) * MASK, ((z - PLAN.z0) / PLAN.size) * MASK];

let maskTex: THREE.CanvasTexture | null = null;
const planMask = () => {
  if (maskTex) return maskTex;
  const c = document.createElement("canvas");
  c.width = c.height = MASK;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, MASK, MASK);
  const k = MASK / PLAN.size;
  // red: paving
  g.strokeStyle = "#f00";
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const p of PATHS) {
    g.lineWidth = p.w * k;
    g.beginPath();
    p.pts.forEach(([x, z], i) => {
      const [px, pz] = toPx(x, z);
      if (i === 0) g.moveTo(px, pz);
      else g.lineTo(px, pz);
    });
    g.stroke();
  }
  g.fillStyle = "#f00";
  for (const pl of PLAZAS) {
    if (pl.kind === "rect") {
      const [a, b] = toPx(pl.v[0], pl.v[1]);
      const [c2, d] = toPx(pl.v[2], pl.v[3]);
      g.fillRect(a, b, c2 - a, d - b);
    } else {
      const [cx, cz] = toPx(pl.v[0], pl.v[1]);
      g.beginPath();
      g.ellipse(cx, cz, pl.v[2] * k, pl.v[3] * k, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // green: flower beds (on top of paving)
  g.globalCompositeOperation = "lighter";
  g.fillStyle = "#0f0";
  for (const b of BEDS) {
    const [cx, cz] = toPx(b.v[0], b.v[1]);
    g.beginPath();
    g.ellipse(cx, cz, b.v[2] * k, b.v[3] * k, 0, 0, Math.PI * 2);
    g.fill();
  }
  // blue: holes in the ground where the cut runs
  g.globalCompositeOperation = "source-over";
  const img = g.getImageData(0, 0, MASK, MASK);
  const P = TR.P as number[];
  const ns = P.length / 3;
  for (let i = 0; i < ns; i++) {
    const y = P[i * 3 + 1];
    // only the open cut is a hole in the ground; the covered tunnel runs under it
    if (y > 1.6 || y < -1.6 || i * TR.ds < 100 || i * TR.ds > 400) continue;
    const [px, pz] = toPx(P[i * 3], P[i * 3 + 2]);
    const r = Math.ceil(3.25 * k);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const xx = Math.round(px + dx);
        const yy = Math.round(pz + dy);
        if (xx < 0 || yy < 0 || xx >= MASK || yy >= MASK) continue;
        img.data[(yy * MASK + xx) * 4 + 2] = 255;
      }
  }
  g.putImageData(img, 0, 0);
  maskTex = new THREE.CanvasTexture(c);
  maskTex.anisotropy = 8;
  maskTex.generateMipmaps = true;
  maskTex.minFilter = THREE.LinearMipmapLinearFilter;
  return maskTex;
};

/* ------------------------------------------------------------------ */
/* Ground                                                               */
/* ------------------------------------------------------------------ */

const GROUND_FRAG = /* glsl */ `
${NOISE}
uniform sampler2D uPlan;
uniform vec4 uPlanRect;
varying vec3 vWorld;
`;

const groundMaterial = () => {
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95 });
  const plan = planMask();
  m.onBeforeCompile = (s) => {
    s.uniforms.uPlan = { value: plan };
    s.uniforms.uPlanRect = { value: new THREE.Vector4(PLAN.x0, PLAN.z0, PLAN.size, PLAN.size) };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\n${GROUND_FRAG}`)
      .replace(
        "#include <map_fragment>",
        `
  vec2 puv = (vWorld.xz - uPlanRect.xy) / uPlanRect.zw;
  vec3 pm = vec3(0.0);
  if (puv.x > 0.0 && puv.y > 0.0 && puv.x < 1.0 && puv.y < 1.0) pm = texture2D(uPlan, puv).rgb;
  if (pm.b > 0.5) discard;
  // lawn: patches of greener and drier grass, fine blades, mown stripes
  float n1 = tsFbm(vWorld.xz * 0.035);
  float n2 = tsNoise(vWorld.xz * 0.9);
  float n3 = tsNoise(vWorld.xz * 7.0);
  vec3 grass = mix(vec3(0.19, 0.31, 0.08), vec3(0.33, 0.4, 0.13), n1);
  grass = mix(grass, vec3(0.45, 0.43, 0.2), smoothstep(0.62, 0.8, n1) * 0.5);
  grass *= 0.85 + 0.25 * n2 + 0.12 * (n3 - 0.5);
  grass *= 1.0 + 0.05 * sign(sin(vWorld.x * 0.45 + vWorld.z * 0.12));
  // paving: warm concrete slabs with joints and wear
  vec2 tile = fract(vWorld.xz / vec2(1.2, 1.2));
  float joint = smoothstep(0.0, 0.03, tile.x) * smoothstep(1.0, 0.97, tile.x) * smoothstep(0.0, 0.03, tile.y) * smoothstep(1.0, 0.97, tile.y);
  vec3 pave = vec3(0.62, 0.58, 0.53) * (0.9 + 0.12 * tsNoise(floor(vWorld.xz / 1.2) * 3.1)) * (0.92 + 0.1 * n2);
  pave *= mix(0.72, 1.0, joint);
  // beds: dark mulch with flowers
  float fl = tsHash(floor(vWorld.xz * 6.0));
  vec3 bed = vec3(0.16, 0.11, 0.07) * (0.8 + 0.4 * n3);
  vec3 flower = fl > 0.8 ? vec3(0.9, 0.2, 0.25) : fl > 0.6 ? vec3(0.95, 0.8, 0.2) : fl > 0.45 ? vec3(0.6, 0.3, 0.75) : vec3(0.2, 0.45, 0.15);
  bed = mix(bed, flower, step(0.35, fl) * step(0.55, tsNoise(vWorld.xz * 12.0)));
  // the lake's bank: wet sand and mud toward the water
  vec3 col = mix(grass, pave, smoothstep(0.35, 0.65, pm.r));
  col = mix(col, bed, smoothstep(0.35, 0.65, pm.g));
  float wet = smoothstep(-0.05, -0.6, vWorld.y);
  col = mix(col, vec3(0.32, 0.27, 0.18) * (0.8 + 0.3 * n2), smoothstep(-0.02, -0.25, vWorld.y));
  col *= 1.0 - 0.35 * wet;
  vec4 diffuseColor = vec4(col, 1.0);
`,
      )
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "")
      .replace(
        "#include <roughnessmap_fragment>",
        "float roughnessFactor = mix(0.95, 0.75, smoothstep(0.35, 0.65, pm.r));",
      );
  };
  return m;
};

const Ground: React.FC = () => {
  const geo = useMemo(() => {
    const n = 280;
    const g = new THREE.PlaneGeometry(PLAN.size, PLAN.size, n, n);
    g.rotateX(-Math.PI / 2);
    g.translate(PLAN.x0 + PLAN.size / 2, 0, PLAN.z0 + PLAN.size / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    return g;
  }, []);
  const far = useMemo(() => {
    // the plain beyond: a big ring round the detailed square, a touch lower at the seam
    const outer = new THREE.Shape();
    outer.moveTo(-6000, -6000);
    outer.lineTo(6000, -6000);
    outer.lineTo(6000, 6000);
    outer.lineTo(-6000, 6000);
    const hole = new THREE.Path();
    hole.moveTo(PLAN.x0 + 1, PLAN.z0 + 1);
    hole.lineTo(PLAN.x0 + 1, PLAN.z0 + PLAN.size - 1);
    hole.lineTo(PLAN.x0 + PLAN.size - 1, PLAN.z0 + PLAN.size - 1);
    hole.lineTo(PLAN.x0 + PLAN.size - 1, PLAN.z0 + 1);
    outer.holes.push(hole);
    const g = new THREE.ShapeGeometry(outer);
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  const mat = useMemo(() => groundMaterial(), []);
  return (
    <>
      <mesh geometry={geo} material={mat} receiveShadow />
      <mesh geometry={far} material={mat} position={[0, -0.02, 0]} receiveShadow />
    </>
  );
};

/* ------------------------------------------------------------------ */
/* The lake                                                             */
/* ------------------------------------------------------------------ */

const Lake: React.FC<{ time: number }> = ({ time }) => {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: "#1E4A52", roughness: 0.06, metalness: 0.0, envMapIntensity: 1.2 });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = { value: 0 };
      m.userData.shader = s;
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", `#include <common>\n${NOISE}\nvarying vec3 vWorld;\nuniform float uTime;`)
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
  // ripples: a few octaves of moving noise tilt the normal
  vec2 q = vWorld.xz;
  float e = 0.08;
  float h0 = tsNoise(q * 0.7 + uTime * vec2(0.3, 0.1)) + 0.5 * tsNoise(q * 2.1 - uTime * vec2(0.2, 0.35)) + 0.25 * tsNoise(q * 5.3 + uTime * 0.5);
  float hx = tsNoise((q + vec2(e, 0.0)) * 0.7 + uTime * vec2(0.3, 0.1)) + 0.5 * tsNoise((q + vec2(e, 0.0)) * 2.1 - uTime * vec2(0.2, 0.35)) + 0.25 * tsNoise((q + vec2(e, 0.0)) * 5.3 + uTime * 0.5);
  float hz = tsNoise((q + vec2(0.0, e)) * 0.7 + uTime * vec2(0.3, 0.1)) + 0.5 * tsNoise((q + vec2(0.0, e)) * 2.1 - uTime * vec2(0.2, 0.35)) + 0.25 * tsNoise((q + vec2(0.0, e)) * 5.3 + uTime * 0.5);
  vec3 wn = normalize(vec3(-(hx - h0) / e * 0.06, 1.0, -(hz - h0) / e * 0.06));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`,
        );
    };
    return m;
  }, []);
  const sh = mat.userData.shader as { uniforms: { uTime: { value: number } } } | undefined;
  if (sh) sh.uniforms.uTime.value = time;
  return (
    <mesh material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[LAKE.cx, LAKE.y, LAKE.cz]} scale={[LAKE.rx * 1.18, LAKE.rz * 1.25, 1]} receiveShadow>
      <circleGeometry args={[1, 96]} />
    </mesh>
  );
};

/* ------------------------------------------------------------------ */
/* The cut and the tunnel                                               */
/* ------------------------------------------------------------------ */

const CUT = { s0: 236.0, s1: 331.0 };
/** The tunnel is covered where the heartline is this far under the ground. */
const TUNNEL_Y = -1.6;
const HALF = 3.25;

const Cut: React.FC = () => {
  const geos = useMemo(() => {
    const walls: THREE.BufferGeometry[] = [];
    const roof: THREE.BufferGeometry[] = [];
    const floor: THREE.BufferGeometry[] = [];
    const lightsAt: Frame[] = [];
    const step = 0.5;
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap((v) => [v.x, v.y, v.z]), 3));
      g.computeVertexNormals();
      return g;
    };
    let lastLight = -10;
    for (let s = CUT.s0; s < CUT.s1; s += step) {
      const f0 = frameAt(s);
      const f1 = frameAt(s + step);
      const covered0 = f0.P.y < TUNNEL_Y;
      const covered1 = f1.P.y < TUNNEL_Y;
      // floor under the spine
      const fl = (f: Frame, side: number) => f.P.clone().addScaledVector(f.R, side * HALF).addScaledVector(f.U, -2.7);
      floor.push(quad(fl(f0, -1), fl(f1, -1), fl(f1, 1), fl(f0, 1)));
      for (const side of [-1, 1]) {
        // walls: up to the ground (open cut) or to the roof (tunnel); facing in
        const top = (f: Frame, cov: boolean) => {
          const base = f.P.clone().addScaledVector(f.R, side * HALF);
          return cov ? base.clone().addScaledVector(f.U, 2.0) : new THREE.Vector3(base.x, 0.02, base.z);
        };
        const a = fl(f0, side);
        const b = fl(f1, side);
        const c = top(f1, covered1);
        const d = top(f0, covered0);
        walls.push(side > 0 ? quad(a, d, c, b) : quad(a, b, c, d));
        // the coping on top of the open cut's walls
        if (!covered0) {
          const out = new THREE.Vector3(f0.R.x, 0, f0.R.z).normalize().multiplyScalar(side);
          const dd = d.clone();
          const cc = c.clone();
          walls.push(side > 0 ? quad(dd, dd.clone().addScaledVector(out, 0.5), cc.clone().addScaledVector(out, 0.5), cc) : quad(dd, cc, cc.clone().addScaledVector(out, 0.5), dd.clone().addScaledVector(out, 0.5)));
        }
      }
      if (covered0 && covered1) {
        const rf = (f: Frame, side: number) => f.P.clone().addScaledVector(f.R, side * HALF).addScaledVector(f.U, 2.0);
        roof.push(quad(rf(f0, -1), rf(f0, 1), rf(f1, 1), rf(f1, -1)));
        if (s - lastLight > 2.4) {
          lightsAt.push(f0);
          lastLight = s;
        }
      }
    }
    return {
      walls: mergeGeometries(walls)!,
      roof: mergeGeometries(roof)!,
      floor: mergeGeometries(floor)!,
      lightsAt,
    };
  }, []);
  const lights = useMemo(() => {
    const g = new THREE.BoxGeometry(5.6, 0.06, 0.35);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 3.2, 2.4) });
    const im = new THREE.InstancedMesh(g, m, geos.lightsAt.length);
    geos.lightsAt.forEach((f, i) => {
      const mm = new THREE.Matrix4().makeBasis(f.R, f.U, f.T.clone().negate());
      mm.setPosition(f.P.clone().addScaledVector(f.U, 1.93));
      im.setMatrixAt(i, mm);
    });
    im.frustumCulled = false;
    return im;
  }, [geos]);
  const conc = useMemo(() => new THREE.MeshStandardMaterial({ color: "#A9A397", roughness: 0.9, side: THREE.DoubleSide }), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6F6A62", roughness: 0.95, side: THREE.DoubleSide }), []);
  return (
    <>
      <mesh geometry={geos.walls} material={conc} receiveShadow />
      <mesh geometry={geos.floor} material={dark} receiveShadow />
      <mesh geometry={geos.roof} material={dark} />
      <primitive object={lights} />
    </>
  );
};

/** Where the tunnel's covered part starts and ends (track s), for the portals. */
const tunnelEnds = () => {
  let a = -1;
  let b = -1;
  for (let s = CUT.s0; s < CUT.s1; s += 0.25) {
    const y = frameAt(s).P.y;
    if (y < TUNNEL_Y && a < 0) a = s;
    if (y < TUNNEL_Y) b = s;
  }
  return [a, b];
};
export const TUNNEL = tunnelEnds();

/** A concrete headwall round a tunnel mouth: piers either side, a lintel over, a parapet at the top. */
const Portal: React.FC<{ s: number; facing: number }> = ({ s, facing }) => {
  const geo = useMemo(() => {
    const f = frameAt(s);
    const h = new THREE.Vector3(f.T.x, 0, f.T.z).normalize().multiplyScalar(facing);
    const side = new THREE.Vector3().crossVectors(h, new THREE.Vector3(0, 1, 0)).normalize();
    const parts: THREE.BufferGeometry[] = [];
    const floorY = f.P.y - 2.7;
    const roofY = f.P.y + 2.0;
    const box = (w: number, hgt: number, d: number, off: number, y0: number) => {
      const g = new THREE.BoxGeometry(w, hgt, d);
      const m = new THREE.Matrix4().makeBasis(side, new THREE.Vector3(0, 1, 0), h.clone().negate());
      m.setPosition(f.P.clone().addScaledVector(side, off).setY(y0 + hgt / 2).addScaledVector(h, -0.5));
      g.applyMatrix4(m);
      return g;
    };
    // piers from the cut floor up past the ground, a lintel over the opening, a parapet
    parts.push(box(2.2, 0.6 - floorY, 1.0, HALF + 1.1, floorY));
    parts.push(box(2.2, 0.6 - floorY, 1.0, -HALF - 1.1, floorY));
    parts.push(box(HALF * 2 + 0.1, 0.6 - roofY, 1.0, 0, roofY));
    parts.push(box(HALF * 2 + 4.4, 0.25, 1.2, 0, 0.6));
    return mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
  }, [s, facing]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#B7B0A3", roughness: 0.85 }), []);
  return <mesh geometry={geo} material={mat} castShadow receiveShadow />;
};

export const Terrain: React.FC<{ time: number }> = ({ time }) => (
  <>
    <Ground />
    <Lake time={time} />
    <Cut />
    <Portal s={TUNNEL[0]} facing={1} />
    <Portal s={TUNNEL[1]} facing={-1} />
  </>
);

/** How far underground the camera is (0 out in the sun .. 1 in the tunnel). */
export const undergroundAt = (camY: number) => smooth(-0.6, -2.2, camY);
