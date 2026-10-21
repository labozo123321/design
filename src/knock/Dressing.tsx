import React, { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BED, OUTLET, ROOM, SHELF, TREAD, treadPlace } from "./layout";
import type { Dressing as D, LightState } from "./direct";
import { CornerShelf, Outlet, OutletBox, PhotoStrip, Poster, Starfield } from "./props/wall";
import {
  BoxedDeskLamp,
  Candle,
  DarkerCarpetPatch,
  DinoLamp,
  DinoRug,
  EarplugTin,
  FairyLights,
  Laptop,
  LavenderRug,
  MiniFridge,
  MovingBox,
  PillowStack,
  PineSprig,
  SoccerBall,
  ToyBoxContents,
  TRex,
  spiralCurve,
} from "./props/bedroom";

/**
 * The rooms' dressing by era, from the prop library: Nora's crooked outlet with the moon nightlight (and the
 * back of its box inside the wall), your corner shelf with the green T-rex (it jolts when you knock and
 * topples, in 2004 and again in 2025; a candle beside it from 2016, a pine sprig at Christmas), the glow
 * stars on Nora's ceiling dwindling to four, the rugs (hers comes back, rucked, in 2025; between, the
 * unfaded carpet where it lay), posters, her boxes the first night and the night she leaves, your toys,
 * the dino lamp, the 2011 floor (laptop, ball, earplug tin, her fairy lights and photo strips), your own
 * boxes in 2016, the guest room's decorative pillows. Mom's treadmill (2014 on) is a placeholder until the
 * house props are in.
 */

const ERA_ORDER = ["2004a", "2004b", "2007", "2009", "2011", "2013", "2014", "2016", "2025"];
const at = (era: string) => ERA_ORDER.indexOf(era);

/** Everything inside casts and takes shadows (the glows and halos don't). */
const Shadowed: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const g = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    g.current?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const glowy = mats.some((x) => x.transparent || (x as THREE.MeshBasicMaterial).isMeshBasicMaterial || x.blending === THREE.AdditiveBlending);
      m.castShadow = !glowy;
      m.receiveShadow = !glowy;
    });
  });
  return <group ref={g}>{children}</group>;
};

/** Fairy lights wound round the top rail of Nora's headboard. */
const HEAD_RAIL = (() => {
  const x0 = -BED.w - 0.06 + 0.04;
  const x1 = -0.1;
  const y = BED.headboardH + 0.01;
  const z = ROOM.back + 0.035;
  return spiralCurve(new THREE.LineCurve3(new THREE.Vector3(x0, y, z), new THREE.Vector3(x1, y, z)), 0.03, 9);
})();

export const Dressing: React.FC<{ d: D; t: number; light: LightState; camDist: number }> = ({ d, t, light, camDist }) => {
  const e = at(d.era);
  const night = !d.day;
  // the T-rex: eased over (it rolls on its own hull); the shelf jolts on your knocks
  const tip = d.trex <= 0 ? 0 : d.trex >= 1 ? 1 : d.trex * d.trex * (3 - 2 * d.trex);
  const guest = e >= at("2016");
  // her moon nightlight is plugged in until she leaves
  const nightlight = e <= at("2011") || !!d.moveOut;
  const stars = useMemo(() => Math.max(0, Math.round(d.stars)), [d.stars]);
  return (
    <Shadowed>
      {/* your shelf, the T-rex, and what joins it */}
      <group position={[SHELF.at.x, SHELF.at.y + d.jolt * 0.004, SHELF.at.z]} rotation={[0, Math.PI / 2, 0]}>
        <CornerShelf />
        <group position={[-0.03, 0, 0.036]} rotation={[0, -Math.PI / 2, 0]}>
          <TRex tip={tip} dir={1} />
        </group>
        {d.era === "2011" ? (
          <group position={[0.075, 0, 0.045]}>
            <EarplugTin count={t < 24.3 ? 6 : 4} lid="none" />
          </group>
        ) : null}
        {guest ? (
          <group position={[0.0812, 0, 0.034]}>
            <Candle lit={0} t={t} />
          </group>
        ) : null}
        {d.era === "2025" ? (
          <group position={[0.08, 0, 0.128]} rotation={[0, Math.PI / 2, 0]} scale={0.55}>
            <PineSprig />
          </group>
        ) : null}
      </group>

      {/* Nora's crooked outlet, her moon nightlight, and the back of the box inside the wall */}
      <group position={OUTLET} rotation={[0, -Math.PI / 2, 0]}>
        <Outlet crooked nightlight={nightlight} on={light.nightlight} />
        <OutletBox leak={0.6 * light.nightlight} />
      </group>

      {/* the glow stars on her ceiling (a plane we only see as one from far up: closer in, the stickers would
          hang in front of the lens) */}
      {(() => {
        const far = Math.min(1, Math.max(0, (camDist - 7) / 3));
        const o = night && stars > 0 ? far * far * (3 - 2 * far) : 0;
        return o > 0.01 ? <Starfield count={stars} glow={d.starGlow} opacity={o} halo={0.5 * d.starGlow} /> : null;
      })()}

      {/* rugs: hers (2004-11, and back, rucked, in 2025), the unfaded carpet where it lay (2013-24); yours */}
      {e <= at("2011") ? (
        <group position={[-1.45, 0, -2.45]} rotation={[0, Math.PI / 2, 0]}>
          <LavenderRug />
        </group>
      ) : e < at("2025") ? (
        <group position={[-1.45, 0, -2.45]} rotation={[0, Math.PI / 2, 0]}>
          <DarkerCarpetPatch strength={0.8} />
        </group>
      ) : (
        <group position={[-1.42, 0, -2.5]} rotation={[0, Math.PI / 2 + 0.07, 0]}>
          <LavenderRug />
        </group>
      )}
      {e <= at("2014") ? (
        <group position={[1.6, 0, -2.55]} rotation={[0, Math.PI / 2, 0]}>
          <DinoRug />
        </group>
      ) : null}

      {/* posters over the headboards (edge-on from above: thin strips of colour on the back wall) */}
      {e <= at("2011") ? (
        <group position={[-0.56, 1.5, ROOM.back + 0.001]}>
          <Poster kind={e === at("2011") ? "band" : "unicorn"} />
        </group>
      ) : null}
      {e <= at("2014") ? (
        <group position={[0.56, 1.5, ROOM.back + 0.001]}>
          <Poster kind={e <= at("2004b") ? "trex" : "soccer"} />
        </group>
      ) : null}

      {/* 2004, the first night: her taped boxes; your open box of toys */}
      {d.era === "2004a" ? (
        <>
          <group position={[-2.02, 0, -0.95]} rotation={[0, 0.12, 0]}>
            <MovingBox text={"NORA'S STUFF — KEEP OUT"} seed={3} />
          </group>
          <group position={[-1.55, 0, -0.5]} rotation={[0, -0.2, 0]}>
            <MovingBox text={"NORA'S STUFF — KEEP OUT"} w={0.42} h={0.3} d={0.34} seed={5} />
          </group>
          <group position={[2.0, 0, -0.85]} rotation={[0, 0.3, 0]}>
            <MovingBox open={1} seed={7}>
              <ToyBoxContents />
            </MovingBox>
          </group>
        </>
      ) : null}
      {/* the dino lamp on a little stand in your corner (2004-09) */}
      {e <= at("2009") ? (
        <group position={[2.15, 0, ROOM.back + 0.22]}>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.38, 0.4, 0.36]} />
            <meshStandardMaterial color="#EDE8DF" roughness={0.6} />
          </mesh>
          <group position={[0, 0.4, 0.02]}>
            <DinoLamp on={0} />
          </group>
        </group>
      ) : null}

      {/* 2011: your floor, her fairy lights and photo strips */}
      {d.era === "2011" ? (
        <>
          <group position={[1.6, 0, -1.25]} rotation={[0, 0.45, 0]}>
            <Laptop open={0.75} screen={0} />
          </group>
          <group position={[2.12, 0, -0.55]}>
            <SoccerBall />
          </group>
          <FairyLights curve={HEAD_RAIL} count={46} on={light.fairy ?? 0} t={t} />
          {[-0.85, -0.66].map((x, i) => (
            <group key={x} position={[x, BED.headboardH - 0.2, ROOM.back + 0.055]}>
              <PhotoStrip tilt={i ? -0.05 : 0.04} />
            </group>
          ))}
        </>
      ) : null}

      {/* 2013, the night before she leaves: her dorm boxes, the mini fridge, a desk lamp in a box */}
      {d.moveOut ? (
        <>
          <group position={[-1.75, 0, -0.75]} rotation={[0, 0.08, 0]}>
            <MovingBox text={"DORM — BOOKS"} seed={11} />
          </group>
          <group position={[-2.05, 0, -1.4]} rotation={[0, -0.15, 0]}>
            <MovingBox text={"DORM — FRAGILE"} w={0.4} h={0.32} d={0.34} seed={12} />
          </group>
          <group position={[-1.3, 0, -0.38]} rotation={[0, Math.PI, 0]}>
            <MiniFridge />
          </group>
          <group position={[-2.1, 0, -0.42]} rotation={[0, 0.3, 0]}>
            <BoxedDeskLamp />
          </group>
        </>
      ) : null}

      {/* 2016: your boxes (no names on them) */}
      {d.dormBoxes ? (
        <>
          <group position={[1.7, 0, -0.85]} rotation={[0, -0.1, 0]}>
            <MovingBox text={"DORM — BOOKS"} seed={21} />
          </group>
          <group position={[2.05, 0, -1.45]} rotation={[0, 0.2, 0]}>
            <MovingBox text={"DORM — FRAGILE"} w={0.4} h={0.32} d={0.34} seed={22} />
          </group>
          <group position={[1.42, 0, -0.42]}>
            <BoxedDeskLamp />
          </group>
        </>
      ) : null}

      {/* the guest room's six decorative pillows, stacked on the floor by the bed */}
      {guest ? (
        <group position={[1.55, 0, ROOM.back + 0.45]} rotation={[0, 0.2, 0]}>
          <PillowStack />
        </group>
      ) : null}

      {/* mom's treadmill in Nora's room from 2014 (placeholder until the prop is in) */}
      {["2014", "2016", "2025"].includes(d.era) ? (
        <group position={treadPlace(d.era).at} rotation={[0, treadPlace(d.era).rotY, 0]}>
          <mesh position={[0, TREAD.deck / 2, 0]}>
            <boxGeometry args={[0.72, TREAD.deck, TREAD.z1 - TREAD.z0]} />
            <meshStandardMaterial color="#2B2D31" roughness={0.6} />
          </mesh>
          <mesh position={[0, TREAD.deck + 0.003, -0.08]}>
            <boxGeometry args={[0.5, 0.006, TREAD.z1 - TREAD.z0 - 0.3]} />
            <meshStandardMaterial color="#141416" roughness={0.85} />
          </mesh>
          {[-0.33, 0.33].map((x) => (
            <mesh key={x} position={[x, 0.68, (TREAD.z1 - TREAD.z0) / 2 - 0.12]} rotation={[0.18, 0, 0]}>
              <boxGeometry args={[0.05, 1.0, 0.06]} />
              <meshStandardMaterial color="#3A3D42" roughness={0.5} metalness={0.3} />
            </mesh>
          ))}
          <mesh position={[0, TREAD.console.y, TREAD.console.z - (TREAD.z0 + TREAD.z1) / 2]} rotation={[-0.6, 0, 0]}>
            <boxGeometry args={[0.72, 0.05, 0.26]} />
            <meshStandardMaterial color="#2F3236" roughness={0.45} />
          </mesh>
        </group>
      ) : null}
    </Shadowed>
  );
};
