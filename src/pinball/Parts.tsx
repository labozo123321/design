import React, { useMemo } from "react";
import * as THREE from "three";
import { Brow, Googly } from "./Googly";
import { chrome, glossy, plastic, rubber, std } from "./mats";
import { EVENTS, LAY, T, clampF, inColdOpen } from "./timeline";

/**
 * The moving parts: pop bumpers (cap and body light up, ring snaps down, eyebrows jump), flippers (angry
 * eyes, a rubber ring, they flip), the monster's teeth (drop targets) and the balls. Everything is driven
 * by track.json's events.
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
  EVENTS.filter(
    (e) => e.kind === kind && !!(e as { cold?: boolean }).cold === ctx.cold && (!filter || filter(e)),
  );

/** Seconds since the last matching event (video time), or 99. */
export const since = (ctx: Ctx, kind: string, filter?: (e: (typeof EVENTS)[number]) => boolean) => {
  let best = 99;
  for (const e of evList(ctx, kind, filter)) {
    const d = ctx.te - e.t;
    if (d >= 0 && d < best) best = d;
  }
  return best;
};

/** For a pair of eyes facing the camera: which one is on the left of the screen (-1) or right (+1). */
const screenSide = (eye: THREE.Vector3, mid: THREE.Vector3, cam: THREE.Vector3) => {
  const toCam = cam.clone().sub(mid);
  const right = new THREE.Vector3(0, 1, 0).cross(toCam);
  return eye.clone().sub(mid).dot(right) >= 0 ? 1 : -1;
};

/* ------------------------------------------------------------------ */
/* pop bumpers                                                          */
/* ------------------------------------------------------------------ */

export const BUMPER_COLS = ["#FF3B6B", "#FFC020", "#2FD0FF"];
const BROWS: Brow[] = [{ tilt: 0.42 }, { tilt: -0.22 }, { tilt: 0.18 }];

const lathe = (pts: [number, number][], seg = 48) =>
  new THREE.LatheGeometry(
    pts.map(([r, h]) => new THREE.Vector2(r, h)),
    seg,
    Math.PI,
    Math.PI * 2,
  );

/** The bumper's body print: ribbed coloured plastic with a big toothy grin facing down the table. */
const bodyTexture = (col: string, k: number) => {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d")!;
  const base = new THREE.Color(col);
  const css = (m: number) =>
    `rgb(${Math.min(255, base.r * 255 * m)}, ${Math.min(255, base.g * 255 * m)}, ${Math.min(255, base.b * 255 * m)})`;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, css(1.15));
  grad.addColorStop(0.5, css(0.95));
  grad.addColorStop(1, css(0.6));
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 256);
  // ribs
  for (let i = 0; i < 48; i++) {
    g.fillStyle = i % 2 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
    g.fillRect((i / 48) * 1024, 0, 1024 / 48, 256);
  }
  // the grin (u = 0.5 faces down the table); v runs up the body, so the canvas is upside down: flip it
  g.save();
  g.translate(512, 128);
  g.scale(1, -1);
  g.fillStyle = "#2A0614";
  g.strokeStyle = "#14051F";
  g.lineWidth = 8;
  g.beginPath();
  const wM = k === 1 ? 150 : 128;
  g.moveTo(-wM, 22);
  g.quadraticCurveTo(0, k === 0 ? 50 : 30, wM, 22);
  g.quadraticCurveTo(0, k === 1 ? -110 : -80, -wM, 22);
  g.closePath();
  g.fill();
  g.save();
  g.clip();
  // teeth on top, a tongue below
  g.fillStyle = "#FFFDF2";
  for (let i = -5; i <= 5; i++) {
    g.beginPath();
    g.moveTo(i * 24 - 12, 40);
    g.lineTo(i * 24 + 12, 40);
    g.lineTo(i * 24 + 9, k === 0 ? 4 : 10);
    g.lineTo(i * 24 - 9, k === 0 ? 4 : 10);
    g.closePath();
    g.fill();
  }
  g.fillStyle = "#FF6FA8";
  g.beginPath();
  g.ellipse(0, -60, 70, 36, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.beginPath();
  g.moveTo(-wM, 22);
  g.quadraticCurveTo(0, k === 0 ? 50 : 30, wM, 22);
  g.quadraticCurveTo(0, k === 1 ? -110 : -80, -wM, 22);
  g.closePath();
  g.stroke();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

/** A star decal for the top of each cap. */
const capTexture = (col: string, label: string) => {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = col;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 2 ? 46 : 110;
    g.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.fillStyle = "#14051F";
  g.font = "bold 44px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, 128, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

export const Bumpers: React.FC<{ ctx: Ctx; lit: number }> = ({ ctx, lit }) => {
  const parts = useMemo(() => {
    const skirt = lathe([
      [0.0001, 0.0],
      [0.0445, 0.0],
      [0.0445, 0.0012],
      [0.043, 0.0028],
      [0.032, 0.0045],
      [0.029, 0.005],
    ]);
    const body = lathe([
      [0.029, 0.0048],
      [0.0278, 0.009],
      [0.0272, 0.02],
      [0.0276, 0.029],
      [0.0295, 0.0335],
      [0.0312, 0.0362],
    ]);
    const cap = lathe([
      [0.0312, 0.0362],
      [0.0352, 0.0372],
      [0.0358, 0.0395],
      [0.0356, 0.0445],
      [0.0335, 0.0492],
      [0.027, 0.0518],
      [0.012, 0.0529],
      [0.0001, 0.0531],
    ]);
    const mats = BUMPER_COLS.map((col, k) => {
      const tex = bodyTexture(col, k);
      return {
        body: new THREE.MeshStandardMaterial({
          map: tex,
          emissiveMap: tex,
          emissive: "#FFFFFF",
          roughness: 0.28,
        }),
        cap: new THREE.MeshPhysicalMaterial({
          color: col,
          emissive: col,
          roughness: 0.18,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
        }),
        decal: new THREE.MeshBasicMaterial({
          map: capTexture(col, ["100", "500", "1K"][k]),
          toneMapped: false,
        }),
      };
    });
    return { skirt, body, cap, mats };
  }, []);
  const skirtMat = plastic("#F4EFE6", 0.3);
  return (
    <group>
      {(LAY.bumpers as [number, number][]).map(([x, y], k) => {
        const s = since(ctx, "bumper", (e) => e.k === k);
        const flash = Math.exp(-s / 0.09);
        const ring = Math.exp(-s / 0.05);
        const m = parts.mats[k];
        const glow = 0.35 * lit + 4.5 * flash;
        m.body.emissiveIntensity = 0.08 * lit + 0.9 * flash;
        m.cap.emissiveIntensity = glow * 0.5;
        m.decal.color.setScalar(0.5 + 0.6 * lit + 5 * flash);
        const wp = new THREE.Vector3(x, 0, -y);
        const mid = wp.clone().add(new THREE.Vector3(0, 0.064, 0));
        const brow = BROWS[k];
        return (
          <group key={k} position={[x, 0, -y]}>
            <mesh geometry={parts.skirt} material={skirtMat} />
            <mesh geometry={parts.body} material={m.body} />
            {/* the ring that snaps down and kicks the ball away */}
            <mesh position={[0, 0.016 - ring * 0.009, 0]} rotation={[Math.PI / 2, 0, 0]} material={chrome()}>
              <torusGeometry args={[0.0308, 0.0024, 10, 48]} />
            </mesh>
            {[0, 1, 2].map((i) => {
              const a = (i / 3) * Math.PI * 2 + 0.5;
              return (
                <mesh
                  key={i}
                  position={[Math.cos(a) * 0.0308, 0.026 - ring * 0.009, Math.sin(a) * 0.0308]}
                  material={chrome()}
                >
                  <cylinderGeometry args={[0.0012, 0.0012, 0.02, 6]} />
                </mesh>
              );
            })}
            <mesh geometry={parts.cap} material={m.cap} />
            <mesh position={[0, 0.0533, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.decal}>
              <circleGeometry args={[0.022, 32]} />
            </mesh>
            {/* eyes on top of the cap, watching you; eyebrows jump when it fires */}
            {[-1, 1].map((sd) => {
              const ex = new THREE.Vector3(sd * 0.0135, 0.064, 0);
              const world = wp.clone().add(ex);
              const side = screenSide(world, mid, ctx.cam);
              return (
                <Googly
                  key={sd}
                  pos={[ex.x, ex.y, ex.z]}
                  r={0.0112}
                  worldPos={world}
                  look={ctx.cam}
                  jolt={s}
                  seed={k * 3 + sd}
                  t={ctx.t}
                  stare={0.75}
                  side={side}
                  brow={{ tilt: brow.tilt, lift: 0.5 * flash }}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
};

/** The light inside each bumper's cap: a coloured pool round it, bursting on every hit. */
export const BumperLights: React.FC<{ ctx: Ctx; lit: number }> = ({ ctx, lit }) => (
  <group>
    {(LAY.bumpers as [number, number][]).map(([x, y], k) => {
      const s = since(ctx, "bumper", (e) => e.k === k);
      const flash = Math.exp(-s / 0.09);
      return (
        <pointLight
          key={k}
          position={[x, 0.046, -y]}
          color={BUMPER_COLS[k]}
          intensity={0.0035 * lit + 0.03 * flash}
          distance={0}
          decay={2}
        />
      );
    })}
  </group>
);

/* ------------------------------------------------------------------ */
/* flippers                                                             */
/* ------------------------------------------------------------------ */

/** The flipper's outline (a tapered capsule along +x), grown by `grow`, as points. */
const outline = (grow: number, n = 64) => {
  const r0 = LAY.flipR0 + grow;
  const r1 = LAY.flipR1 + grow;
  const len = LAY.flipLen;
  // the tangent lines touch both circles at pi/2 - a (top) and -(pi/2 - a) (bottom)
  const a = Math.asin((LAY.flipR0 - LAY.flipR1) / len);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = Math.PI / 2 - a + ((Math.PI + 2 * a) * i) / n;
    pts.push(new THREE.Vector2(Math.cos(t) * r0, Math.sin(t) * r0));
  }
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + a + ((Math.PI - 2 * a) * i) / n;
    pts.push(new THREE.Vector2(len + Math.cos(t) * r1, Math.sin(t) * r1));
  }
  return pts;
};

const flipperGeos = () => {
  const s = new THREE.Shape(outline(-0.0035));
  const body = new THREE.ExtrudeGeometry(s, {
    depth: 0.015,
    bevelEnabled: true,
    bevelThickness: 0.0022,
    bevelSize: 0.0018,
    bevelSegments: 5,
    curveSegments: 24,
  });
  body.rotateX(-Math.PI / 2);
  body.translate(0, 0.0022, 0);
  // the rubber ring sits in a groove round the middle
  const ring = outline(-0.0026, 48).map((p) => new THREE.Vector3(p.x, 0.0105, -p.y));
  const rub = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(ring, true, "centripetal"),
    200,
    0.0029,
    12,
    true,
  );
  return { body, rub };
};

export const Flippers: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const geos = useMemo(flipperGeos, []);
  const f = clampF(ctx.frame);
  const body = glossy("#F8F5EC");
  return (
    <group>
      {(["L", "R"] as const).map((side) => {
        const fl = LAY.flippers[side];
        const ang = side === "L" ? T.flipL[f] : T.flipR[f];
        const s = since(ctx, "flipper_" + side);
        const pv = new THREE.Vector3(fl.pivot[0], 0, -fl.pivot[1]);
        const th = THREE.MathUtils.degToRad(ang);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), th);
        // how far up it is (0 at rest, 1 fully up): the eyebrows strain
        const up = Math.max(0, Math.min(1, (ang - fl.rest) / (fl.up - fl.rest)));
        const eyes = [0.013, 0.032].map((x) => new THREE.Vector3(x, 0.0275, 0));
        const worlds = eyes.map((e) => e.clone().applyQuaternion(q).add(pv));
        const mid = worlds[0].clone().add(worlds[1]).multiplyScalar(0.5);
        return (
          <group key={side} position={pv} quaternion={q}>
            <mesh geometry={geos.body} material={body} />
            <mesh geometry={geos.rub} material={rubber("#E8263A")} />
            <mesh position={[0, 0.0205, 0]} material={chrome()}>
              <cylinderGeometry args={[0.0055, 0.006, 0.0016, 20]} />
            </mesh>
            <mesh position={[0, 0.0218, 0]} material={chrome()}>
              <cylinderGeometry args={[0.0028, 0.0028, 0.0018, 6]} />
            </mesh>
            {eyes.map((e, i) => (
              <Googly
                key={i}
                pos={[e.x, e.y, e.z]}
                r={i === 0 ? 0.0078 : 0.0068}
                worldPos={worlds[i]}
                look={ctx.cam}
                jolt={s}
                seed={(side === "L" ? 7 : 9) + i}
                t={ctx.t}
                stare={0.85}
                parentQ={q}
                side={screenSide(worlds[i], mid, ctx.cam)}
                brow={{ tilt: 0.5 + 0.15 * up, lift: -0.15 * up }}
              />
            ))}
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
    const w = LAY.dropW / 2 - 0.0015;
    s.moveTo(-w, 0);
    s.lineTo(w, 0);
    s.lineTo(w, 0.02);
    s.quadraticCurveTo(w, 0.03, 0, 0.033);
    s.quadraticCurveTo(-w, 0.03, -w, 0.02);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.006,
      bevelEnabled: true,
      bevelSize: 0.0014,
      bevelThickness: 0.0014,
      bevelSegments: 4,
      curveSegments: 16,
    });
    g.translate(0, 0, -0.003);
    return g;
  }, []);
  const gum = plastic("#E04A86", 0.4);
  const fi = clampF(ctx.frame);
  const tau = T.tau[fi];
  return (
    <group>
      {/* the gum the teeth stand in */}
      <mesh position={[XC_DROPS, 0.0005, -(LAY.drops as [number, number][])[0][1]]} material={gum}>
        <boxGeometry args={[LAY.dropW * 3 + 0.012, 0.001, 0.012]} />
      </mesh>
      {(LAY.drops as [number, number][]).map(([x, y], k) => {
        const ev = EVENTS.filter((e) => e.kind === "drop" && e.k === k && !(e as { cold?: boolean }).cold);
        const tDrop = ev.length ? ev[0].tau : 1e9;
        // sink over 40 ms of pinball time
        const down = Math.min(1, Math.max(0, (tau - tDrop) / 0.04));
        return <mesh key={k} geometry={geo} position={[x, -down * 0.036, -y]} material={glossy("#FFF7E2")} />;
      })}
    </group>
  );
};
const XC_DROPS = (() => {
  const d = LAY.drops as [number, number][];
  return (d[0][0] + d[d.length - 1][0]) / 2;
})();

/* ------------------------------------------------------------------ */
/* the balls                                                            */
/* ------------------------------------------------------------------ */

const ballMat = () =>
  std(
    "ballChrome",
    () => new THREE.MeshStandardMaterial({ color: "#F2F4F8", metalness: 1, roughness: 0.06 }),
  );

/** A steel ball with googly eyes on the side facing the camera (and a soft shadow under it). */
export const EyedBall: React.FC<{
  pos: THREE.Vector3;
  cam: THREE.Vector3;
  t: number;
  seed: number;
  brow: Brow;
  jolt?: number;
}> = ({ pos, cam, t, seed, brow, jolt = 99 }) => {
  const R = LAY.R;
  const toCam = cam.clone().sub(pos);
  toCam.y = 0;
  if (toCam.lengthSq() < 1e-10) toCam.set(0, 0, 1);
  toCam.normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(toCam).normalize();
  const eyes = [-1, 1].map((sd) =>
    pos
      .clone()
      .add(toCam.clone().multiplyScalar(R * 0.82))
      .add(right.clone().multiplyScalar(sd * R * 0.4))
      .add(new THREE.Vector3(0, R * 0.38, 0)),
  );
  const shadowH = Math.max(0.0004, pos.y - R + 0.0004);
  return (
    <group>
      <mesh position={pos} material={ballMat()}>
        <sphereGeometry args={[R, 48, 32]} />
      </mesh>
      {pos.y < R + 0.01 && pos.y > R - 0.004 ? (
        <mesh position={[pos.x, shadowH, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[R * 1.25, 28]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.5} depthWrite={false} />
        </mesh>
      ) : null}
      {eyes.map((e, i) => (
        <Googly
          key={i}
          pos={[e.x, e.y, e.z]}
          r={R * 0.36}
          worldPos={e}
          look={cam}
          jolt={jolt}
          seed={seed + i}
          t={t}
          stare={0.9}
          side={i === 0 ? -1 : 1}
          brow={brow}
        />
      ))}
    </group>
  );
};

export const OtherBalls: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const f = clampF(ctx.frame);
  return (
    <group>
      {Object.entries(T.others).map(([name, arr], i) => {
        const p = (arr as number[][])[f];
        if (!p || !p[3]) return null;
        return (
          <EyedBall
            key={name}
            pos={new THREE.Vector3(p[0], p[1], p[2])}
            cam={ctx.cam}
            t={ctx.t}
            seed={20 + i * 5}
            brow={{ tilt: -0.3, lift: 0.1 }}
            jolt={since(ctx, "ballhit")}
          />
        );
      })}
    </group>
  );
};

export const coldOpen = inColdOpen;
