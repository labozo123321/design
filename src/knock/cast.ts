import { ADULT_F, ADULT_M, KID, type Shape } from "../coaster/face/sculpt";
import type { Person } from "../coaster/face/Head";
import type { Outfit } from "../wedding/Figure";
import type { Cut } from "../looks/Hair";

/**
 * Who lives either side of the wall. Nora (three years older, fair, a band of freckles over her nose, hazel
 * eyes, chestnut hair, the same yellow plastic clip at her crown at every age) and you (warm light-brown
 * skin, dark brown eyes, thick dark brows, dark brown hair with a cowlick at the crown that never lies
 * down). Each at the ages the film needs, so the swaps can hide inside the time-lapse's night flashes. And
 * Mom (Ellen), once, on her treadmill.
 */

/** In bed (and padding down the hall) nobody wears shoes: the "shoe" is a bare foot. */
export const BAREFOOT = "#E2B496";

export type Sib = {
  key: string;
  who: Person;
  outfit: Outfit;
  /** body scale (1 = an adult man) */
  k: number;
  cut?: Cut;
  cutColor?: string;
  /** Nora's yellow clip at the crown */
  clip?: boolean;
  /** your cowlick */
  cowlick?: boolean;
  glasses?: "round" | "rect";
  glassesColor?: string;
  /** a short beard (you at 27) */
  beard?: boolean;
  /** braces (you at 13) */
  braces?: boolean;
  age: number;
};

const PORTRAIT = { earK: 1.6, lipK: 1.1, eyeOpen: 0.06, muzzle: 0.55, portrait: true };
/** A face between a child's and a teenager's: k = 0 a young child, 1 a mid teen. */
const grow = (k: number, girl: boolean): Shape => {
  const a = KID;
  const b: Shape = girl
    ? { ...ADULT_F, w: 0.071, h: 0.108, chinY: -0.099, cheek: 0.55, lipFull: 1.15, noseLen: 0.78, jaw: 0.25 }
    : { ...ADULT_M, w: 0.074, h: 0.113, chinY: -0.105, cheek: 0.35, noseLen: 0.88, jaw: 0.5, brow: 0.65, jawSq: 0.3 };
  const m = (p: number, q: number) => p + (q - p) * k;
  return {
    ...b,
    w: m(a.w, b.w),
    h: m(a.h, b.h),
    d: m(a.d, b.d),
    eyeY: m(a.eyeY, b.eyeY),
    eyeX: m(a.eyeX, b.eyeX),
    eyeR: m(a.eyeR, b.eyeR),
    noseY: m(a.noseY, b.noseY),
    noseLen: m(a.noseLen, b.noseLen),
    noseW: m(a.noseW, b.noseW),
    mouthY: m(a.mouthY, b.mouthY),
    mouthW: m(a.mouthW, b.mouthW),
    lipFull: m(a.lipFull, b.lipFull),
    chinY: m(a.chinY, b.chinY),
    jaw: m(a.jaw, b.jaw),
    cheek: m(a.cheek, b.cheek),
    brow: m(a.brow, b.brow),
    kid: k < 0.5,
    ...PORTRAIT,
  };
};

// ------------------------------------------------------------------------------------------------ Nora
const NORA_SKIN = { tone: "#F3D3BF", blush: 0.75, freckles: 1.0, lip: "#D08A82", browTint: "#7A4A2C" };
const NORA_HAIR = "#6B3E22";
const nora = (age: number, k: number, face: number, cut: Cut | undefined, style: Person["hair"]["style"], outfit: Outfit, extra: Partial<Sib> = {}): Sib => ({
  key: `nora${age}`,
  age,
  who: {
    name: `nora${age}`,
    shape: age >= 30 ? { ...ADULT_F, cheek: 0.5, ...PORTRAIT, lipK: 1.12 } : grow(face, true),
    skin: { ...NORA_SKIN, seed: 61, age: age >= 30 ? 0.08 : 0 },
    iris: "#7A6B3A",
    hair: { style, color: NORA_HAIR, bangs: age < 12, tie: "#F2C230" },
    brow: "#6A3E24",
    lashes: 0.8,
  },
  outfit,
  k,
  cut,
  cutColor: NORA_HAIR,
  clip: true,
  ...extra,
});
export const NORA: Record<number, Sib> = {
  9: nora(9, 0.76, 0.15, undefined, "pigtails", { kind: "tee", main: "#8A63C2", trousers: "#8A63C2", sleeves: "long", shoe: BAREFOOT, collar: "crew", bust: true }),
  11: nora(11, 0.82, 0.35, "pony", "base", { kind: "tee", main: "#C0577A", trousers: "#5A4A7A", sleeves: "short", shoe: BAREFOOT, collar: "crew", bust: true }),
  13: nora(13, 0.88, 0.6, "pony", "base", { kind: "tee", main: "#6F8F5A", trousers: "#4A4A5A", sleeves: "short", shoe: BAREFOOT, collar: "crew", bust: true }),
  14: nora(14, 0.9, 0.7, "pony", "base", { kind: "tee", main: "#5E8A55", trousers: "#3E4048", sleeves: "short", shoe: BAREFOOT, collar: "crew", bust: true }),
  16: nora(16, 0.93, 0.9, "flow", "long", { kind: "hoodie", main: "#B9A2D6", trousers: "#3A3D4A", sleeves: "long", shoe: BAREFOOT, collar: "hood", bust: true }),
  18: nora(18, 0.95, 1.0, "bun", "base", { kind: "tee", main: "#8C9096", trousers: "#2E3038", sleeves: "short", shoe: BAREFOOT, collar: "crew", bust: true }),
  30: nora(30, 0.95, 1.0, "bun", "base", { kind: "sweater", main: "#EFE6D2", shirt: "#EFE6D2", trousers: "#3A3A44", sleeves: "long", shoe: "#2A2622", collar: "crew", bust: true }, {
    glasses: "round",
    glassesColor: "#5A3A22",
  }),
};

// ------------------------------------------------------------------------------------------------- you
const YOU_SKIN = { tone: "#D9A47E", blush: 0.45, freckles: 0, lip: "#B87868", browTint: "#2A1A12" };
const YOU_HAIR = "#2E1E14";
const you = (age: number, k: number, face: number, cut: Cut | undefined, style: Person["hair"]["style"], outfit: Outfit, extra: Partial<Sib> = {}): Sib => ({
  key: `you${age}`,
  age,
  who: {
    name: `you${age}`,
    shape: age >= 27 ? { ...ADULT_M, cheek: 0.4, jaw: 0.8, jawSq: 0.6, ...PORTRAIT, earK: 1.8 } : grow(face, false),
    skin: { ...YOU_SKIN, seed: 62 },
    iris: "#3A2416",
    hair: { style, color: YOU_HAIR },
    brow: "#22140C",
    lashes: 0.45,
    gap: age <= 7,
    braces: age === 13,
    stubble: age >= 27 ? 1.0 : 0,
  },
  outfit,
  k,
  cut,
  cutColor: YOU_HAIR,
  cowlick: true,
  ...extra,
});
export const YOU: Record<number, Sib> = {
  6: you(6, 0.66, 0.0, undefined, "buzz", { kind: "tee", main: "#4E8A4A", trousers: "#4E8A4A", sleeves: "long", shoe: BAREFOOT, collar: "crew", bust: true }),
  9: you(9, 0.76, 0.2, "mushroom", "base", { kind: "tee", main: "#2F6FB0", trousers: "#2A3550", sleeves: "short", shoe: BAREFOOT, collar: "crew", bust: true }),
  10: you(10, 0.79, 0.28, "mushroom", "base", { kind: "tee", main: "#2F6FB0", trousers: "#2A3550", sleeves: "short", shoe: BAREFOOT, collar: "crew", bust: true }),
  11: you(11, 0.82, 0.36, "mushroom", "base", { kind: "shirt", pattern: "stripes", main: "#C8463E", trousers: "#2A3550", sleeves: "short", shoe: BAREFOOT, collar: "crew", bust: true }),
  13: you(13, 0.9, 0.6, "curtain", "base", { kind: "hoodie", main: "#8C9096", trousers: "#2A2E36", sleeves: "long", shoe: BAREFOOT, collar: "hood", bust: true }, { braces: true }),
  15: you(15, 0.97, 0.85, "flow", "base", { kind: "tee", main: "#1E1F24", trousers: "#2A2E36", sleeves: "short", shoe: BAREFOOT, collar: "crew", bust: true }),
  16: you(16, 0.99, 0.95, "flow", "base", { kind: "tee", main: "#2C3440", trousers: "#2A2E36", sleeves: "short", shoe: BAREFOOT, collar: "crew", bust: true }),
  27: you(27, 1.0, 1.0, "short", "base", { kind: "sweater", main: "#9A9DA2", shirt: "#9A9DA2", trousers: "#2E3440", sleeves: "long", shoe: "#2A2622", collar: "crew", bust: true }, { beard: true }),
};

// ------------------------------------------------------------------------------------------------- mom
export const MOM: Sib = {
  key: "mom",
  age: 52,
  who: {
    name: "mom",
    shape: { ...ADULT_F, cheek: 0.6, ...PORTRAIT, lipK: 1.12 },
    skin: { tone: "#EDC3A8", blush: 1.0, freckles: 0.2, lip: "#C07A72", seed: 64, browTint: "#6A4A34", age: 0.45 },
    iris: "#5A6E7A",
    hair: { style: "base", color: "#8A4A2A" },
    brow: "#6A4A34",
    lashes: 0.7,
  },
  outfit: { kind: "tee", main: "#E9785E", trousers: "#1F2A44", sleeves: "short", shoe: "#F6F6F6", collar: "crew", bust: true },
  k: 0.95,
  cut: "curtain",
  cutColor: "#8A4A2A",
  glasses: "round",
  glassesColor: "#3A2A22",
};

/** Ages by video time, for each sibling (the swaps hide in the time-lapse flashes). */
export const ages = { NORA, YOU };
