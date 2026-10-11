import React, { useMemo } from "react";
import * as THREE from "three";
import { Googly } from "./Googly";
import { chrome, plastic, rubber, translucent } from "./mats";
import { EVENTS, LAY, T, clampF, inColdOpen } from "./timeline";

/**
 * The moving parts: pop bumpers (cap flashes, ring snaps down), flippers (angry eyebrows), the monster's
 * teeth (drop targets) and the other balls. Everything is driven by track.json's events.
 */

export type Ctx = {
  frame: number;
  t: number;
  /** Video time used for flashes and jolts: frozen in the freeze frame, nothing during the rewind. */
  te: number;
  cam: THREE.Vector3;
  cold: boolean;
};

/** Events usable at this point of the video (the cold open has its own copies of the jackpot hit). */
export const evList = (ctx: Ctx, kind: string, filter?: (e: (typeof EVENTS)[number]) => boolean) =>
  EVENTS.filter((e) => e.kind === kind && !!(e as { cold?: boolean }).cold === ctx.cold && (!filter || filter(e)));

/** Seconds since the last matching event (video time), or 99. */
export const since = (ctx: Ctx, kind: string, filter?: (e: (typeof EVENTS)[number]) => boolean) => {
  let best = 99;
  for (const e of evList(ctx, kind, filter)) {
    const d = ctx.te - e.t;
    if (d >= 0 && d < best) best = d;
  }
  return best;
};

/* ------------------------------------------------------------------ */
/* pop bumpers                                                          */
/* ------------------------------------------------------------------ */

const CAP_COLS = ["#FF3B6B", "#FFC020", "#2FD0FF"];

export const Bumpers: React.FC<{ ctx: Ctx; lit: number }> = ({ ctx, lit }) => (
  <group>
    {(LAY.bumpers as [number, number][]).map(([x, y], k) => {
      const s = since(ctx, "bumper", (e) => e.k === k);
      const flash = Math.exp(-s / 0.09);
      const ring = Math.exp(-s / 0.05);
      const col = new THREE.Color(CAP_COLS[k]);
      const capMat = translucent(CAP_COLS[k], 0.92, 0.0);
      const glow = new THREE.Color(CAP_COLS[k]).multiplyScalar(0.6 * lit + 6.0 * flash);
      const wp = new THREE.Vector3(x, 0.05, -y);
      return (
        <group key={k} position={[x, 0, -y]}>
          {/* skirt, body, the ring that snaps down */}
          <mesh position={[0, 0.0015, 0]} material={plastic("#F2EFE8", 0.4)}>
            <cylinderGeometry args={[0.04, 0.041, 0.003, 40]} />
          </mesh>
          <mesh position={[0, 0.02, 0]} material={plastic("#FAFAF6", 0.35)}>
            <cylinderGeometry args={[0.027, 0.03, 0.036, 32]} />
          </mesh>
          <mesh position={[0, 0.013 - ring * 0.008, 0]} rotation={[Math.PI / 2, 0, 0]} material={chrome()}>
            <torusGeometry args={[0.0305, 0.0022, 8, 40]} />
          </mesh>
          {/* the cap: lit from inside */}
          <mesh position={[0, 0.045, 0]} material={capMat}>
            <cylinderGeometry args={[0.038, 0.035, 0.016, 40]} />
          </mesh>
          <mesh position={[0, 0.0531, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.03, 32]} />
            <meshBasicMaterial color={glow} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.045, 0]}>
            <cylinderGeometry args={[0.0385, 0.0355, 0.0165, 40, 1, true]} />
            <meshBasicMaterial color={glow} toneMapped={false} transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {/* eyes on top of the cap, watching you */}
          {[-1, 1].map((sd) => {
            const ex = new THREE.Vector3(sd * 0.013, 0.067, 0.004);
            return (
              <Googly
                key={sd}
                pos={[ex.x, ex.y, ex.z]}
                r={0.0105}
                worldPos={wp.clone().add(ex)}
                look={ctx.cam}
                jolt={s}
                seed={k * 3 + sd}
                t={ctx.t}
              />
            );
          })}
          <mesh position={[0, 0.0545, 0]} material={chrome()}>
            <cylinderGeometry args={[0.004, 0.004, 0.006, 10]} />
          </mesh>
          <mesh position={[0, 0.058, 0]} material={chrome()}>
            <cylinderGeometry args={[0.0015, 0.0015, 0.014, 6]} />
          </mesh>
          {col ? null : null}
        </group>
      );
    })}
  </group>
);

/* ------------------------------------------------------------------ */
/* flippers                                                             */
/* ------------------------------------------------------------------ */

const flipperGeo = (h: number, grow = 0) => {
  const r0 = LAY.flipR0 + grow;
  const r1 = LAY.flipR1 + grow;
  const len = LAY.flipLen;
  const s = new THREE.Shape();
  // tapered capsule along +x: tangent lines between the two end circles
  const a = Math.asin((r0 - r1) / len);
  s.absarc(0, 0, r0, Math.PI / 2 + a, (3 * Math.PI) / 2 - a, false);
  s.absarc(len, 0, r1, -Math.PI / 2 - a, Math.PI / 2 + a, false);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 18 });
  g.rotateX(-Math.PI / 2);
  return g;
};

export const Flippers: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const geos = useMemo(() => ({ body: flipperGeo(0.018), band: flipperGeo(0.007, 0.0016) }), []);
  const f = clampF(ctx.frame);
  return (
    <group>
      {(["L", "R"] as const).map((side) => {
        const fl = LAY.flippers[side];
        const ang = side === "L" ? T.flipL[f] : T.flipR[f];
        const s = since(ctx, "flipper_" + side);
        const pv = new THREE.Vector3(fl.pivot[0], 0, -fl.pivot[1]);
        const th = THREE.MathUtils.degToRad(ang);
        // eye on top near the pivot, an angry brow over it
        const eyeLocal = new THREE.Vector3(0.016, 0.027, 0);
        const eyeWorld = eyeLocal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), th).add(pv);
        const mirror = side === "L" ? 1 : -1;
        return (
          <group key={side} position={pv} rotation={[0, th, 0]}>
            <mesh geometry={geos.body} material={plastic("#F7F4EC", 0.32)} />
            <mesh geometry={geos.band} position={[0, 0.0055, 0]} material={rubber(side === "L" ? "#E8263A" : "#E8263A")} />
            <mesh position={[0, 0.019, 0]} material={chrome()}>
              <cylinderGeometry args={[0.005, 0.005, 0.003, 16]} />
            </mesh>
            <Googly pos={[eyeLocal.x, eyeLocal.y, eyeLocal.z]} r={0.0095} worldPos={eyeWorld} look={ctx.cam} jolt={s} seed={side === "L" ? 7 : 9} t={ctx.t} stare={0.8} />
            {/* angry eyebrow */}
            <mesh position={[0.016, 0.0395, 0]} rotation={[0, 0, 0.45 * mirror]} material={plastic("#141018", 0.5)}>
              <boxGeometry args={[0.019, 0.0035, 0.004]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* the monster's teeth (drop targets)                                   */
/* ------------------------------------------------------------------ */

export const Teeth: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    const w = LAY.dropW / 2 - 0.001;
    s.moveTo(-w, 0);
    s.lineTo(w, 0);
    s.lineTo(w, 0.02);
    s.quadraticCurveTo(w, 0.03, 0, 0.032);
    s.quadraticCurveTo(-w, 0.03, -w, 0.02);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0012, bevelSegments: 3 });
    g.translate(0, 0, -0.003);
    return g;
  }, []);
  return (
    <group>
      {(LAY.drops as [number, number][]).map(([x, y], k) => {
        // dropped? (by any ball, at its event time); during the rewind/cold open use the pinball time
        const fi = clampF(ctx.frame);
        const tau = T.tau[fi];
        const ev = EVENTS.filter((e) => e.kind === "drop" && e.k === k && !(e as { cold?: boolean }).cold);
        const tDrop = ev.length ? ev[0].tau : 1e9;
        // sink over 40 ms of pinball time
        const down = Math.min(1, Math.max(0, (tau - tDrop) / 0.04));
        return (
          <mesh key={k} geometry={geo} position={[x, -down * 0.034, -y]} material={plastic("#FBF7EC", 0.25)} />
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* the other balls (multiball)                                          */
/* ------------------------------------------------------------------ */

export const OtherBalls: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const f = clampF(ctx.frame);
  return (
    <group>
      {Object.entries(T.others).map(([name, arr]) => {
        const p = (arr as number[][])[f];
        if (!p || !p[3]) return null;
        return (
          <group key={name}>
            <mesh position={[p[0], p[1], p[2]]} material={chrome()}>
              <sphereGeometry args={[LAY.R, 40, 28]} />
            </mesh>
            {/* contact shadow */}
            <mesh position={[p[0], 0.0004, p[2]]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[LAY.R * 1.3, 24]} />
              <meshBasicMaterial color="#000000" transparent opacity={0.45} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

export const coldOpen = inColdOpen;
