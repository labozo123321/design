import React from "react";
import * as THREE from "three";
import { Figure, type Pose } from "../wedding/Figure";
import { EyeGlow, Glasses, Gum, Moustache } from "./Accessories";
import { CardHair } from "./Hair";
import type { Kid } from "./cast";

/**
 * A cast member in the world: the body and face (the wedding's Figure with the coaster's heads) and their
 * extras in head space: glasses, the flow, the comb-over, the moustache, gum, the edit's glowing eyes.
 */

export type Extras = {
  /** the flow: wind (0..1) and how far it's flipped over the face (0..1) */
  wind?: number;
  flip?: number;
  /** the comb-over's lift (radians) */
  lift?: number;
  /** a wad of gum in the mouth */
  gum?: boolean;
  /** glowing eyes (the edit) */
  glow?: number;
  /** sunglasses on (else in his hand, or gone) */
  sunglasses?: boolean;
  /** hide the glasses (the photographer pushing them up, etc.) */
  noGlasses?: boolean;
};

export const SEAT_LIFT = 0.16; // the posing stool is higher than a chair (hips 0.72)

export const KidFigure: React.FC<{ kid: Kid; pose: Pose; at: THREE.Vector3; yaw: number; t: number; extras?: Extras; hi?: boolean; children?: React.ReactNode; head?: React.ReactNode }> = ({
  kid,
  pose,
  at,
  yaw,
  t,
  extras = {},
  hi = true,
  children,
  head: headMore,
}) => {
  const sh = kid.who.shape;
  const head = (
    <>
      {kid.glasses && !extras.noGlasses ? <Glasses sh={sh} kind={kid.glasses} color={kid.glassesColor ?? "#222"} /> : null}
      {extras.sunglasses ? <Glasses sh={sh} kind="sun" color="#141416" /> : null}
      {kid.cut ? <CardHair sh={sh} cut={kid.cut} color={kid.cutColor ?? kid.who.hair.color} params={{ wind: extras.wind, flip: extras.flip, lift: extras.lift, t }} /> : null}
      {kid.moustache ? <Moustache sh={sh} color={kid.moustache} /> : null}
      {extras.gum ? <Gum sh={sh} jaw={pose.e?.jaw ?? 0} /> : null}
      <EyeGlow sh={sh} k={extras.glow ?? 0} />
      {headMore}
    </>
  );
  return (
    <Figure who={kid.who} outfit={kid.outfit} k={kid.k} pose={pose} at={at} yaw={yaw} t={t} hi={hi} headExtra={head}>
      {children}
    </Figure>
  );
};
