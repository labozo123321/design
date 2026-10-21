import * as THREE from "three";

/**
 * The house slice, in metres. The upstairs floor is y = 0. x runs across the frame: Nora's room is on the
 * left (x < 0), yours on the right (x > 0), and the shared wall is centred on x = 0. z runs up the frame:
 * the front wall (with the windows, over the porch roof) is at the bottom of the picture near z = 0, and the
 * back wall (headboards, doors, the hallway beyond it) is at the top near z = -3.6.
 *
 * The camera always sits on the wall's centre plane (x = 0), above the house, tilted 18 degrees from straight
 * down toward the back wall, on a long lens (fov 30). It only rises, lowers or slides along the wall line.
 */

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---- walls
/** The shared wall: two 5/8" drywall skins over 2x4 studs, 12 cm thick, cut low (just over the beds) so
 * the overhead camera sees both pillows right up against it. */
export const WALL = {
  half: 0.06,
  skin: 0.016,
  cut: 1.1,
  /** the studs (centres along z, 40 cm apart) and their size (z by x) */
  studs: [-0.04, -0.44, -0.84, -1.24, -1.64, -2.04, -2.44, -2.84, -3.24, -3.56],
  studW: 0.038,
  studD: 0.089,
  /** the bottom and top plates are cut away at the top; the bottom plate lies on the floor */
  plateH: 0.038,
};
/** Room extents (inside faces). */
export const ROOM = {
  front: 0,
  back: -3.6,
  outer: 2.46,
  /** the other walls are cut at 2.1 m */
  cut: 2.1,
  wallT: 0.15,
  ceiling: 2.5,
};
/** Doors in the back wall (x ranges, mirrored for your room) and the hallway behind it. */
export const DOOR = { x0: 1.12, x1: 1.92, h: 2.03 };
export const HALL = { z0: -3.6 - ROOM.wallT, z1: -3.6 - ROOM.wallT - 1.1, banister: true };
/** Windows in the front wall: two per room (centre x, mirrored), width, sill and head heights. */
export const WINDOWS = { xs: [0.78, 1.82], w: 0.74, sill: 0.82, head: 1.98 };
/** The porch roof outside the front wall: from the wall (y high) down to the gutter. */
export const PORCH = { z0: ROOM.wallT, z1: ROOM.wallT + 1.7, yWall: 0.55, yEdge: -0.05 };

// ---- beds (mirrored: side -1 is Nora's, +1 is yours)
export const BED = {
  /** long side flush against the shared wall, headboard on the back wall */
  w: 0.95,
  len: 1.95,
  /** the mattress top */
  top: 0.5,
  frameH: 0.3,
  headboardH: 0.95,
};
/** A bed's mattress centre for a side. */
export const bedCentre = (side: -1 | 1) => V3(side * (WALL.half + BED.w / 2), BED.top, ROOM.back + BED.len / 2);
/** The pillow: across the head of the bed, its centre, its size. */
export const PILLOW = { z: ROOM.back + 0.3, w: 0.62, d: 0.4, h: 0.13 };
/** Where a head rests: on its back, nearer the wall; on its side facing the wall, closer still. */
export const headOnBack = (side: -1 | 1) => V3(side * 0.24, BED.top + PILLOW.h * 0.55 + 0.07, PILLOW.z + 0.02);
export const headFacingWall = (side: -1 | 1) => V3(side * 0.17, BED.top + PILLOW.h * 0.5 + 0.08, PILLOW.z + 0.03);
/** Where knuckles meet the wall for a side (on its face, at pillow height). */
export const knockPoint = (side: -1 | 1, dz = 0) => V3(side * WALL.half, BED.top + 0.2, PILLOW.z + 0.2 + dz);

// ---- things on the shared wall
/** Nora's outlet (the nightlight's, with the crooked cover) and your shelf above your pillow. */
export const OUTLET = V3(-WALL.half, BED.top + 0.08, PILLOW.z + 0.32);
export const SHELF = { at: V3(WALL.half, 0.98, ROOM.back + 0.28), w: 0.22, d: 0.16 };
/** The cavity slot the note falls into: between the two studs either side of the outlet. */
export const SLOT = { z0: -3.24 + 0.019, z1: -2.84 - 0.019 };

/** Mom's treadmill in Nora's emptied room (2014 on): along the room, facing the front window (its console
 * there), the belt's top 18 cm up; 1.79 m long, so it runs from just inside the front wall to z -1.85. */
export const TREAD = { x: -1.25, deck: 0.1825, z0: -1.845, z1: -0.055, console: V3(-1.25, 1.25, -0.2) };
/** Where the treadmill stands by era (the prop's origin, the floor at the centre of its footprint, and its
 * yaw: the prop faces -z, so turned half round its console is toward the window); by 2025 it is a laundry
 * rack turned sideways under the front windows, so the air mattress and the rug have the floor. */
export const treadPlace = (era: string) =>
  // (2025: its console toward the shared wall, so the shirts hanging off its far grip stay clear of the window)
  era === "2025" ? { at: V3(-1.5, 0, -0.5), rotY: -Math.PI / 2 } : { at: V3(TREAD.x, 0, (TREAD.z0 + TREAD.z1) / 2), rotY: Math.PI };

// ---- camera presets: the target on the wall line, the distance along the 18-degree view, the fov
export const TILT = THREE.MathUtils.degToRad(18);
export const FOV = 30;
export type Preset = { target: THREE.Vector3; dist: number; fov?: number };
/** Width of the frame (m) at the target for a distance (fov 30, 9:16). */
export const widthAt = (dist: number, fov = FOV) => 2 * dist * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (9 / 16);
export const PRESETS: Record<string, Preset> = {
  // the whole slice: hallway at the top, both beds, the front windows and porch roof at the bottom
  wide: { target: V3(0, 0.55, -1.75), dist: 11.9 },
  // both pillows, the nightlight and the shelf
  medium: { target: V3(0, 0.6, -3.0), dist: 5.0 },
  // two faces nose to nose across the wall
  two: { target: V3(0, 0.66, -3.28), dist: 2.66 },
};
/** The camera for a preset (position and orientation looking at the target, up the frame = -z). */
export const cameraFor = (p: Preset) => {
  const dir = V3(0, Math.cos(TILT), Math.sin(TILT));
  const pos = p.target.clone().addScaledVector(dir, p.dist);
  const m = new THREE.Matrix4().lookAt(pos, p.target, V3(0, 0, -1));
  const quat = new THREE.Quaternion().setFromRotationMatrix(m);
  return { pos, quat, fov: p.fov ?? FOV };
};
