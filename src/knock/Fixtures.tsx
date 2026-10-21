import React from "react";
import { DOOR, HALL, PORCH, ROOM, WINDOWS } from "./layout";
import { Banister, CeilingFixture, Door, PuppyBed, Window } from "./props/house";
import { ChristmasGutterLights, Porch } from "./props/porch";

/**
 * The house's fittings, by era and moment: the two bedroom doors (hung in the back wall, standing open into
 * the hallway so nobody's walk ever meets them), the four double-hung windows with each room's curtains
 * (rain streaking the glass in the 2009 storm, snow in the corners on Christmas Eve), the hallway's ceiling
 * light (its click-off is bedtime), the banister over the stairwell (pine garland and warm lights in 2025),
 * Moose's puppy bed in Nora's doorway (2005-06), and the porch roof outside the windows with its seasons:
 * leaves, snow, rain and an overflowing gutter, the Christmas lights.
 */

export type Outside = {
  leaves?: number;
  snow?: number;
  rain?: number;
  overflow?: number;
  wet?: number;
  lights?: number | null;
  /** on the glass */
  windowRain?: number;
  windowSnow?: number;
};

export type FixtureState = {
  era: string;
  t: number;
  hall: number;
  strings: number;
  puppyBed: boolean;
  outside: Outside;
};

const CURTAINS: Record<string, { nora: string; you: string }> = {
  kids: { nora: "#B9A0D4", you: "#5F84B0" },
  teen: { nora: "#8E6FA8", you: "#3E4F6E" },
  later: { nora: "#D9D1C3", you: "#CDBFA8" },
};

export const Fixtures: React.FC<{ f: FixtureState }> = ({ f }) => {
  const O = ROOM.outer;
  const T = ROOM.wallT;
  const dx = (DOOR.x0 + DOOR.x1) / 2;
  const kids = ["2004a", "2004b", "2007", "2009"].includes(f.era);
  const c = kids ? CURTAINS.kids : f.era === "2011" ? CURTAINS.teen : CURTAINS.later;
  return (
    <group>
      {/* the doors, open into the hallway (hinged on the outer side) */}
      {[-1, 1].map((s) => (
        <group key={`d${s}`} position={[s * dx, 0, ROOM.back - T / 2]}>
          <Door hinge={s as -1 | 1} swing={-1} open={1.35} />
        </group>
      ))}
      {/* the windows */}
      {[-1, 1].flatMap((s) =>
        WINDOWS.xs.map((x, i) => (
          <group key={`w${s}${i}`} position={[s * x, 0, ROOM.front + T / 2]}>
            <Window
              rain={f.outside.windowRain ?? 0}
              time={f.t}
              snowCorner={f.outside.windowSnow ?? 0}
              curtains={{ color: s < 0 ? c.nora : c.you, open: 1, length: "sill" }}
              seed={i + (s > 0 ? 2 : 0)}
              rodExtend={0.03}
            />
          </group>
        )),
      )}
      {/* the hallway: its ceiling light, the banister over the stairwell */}
      {/* (toward the stairwell side, so nobody walking the hall passes under it from the camera's view) */}
      <group position={[0, ROOM.ceiling, HALL.z1 + 0.27]}>
        <CeilingFixture on={f.hall} />
      </group>
      <group position={[0, 0, HALL.z1 + 0.04]}>
        <Banister length={2 * O - 0.03} garland={f.era === "2025" ? { on: f.strings } : null} />
      </group>
      {/* Moose's puppy bed, just inside Nora's door */}
      {f.puppyBed ? (
        <group position={[-dx, 0, ROOM.back + 0.33]}>
          <PuppyBed />
        </group>
      ) : null}
      {/* the porch roof outside the front windows */}
      <group position={[0, PORCH.yWall, PORCH.z0]}>
        {/* the Christmas lights strung across the roof as well (the gutter's own string is below the frame) */}
        {f.outside.lights !== null && f.outside.lights !== undefined ? (
          // (on the roof's slope, lifted above the snow cover along the roof's normal)
          <group position={[0, -0.6 * (0.62 / 1.7) + 0.12 * Math.cos(Math.atan2(0.6, 1.7)), 0.62 + 0.12 * Math.sin(Math.atan2(0.6, 1.7))]} rotation={[Math.atan2(0.6, 1.7), 0, 0]}>
            <ChristmasGutterLights on={f.outside.lights} seed={3} />
          </group>
        ) : null}
        <Porch
          leaves={f.outside.leaves ?? 0}
          snow={f.outside.snow ?? 0}
          rain={f.outside.rain ?? 0}
          overflow={f.outside.overflow ?? 0}
          wet={f.outside.wet ?? 0}
          lights={f.outside.lights ?? null}
          time={f.t}
        />
      </group>
    </group>
  );
};

/** What's outside (and the fittings' state) at a moment, by era: the seasons cycling through the
 * time-lapses, the 2009 storm, Christmas Eve 2025. */
export const outsideAt = (t: number, era: string): Outside => {
  if (era === "2025") return { snow: 0.75, lights: 1, windowSnow: 0.7 };
  if (era === "2009") return { rain: 1, overflow: 1, wet: 1, windowRain: 1 };
  if (era === "2004a") return { leaves: 70 };
  // the time-lapses: a season every two nights (leaves, snow, rain, summer)
  const lapse = (t >= 8 && t < 10.4) || (t >= 13.9 && t < 15) || (t >= 36 && t < 47.5);
  if (lapse) {
    const s = Math.floor(((t - 8) * 3) / 2) % 4;
    return s === 0 ? { leaves: 60 } : s === 1 ? { snow: 0.6, windowSnow: 0.4 } : s === 2 ? { rain: 0.8, wet: 0.8, windowRain: 0.6 } : {};
  }
  if (era === "2007") return { leaves: 30 };
  return {};
};
