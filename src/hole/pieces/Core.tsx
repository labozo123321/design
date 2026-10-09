import React, { useMemo } from "react";
import * as THREE from "three";
import { HX, HZ } from "../timeline";
import { rng } from "../mats";
import { CAVERN_R } from "../Shaft";

/**
 * The outer core: a cavern of liquid iron the shaft crosses as a glass tube (the walls, ceiling and floor are
 * ray-cast in the shaft shader). Here: the geodynamo's magnetic field drawn as glowing loops, lightning
 * jumping between them, and the inner core's crystals rising from the floor.
 *
 * `top` and `bot` are the world heights of the cavern's ceiling (the core-mantle boundary) and floor (the
 * inner core's surface) for whichever side you're on.
 */

let dashTex: THREE.Texture | null = null;
/** Bright dashes with soft ends: the "current" flowing round each field line. */
const dashes = () => {
  if (dashTex) return dashTex;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 8;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, "rgba(255,255,255,0.15)");
  grd.addColorStop(0.35, "rgba(255,255,255,1)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.25)");
  grd.addColorStop(1, "rgba(255,255,255,0.15)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 8);
  dashTex = new THREE.CanvasTexture(c);
  dashTex.wrapS = dashTex.wrapT = THREE.RepeatWrapping;
  return dashTex;
};

type Loop = { az: number; r1: number; r2: number; inset: number; speed: number; rep: number };
const LOOPS: Loop[] = (() => {
  const R = rng(777);
  return Array.from({ length: 11 }).map((_, i) => ({
    az: (i / 11) * Math.PI * 2 + R() * 0.3,
    r1: 30 + R() * 25,
    r2: 70 + R() * 75,
    inset: 0.05 + R() * 0.12,
    speed: 0.04 + R() * 0.05,
    rep: 6 + Math.floor(R() * 5),
  }));
})();

/** A dipole-ish field line in a vertical plane: out from the floor, bowing wide, back in at the ceiling. */
const loopCurve = (l: Loop, h: number) => {
  const pts: THREE.Vector3[] = [];
  const n = 28;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    // r = r1 + (r2 - r1) * cos^2-ish bulge; y from bottom to top
    const y = -Math.cos(a) * (0.5 - l.inset) * h;
    const r = l.r1 + (l.r2 - l.r1) * Math.pow(Math.max(0, Math.sin(a)), 1.4) * (a < Math.PI ? 1 : 0.15);
    pts.push(new THREE.Vector3(Math.sin(l.az) * r, y, Math.cos(l.az) * r));
  }
  return new THREE.CatmullRomCurve3(pts, true, "centripetal");
};

type Spire = { x: number; z: number; h: number; r: number; tilt: number; dir: number };
const SPIRES: Spire[] = (() => {
  const R = rng(9001);
  const out: Spire[] = [];
  while (out.length < 46) {
    const a = R() * Math.PI * 2;
    const rr = 14 + Math.pow(R(), 0.8) * (CAVERN_R - 20);
    out.push({
      x: Math.sin(a) * rr,
      z: Math.cos(a) * rr,
      h: 12 + R() * R() * 75,
      r: 1.6 + R() * 5,
      tilt: (R() - 0.5) * 0.5,
      dir: R() * Math.PI * 2,
    });
  }
  return out;
})();

/** Lightning: when each bolt fires (s), and between which loops. */
export const BOLTS = [
  { t: 35.9, a: 1, b: 5 },
  { t: 37.4, a: 3, b: 8 },
  { t: 38.95, a: 0, b: 6 },
  { t: 40.2, a: 7, b: 2 },
  { t: 41.6, a: 4, b: 9 },
  { t: 51.5, a: 2, b: 7 },
  { t: 52.6, a: 5, b: 10 },
];
/** How bright a bolt is at time t (a flicker of a few frames), 0 when off. */
export const boltK = (t: number, t0: number) => {
  const a = t - t0;
  if (a < 0 || a > 0.32) return 0;
  return (a < 0.05 ? 1 : a < 0.1 ? 0.35 : a < 0.16 ? 0.9 : 0.6 * (1 - (a - 0.16) / 0.16)) * 1;
};

const boltGeo = (seed: number, from: THREE.Vector3, to: THREE.Vector3) => {
  const R = rng(seed);
  const pts: THREE.Vector3[] = [];
  const n = 18;
  const span = from.distanceTo(to);
  for (let k = 0; k <= n; k++) {
    const p = from.clone().lerp(to, k / n);
    if (k > 0 && k < n) p.add(new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(span * 0.09));
    pts.push(p);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.55, 5, false);
};

export const Core: React.FC<{ top: number; bot: number; t: number }> = ({ top, bot, t }) => {
  const h = top - bot;
  const mid = (top + bot) / 2;
  const loops = useMemo(() => {
    const cache = new Map<number, THREE.TubeGeometry[]>();
    return (hh: number) => {
      const key = Math.round(hh);
      let g = cache.get(key);
      if (!g) {
        g = LOOPS.map((l) => new THREE.TubeGeometry(loopCurve(l, hh), 220, 0.55, 6, true));
        cache.set(key, g);
      }
      return g;
    };
  }, []);
  const lineMats = useMemo(
    () =>
      LOOPS.map(() => {
        const tex = dashes().clone();
        tex.needsUpdate = true;
        return new THREE.MeshBasicMaterial({
          map: tex,
          color: new THREE.Color(0.2, 0.62, 1.25),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: true,
        });
      }),
    [],
  );
  LOOPS.forEach((l, i) => {
    const tex = lineMats[i].map!;
    tex.repeat.set(l.rep, 1);
    tex.offset.set(-t * l.speed * l.rep, 0);
  });
  const geos = loops(h);
  const spireMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.52, 0.16) }),
    [],
  );
  const spireEdge = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.95, 0.42) }),
    [],
  );
  const spireGeo = useMemo(() => new THREE.CylinderGeometry(0.12, 1, 1, 6, 1), []);
  const bolts = useMemo(() => {
    const map = new Map<string, THREE.TubeGeometry>();
    return (i: number, hh: number) => {
      const key = `${i}:${Math.round(hh)}`;
      let g = map.get(key);
      if (!g) {
        const b = BOLTS[i];
        const ca = loopCurve(LOOPS[b.a], hh).getPoint(0.27 + 0.05 * (i % 3));
        const cb = loopCurve(LOOPS[b.b], hh).getPoint(0.22 + 0.06 * (i % 2));
        g = boltGeo(31 + i * 17, ca, cb);
        map.set(key, g);
      }
      return g;
    };
  }, []);
  const boltMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.6, 2.2, 3.6),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  return (
    <group position={[HX, 0, HZ]}>
      <group position={[0, mid, 0]}>
        {geos.map((g, i) => (
          <mesh key={i} geometry={g} material={lineMats[i]} renderOrder={3} frustumCulled={false} />
        ))}
        {BOLTS.map((b, i) => {
          const k = boltK(t, b.t);
          if (k <= 0) return null;
          boltMat.opacity = k;
          return <mesh key={i} geometry={bolts(i, h)} material={boltMat} renderOrder={4} frustumCulled={false} />;
        })}
      </group>
      {/* the inner core's crystals standing on the cavern floor */}
      {SPIRES.map((s, i) => (
        <group key={i} position={[s.x, bot, s.z]} rotation={[Math.cos(s.dir) * s.tilt, 0, Math.sin(s.dir) * s.tilt]}>
          <mesh geometry={spireGeo} position={[0, s.h / 2, 0]} scale={[s.r, s.h, s.r]} material={i % 5 === 0 ? spireEdge : spireMat} />
        </group>
      ))}
    </group>
  );
};
