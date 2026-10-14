import { ADULT_F, ADULT_M, type Shape } from "../coaster/face/sculpt";
import type { Person } from "../coaster/face/Head";
import type { Outfit } from "../wedding/Figure";
import type { Cut } from "./Hair";

/**
 * Picture day's cast: six boys who found looksmaxing (the mewer, hunter eyes, the gum chewer, glass skin,
 * the height-maxer and the mogger), the one normal kid, the photographer (the camera is his), the mogger's
 * friend with the leaf blower, the teacher with the clipboard, and the kids waiting in line.
 */

/** Sixteen: an adult's skull, a softer jaw, a little less brow. */
const TEEN: Shape = {
  ...ADULT_M,
  w: 0.074,
  h: 0.114,
  d: 0.097,
  noseLen: 0.88,
  noseW: 0.95,
  mouthY: -0.068,
  mouthW: 0.048,
  lipFull: 1.0,
  chinY: -0.106,
  jaw: 0.5,
  cheek: 0.3,
  brow: 0.65,
  jawSq: 0.35,
  earK: 1.75,
  lipK: 1.1,
  eyeOpen: 0.06,
  muzzle: 0.5,
  portrait: true,
};
const FACE_F = { earK: 1.6, lipK: 1.15, eyeOpen: 0.07, muzzle: 0.5, portrait: true };
const FACE_ADULT = { earK: 1.85, lipK: 1.05, eyeOpen: 0.03, muzzle: 0.7, portrait: true };

export type Kid = {
  key: string;
  who: Person;
  outfit: Outfit;
  /** body scale (1 = an adult man) */
  k: number;
  /** extras in head space */
  glasses?: "round" | "rect" | "sun";
  glassesColor?: string;
  /** the haircut (cards over the head's own hair cap) and its colour */
  cut?: Cut;
  cutColor?: string;
  moustache?: string;
};

export const MEWER: Kid = {
  key: "mewer",
  who: {
    name: "mewer",
    shape: { ...TEEN, jaw: 0.3, chinY: -0.103, cheek: 0.5 },
    skin: { tone: "#B57E57", blush: 0.35, freckles: 0, lip: "#8E5446", seed: 41, browTint: "#140D0A" },
    iris: "#2E1C12",
    hair: { style: "fade", color: "#17110D" },
    brow: "#100B09",
    lashes: 0.55,
    stubble: 0.12,
  },
  outfit: { kind: "polo", main: "#1F3358", trousers: "#2A2E36", sleeves: "short", shoe: "#E8E8E8", bust: true, collar: "polo" },
  k: 0.97,
  cut: "crop",
  cutColor: "#1C1511",
};

export const HUNTER: Kid = {
  key: "hunter",
  who: {
    name: "hunter",
    shape: { ...TEEN, brow: 0.95, noseLen: 0.95, w: 0.073 },
    skin: { tone: "#F3D6C4", blush: 0.85, freckles: 1.0, lip: "#C77C76", seed: 42, browTint: "#A8582E" },
    iris: "#5D8A6E",
    hair: { style: "fade", color: "#B2512A" },
    brow: "#9E4C26",
    lashes: 0.35,
  },
  outfit: { kind: "sweater", main: "#3E6B48", shirt: "#F4F2EC", trousers: "#2E3440", sleeves: "long", shoe: "#2A2018", bust: true, collar: "shirt" },
  k: 0.98,
};

export const GUM: Kid = {
  key: "gum",
  who: {
    name: "gum",
    shape: { ...TEEN, jaw: 0.7, lipFull: 1.35, noseW: 1.12, cheek: 0.38 },
    skin: { tone: "#5F3B27", blush: 0.15, freckles: 0, lip: "#4E2C22", seed: 43, browTint: "#0E0907" },
    iris: "#22140C",
    hair: { style: "fade", color: "#120D0A" },
    brow: "#0E0A08",
    lashes: 0.6,
  },
  outfit: { kind: "shirt", main: "#9CB8D8", pattern: "stripes", trousers: "#22262E", sleeves: "long", shoe: "#F2F2F2", bust: true, collar: "shirt" },
  k: 1.0,
  cut: "twists",
  cutColor: "#1A1310",
};

export const GLASS: Kid = {
  key: "glass",
  who: {
    name: "glass",
    shape: { ...TEEN, noseLen: 0.72, noseW: 0.9, cheek: 0.36, brow: 0.45, jaw: 0.4 },
    skin: { tone: "#EEC9A7", blush: 0.55, freckles: 0, lip: "#C98275", seed: 44, browTint: "#120D0A" },
    iris: "#2A1A10",
    hair: { style: "base", color: "#0C0908" },
    brow: "#0F0B09",
    lashes: 0.5,
    gloss: 1,
  },
  outfit: { kind: "shirt", main: "#FAFAF8", trousers: "#1C1E24", sleeves: "long", shoe: "#111111", bust: true, collar: "shirt" },
  k: 0.96,
  cut: "curtain",
  cutColor: "#16110F",
};

export const HEIGHT: Kid = {
  key: "height",
  who: {
    name: "height",
    shape: { ...TEEN, w: 0.072, h: 0.108, chinY: -0.098, cheek: 0.6, jaw: 0.25, noseLen: 0.76, brow: 0.4, jawSq: 0.1 },
    skin: { tone: "#F1CAA9", blush: 0.8, freckles: 0.3, lip: "#C9817A", seed: 45, browTint: "#5A3A22" },
    iris: "#6B5B3A",
    hair: { style: "base", color: "#3E2614" },
    brow: "#4E301C",
    lashes: 0.6,
  },
  outfit: { kind: "suit", main: "#4A4E58", shirt: "#FFFFFF", accent: "#B8323A", tie: "tie", trousers: "#3A3E48", shoe: "#16110D", bust: true, collar: "shirt" },
  k: 0.86,
  cut: "mushroom",
  cutColor: "#6A4426",
};

export const MOGGER: Kid = {
  key: "mogger",
  who: {
    name: "mogger",
    shape: { ...TEEN, w: 0.077, h: 0.117, jaw: 1.0, chinY: -0.112, brow: 1.0, cheek: 0.28, noseLen: 0.95, lipFull: 0.95, jawSq: 1.0 },
    skin: { tone: "#DDA67E", blush: 0.35, freckles: 0, lip: "#B27466", seed: 46, browTint: "#6A4A26" },
    iris: "#7FA3BF",
    hair: { style: "base", color: "#5E4322" },
    brow: "#6A4A26",
    lashes: 0.5,
    stubble: 0.25,
  },
  outfit: { kind: "shirt", main: "#FFFFFF", trousers: "#C8B89A", sleeves: "long", shoe: "#5A3A22", bust: true, collar: "shirt", open: 1, chain: "#D9B45A" },
  k: 1.06,
  cut: "flow",
  cutColor: "#A27A42",
};

export const NORMAL: Kid = {
  key: "normal",
  who: {
    name: "normal",
    shape: { ...ADULT_F, w: 0.07, h: 0.106, chinY: -0.098, cheek: 0.65, lipFull: 1.2, noseLen: 0.75, ...FACE_F },
    skin: { tone: "#C99470", blush: 0.7, freckles: 0.15, lip: "#B06A5E", seed: 47, browTint: "#21150E" },
    iris: "#3A2414",
    hair: { style: "base", color: "#140D09" },
    brow: "#1E140E",
    lashes: 1.0,
    braces: true,
  },
  outfit: { kind: "cardigan", main: "#E6B8C4", shirt: "#FFFFFF", trousers: "#2E3646", sleeves: "long", shoe: "#F2F2F2", bust: true, female: true, collar: "crew" },
  k: 0.9,
  glasses: "round",
  glassesColor: "#2A2A30",
  cut: "pony",
  cutColor: "#22170F",
};

export const PHOTOG: Kid = {
  key: "photog",
  who: {
    name: "photog",
    shape: { ...ADULT_M, cheek: 0.65, jaw: 0.8, h: ADULT_M.h * 1.01, w: ADULT_M.w * 1.03, brow: 1.1, jawSq: 0.6, ...FACE_ADULT },
    skin: { tone: "#E6B595", blush: 0.85, freckles: 0.1, lip: "#B07468", seed: 48, browTint: "#6E5E50" },
    iris: "#5B7BA0",
    hair: { style: "combover", color: "#5E5044" },
    brow: "#5E4E40",
    lashes: 0.25,
    stubble: 0.2,
  },
  outfit: { kind: "vest", main: "#B7A47E", shirt: "#7A8FB0", pattern: "plaid", trousers: "#5A5246", sleeves: "long", shoe: "#3A2A1E", bust: true, collar: "shirt" },
  k: 1.0,
  glasses: "rect",
  glassesColor: "#3A3026",
  cut: "combover",
  cutColor: "#74644F",
  moustache: "#6A5848",
};

export const FRIEND: Kid = {
  key: "friend",
  who: {
    name: "friend",
    shape: { ...TEEN, cheek: 0.5 },
    skin: { tone: "#C99068", blush: 0.4, freckles: 0, lip: "#9E6456", seed: 49, browTint: "#1A120C" },
    iris: "#3A2414",
    hair: { style: "fade", color: "#1A120C" },
    brow: "#1A120C",
    lashes: 0.45,
  },
  outfit: { kind: "hoodie", main: "#C24A2A", trousers: "#2A2E38", sleeves: "long", shoe: "#F2F2F2", bust: true, collar: "hood" },
  k: 0.98,
  cut: "short",
  cutColor: "#22180F",
};

export const TEACHER: Kid = {
  key: "teacher",
  who: {
    name: "teacher",
    shape: { ...ADULT_F, cheek: 0.6, ...FACE_ADULT, lipK: 1.15 },
    skin: { tone: "#EBC2A4", blush: 0.6, freckles: 0.1, lip: "#B06A6A", seed: 50, browTint: "#4A3628" },
    iris: "#4A5A3A",
    hair: { style: "base", color: "#4A3426" },
    brow: "#4A3628",
    lashes: 0.8,
  },
  outfit: { kind: "cardigan", main: "#5E7A6A", shirt: "#F2EEE6", trousers: "#3A3A40", sleeves: "long", shoe: "#2A2018", bust: true, female: true },
  k: 0.95,
  glasses: "rect",
  glassesColor: "#7A2E2E",
  cut: "bun",
  cutColor: "#5E4434",
};

/** The kids in line along the wall, waiting their turn. */
const SKIN = ["#F2D0B4", "#E2AF8C", "#C68D66", "#8E5A3C", "#5E3A26", "#EBC7A8"];
const HAIR = ["#1A120C", "#5A3820", "#2A1C12", "#8A6230", "#0E0A08", "#B2512A"];
const TOPS = ["#2E4E7A", "#7A2E3A", "#E8E4DA", "#3E6B48", "#C9A04A", "#4A4E58", "#9CB8D8"];
export const LINE: Kid[] = Array.from({ length: 6 }, (_, i) => {
  const r = (k: number) => {
    const s = Math.sin((i + 1) * 127.1 + k * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const girl = i % 3 === 1;
  return {
    key: `line${i}`,
    who: {
      name: `line${i}`,
      shape: girl ? { ...ADULT_F, w: 0.071, chinY: -0.1, cheek: 0.6, ...FACE_F } : { ...TEEN, jaw: 0.3 + 0.5 * r(1), cheek: 0.35 + 0.3 * r(2) },
      skin: { tone: SKIN[Math.floor(r(3) * SKIN.length)], blush: 0.5, freckles: r(4) < 0.3 ? 0.5 : 0, lip: "#A86A5C", seed: 60 + i, browTint: "#2A1C12" },
      iris: "#3A2414",
      hair: { style: girl ? (r(5) < 0.5 ? "pony" : "long") : r(5) < 0.5 ? "short" : "curly", color: HAIR[Math.floor(r(6) * HAIR.length)] },
      brow: "#2A1C12",
      lashes: girl ? 0.9 : 0.4,
    },
    outfit: girl
      ? { kind: "cardigan", main: TOPS[Math.floor(r(7) * TOPS.length)], shirt: "#FFFFFF", trousers: "#2E3646", sleeves: "long", shoe: "#F2F2F2", bust: true, female: true }
      : { kind: r(8) < 0.5 ? "polo" : "hoodie", main: TOPS[Math.floor(r(7) * TOPS.length)], trousers: "#2A2E38", sleeves: r(8) < 0.5 ? "short" : "long", shoe: "#E8E8E8", bust: true, collar: r(8) < 0.5 ? "polo" : "hood" },
    k: 0.92 + 0.1 * r(9),
  };
});

export const KIDS_IN_ORDER = [MEWER, HUNTER, GUM, GLASS, NORMAL, HEIGHT, MOGGER];
