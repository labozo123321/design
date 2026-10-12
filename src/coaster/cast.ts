import { ADULT_F, ADULT_M, KID, type Shape } from "./face/sculpt";
import type { Person } from "./face/Head";

/**
 * Who rides. Your little sister (seven, auburn pigtails, freckles, a missing front tooth, chewing gum)
 * sits on your right in the front row; you are her big brother. Everyone else is cast for variety.
 */

const teen = (s: Shape): Shape => ({ ...s, jaw: 0.45, cheek: 0.45, brow: 0.7, h: s.h * 0.98 });

export const SISTER: Person = {
  name: "sister",
  shape: KID,
  skin: { tone: "#F1C6A8", blush: 1.0, freckles: 1.0, lip: "#D98A80", seed: 7, browTint: "#9A5A3A" },
  iris: "#6E7F3C",
  hair: { style: "pigtails", color: "#7B3A1D", bangs: true, tie: "#FF4FA3" },
  brow: "#8A4A28",
  lashes: 0.9,
  gap: true,
};

export const YOU: Person = {
  name: "you",
  shape: teen(ADULT_M),
  skin: { tone: "#EBBE9C", blush: 0.5, freckles: 0.35, lip: "#C9857A", seed: 3, browTint: "#7A4A30" },
  iris: "#6E7F3C",
  hair: { style: "short", color: "#6E351C" },
  brow: "#5A2C16",
  lashes: 0.3,
};

export const ADULT_MALE = ADULT_M;
export const ADULT_FEMALE = ADULT_F;
