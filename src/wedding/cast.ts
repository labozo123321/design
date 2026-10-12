import { ADULT_F, ADULT_M, KID, type Shape } from "../coaster/face/sculpt";
import type { HairStyle, Person } from "../coaster/face/Head";
import { L, hash } from "./flight";
import type { Outfit } from "./Figure";

/**
 * Who's at the wedding: the couple, the officiant, the ring bearer (nine, flying the drone), the bride's
 * grandmother, the lady in the big hat, the staff (a waiter crossing the lawn, the DJ, the waitress
 * building the champagne tower, the baker), and the guests in the chairs, cast for variety.
 */

const older = (s: Shape): Shape => ({ ...s, cheek: (s.cheek ?? 0.4) + 0.15, jaw: (s.jaw ?? 0.5) + 0.1, h: s.h * 1.01 });
const young = (s: Shape): Shape => ({ ...s, cheek: (s.cheek ?? 0.4) - 0.05 });

export const BRIDE: Person = {
  name: "bride",
  shape: young(ADULT_F),
  skin: { tone: "#F1CBAE", blush: 0.8, freckles: 0.25, lip: "#C26468", seed: 21, browTint: "#5A3420" },
  iris: "#56743F",
  hair: { style: "bun", color: "#6A3B20" },
  brow: "#4C2A16",
  lashes: 1.0,
};
export const GROOM: Person = {
  name: "groom",
  shape: { ...ADULT_M, jaw: 0.85 },
  skin: { tone: "#E1B08A", blush: 0.45, freckles: 0, lip: "#B87A6C", seed: 22, browTint: "#2A1A10" },
  iris: "#4A3626",
  hair: { style: "short", color: "#2A1C12" },
  brow: "#22160E",
  lashes: 0.35,
  stubble: 0.45,
};
export const OFFICIANT: Person = {
  name: "officiant",
  shape: older({ ...ADULT_M, brow: 1.2 }),
  skin: { tone: "#C99068", blush: 0.5, freckles: 0.1, lip: "#A86A5C", seed: 23, browTint: "#9A948E" },
  iris: "#3E4A56",
  hair: { style: "buzz", color: "#A8A39C" },
  brow: "#B0AAA2",
  lashes: 0.2,
  stubble: 0.15,
};
export const KID_P: Person = {
  name: "kid",
  shape: KID,
  skin: { tone: "#EBBB98", blush: 0.9, freckles: 0.7, lip: "#CF8478", seed: 24, browTint: "#6A4428" },
  iris: "#3E62A0",
  hair: { style: "short", color: "#4A2E18", bangs: true },
  brow: "#4A2E18",
  lashes: 0.6,
  gap: true,
};
export const GRANDMA: Person = {
  name: "grandma",
  shape: older(older(ADULT_F)),
  skin: { tone: "#EDC5A6", blush: 0.7, freckles: 0.15, lip: "#B06A6E", seed: 25, browTint: "#B8B2AA" },
  iris: "#6A7C8C",
  hair: { style: "curly", color: "#E2DED8" },
  brow: "#C8C2BA",
  lashes: 0.5,
};
export const HATLADY: Person = {
  name: "hatlady",
  shape: ADULT_F,
  skin: { tone: "#8E5C3C", blush: 0.3, freckles: 0, lip: "#7A3E38", seed: 26, browTint: "#1A1210" },
  iris: "#3A2416",
  hair: { style: "bun", color: "#1A1210" },
  brow: "#140E0C",
  lashes: 1.0,
};
export const WAITER: Person = {
  name: "waiter",
  shape: young(ADULT_M),
  skin: { tone: "#D8A47C", blush: 0.4, freckles: 0, lip: "#B07A6C", seed: 27, browTint: "#1A1410" },
  iris: "#3A2A1A",
  hair: { style: "short", color: "#16110D" },
  brow: "#16110D",
  lashes: 0.35,
};
export const DJ_P: Person = {
  name: "dj",
  shape: { ...ADULT_M, cheek: 0.45 },
  skin: { tone: "#6E4730", blush: 0.2, freckles: 0, lip: "#5E3428", seed: 28, browTint: "#120C0A" },
  iris: "#2A1A10",
  hair: { style: "buzz", color: "#120C0A" },
  brow: "#120C0A",
  lashes: 0.35,
  stubble: 0.6,
};
export const POURER: Person = {
  name: "pourer",
  shape: young(ADULT_F),
  skin: { tone: "#E6B48E", blush: 0.6, freckles: 0.3, lip: "#B8706C", seed: 29, browTint: "#3A2818" },
  iris: "#5A4A30",
  hair: { style: "pony", color: "#3A2414" },
  brow: "#2E1C10",
  lashes: 0.9,
};
export const BAKER: Person = {
  name: "baker",
  shape: older({ ...ADULT_M, cheek: 0.7, w: ADULT_M.w * 1.04 }),
  skin: { tone: "#E8B494", blush: 0.9, freckles: 0.05, lip: "#B0706A", seed: 30, browTint: "#4A3A2E" },
  iris: "#4A5A3A",
  hair: { style: "short", color: "#5A4636" },
  brow: "#4A3A2E",
  lashes: 0.3,
  stubble: 0.3,
};

export const OUTFITS: Record<string, Outfit> = {
  bride: { kind: "gown", main: "#FBF8F2", neckline: "sweetheart", sleeves: "none", hem: 0, shoe: "#F2EEE6", heels: true, accent: "#EADCC8" },
  groom: { kind: "suit", main: "#1F2C46", shirt: "#FFFFFF", accent: "#C9B8A0", tie: "bow", shoe: "#1A120C", pocket: "#FFFFFF", boutonniere: true },
  officiant: { kind: "suit", main: "#2A2A2E", shirt: "#FFFFFF", accent: "#7A1E2A", tie: "tie", shoe: "#111111" },
  kid: { kind: "kidsuit", main: "#4E5868", trousers: "#2E3644", shirt: "#FFFFFF", accent: "#1F2C46", tie: "bow", shoe: "#2A1A10", pocket: "#FFFFFF" },
  grandma: { kind: "dress", main: "#9FB4D8", neckline: "round", sleeves: "short", hem: 0.32, flare: 0.3, shoe: "#E8E0D6", accent: "#E8E0D6" },
  hatlady: { kind: "dress", main: "#F27A5E", neckline: "v", sleeves: "none", hem: 0.42, flare: 0.6, shoe: "#E8C890", heels: true, hat: { kind: "wide", color: "#B8D6C2", band: "#FFFFFF" } },
  waiter: { kind: "waiter", main: "#16161A", trousers: "#16161A", shirt: "#FFFFFF", accent: "#111111", tie: "bow", sleeves: "long", shoe: "#0E0E0E" },
  dj: { kind: "tee", main: "#18181C", trousers: "#2A2E3A", sleeves: "short", shoe: "#F2F2F2" },
  pourer: { kind: "waiter", main: "#16161A", trousers: "#16161A", shirt: "#FFFFFF", accent: "#111111", tie: "bow", sleeves: "long", shoe: "#0E0E0E" },
  baker: { kind: "chef", main: "#F6F4EE", trousers: "#2E2E32", sleeves: "long", shoe: "#1A1A1A", hat: { kind: "toque", color: "#FBFBF8" } },
};

/* ------------------------------------------------------------------ */
/* Guests                                                                */
/* ------------------------------------------------------------------ */

const SKIN = ["#F4D2B6", "#EDC3A2", "#E2B08C", "#D49E78", "#BF8762", "#9A6844", "#7A4E32", "#5E3A26"];
const HAIR_DARK = ["#16110D", "#2A1C12", "#3E2716", "#5A3A20", "#7A4E2A", "#9A6A3A", "#C8A060", "#2E2A26"];
const SUITS = ["#1F2C46", "#2E3440", "#4A505A", "#8C8578", "#6A7F9A", "#3A3E48", "#B8AE9A", "#5A4636"];
const TIES = ["#7A1E2A", "#3B4A7A", "#C9A55A", "#2E5A3A", "#9A4A6A", "#4A6A9A", "#B86A3A"];
const DRESSES = ["#9FB4D8", "#A9C2A6", "#E2A8A8", "#B8A4CC", "#E8D6B4", "#F27A5E", "#2E6A5A", "#C85A6A", "#F0C8A0", "#7A9AC8"];

export type Guest = {
  person: Person;
  outfit: Outfit;
  at: [number, number, number];
  row: number;
  side: number;
  seat: number;
  nearest: [number, number];
  /** temperament: how they react */
  phone: boolean;
  laugh: number;
  role: "grandma" | "hatlady" | "guest";
  k: number;
};

export const GUESTS: Guest[] = L.guests.map((g, i) => {
  const r = (k: number) => hash(i * 17.3 + k * 3.7 + 0.5);
  // the bride's grandmother sits front row, right of the aisle; the hat lady in the second row, left
  const role: Guest["role"] = g.row === 0 && g.side === 1 && g.seat === 0 ? "grandma" : g.row === 1 && g.side === -1 && g.seat === 1 ? "hatlady" : "guest";
  if (role === "grandma")
    return { person: GRANDMA, outfit: OUTFITS.grandma, at: g.at, row: g.row, side: g.side, seat: g.seat, nearest: g.nearest, phone: false, laugh: 1, role, k: 0.92 };
  if (role === "hatlady")
    return { person: HATLADY, outfit: OUTFITS.hatlady, at: g.at, row: g.row, side: g.side, seat: g.seat, nearest: g.nearest, phone: false, laugh: 0.3, role, k: 0.95 };
  const woman = r(1) < 0.52;
  const age = r(2);
  const base = woman ? ADULT_F : ADULT_M;
  const shape: Shape = age > 0.75 ? older(base) : age < 0.3 ? young(base) : { ...base };
  shape.w = base.w * (0.96 + r(3) * 0.08);
  shape.h = base.h * (0.97 + r(4) * 0.06);
  const tone = SKIN[Math.floor(r(5) * SKIN.length)];
  const grey = age > 0.78;
  const hairCol = grey ? (r(6) < 0.5 ? "#C8C4BE" : "#8E8A84") : HAIR_DARK[Math.floor(r(7) * HAIR_DARK.length)];
  const styles: HairStyle[] = woman ? ["long", "bun", "pony", "curly", "long"] : ["short", "short", "buzz", "curly"];
  const style = styles[Math.floor(r(8) * styles.length)];
  const person: Person = {
    name: `guest${i}`,
    shape,
    skin: { tone, blush: 0.3 + r(9) * 0.6, freckles: r(10) < 0.25 ? r(11) * 0.6 : 0, lip: woman ? (r(12) < 0.5 ? "#B8606A" : "#A86A60") : "#A87064", seed: 40 + i, browTint: hairCol },
    iris: ["#3A2A1A", "#4A3A26", "#3E62A0", "#56743F", "#6A7C8C"][Math.floor(r(13) * 5)],
    hair: { style, color: hairCol, bangs: woman && r(14) < 0.3 },
    brow: grey ? "#9A9690" : hairCol,
    lashes: woman ? 0.8 + r(15) * 0.2 : 0.3,
    stubble: !woman && r(16) < 0.4 ? 0.3 + r(17) * 0.4 : 0,
  };
  const outfit: Outfit = woman
    ? {
        kind: "dress",
        main: DRESSES[Math.floor(r(18) * DRESSES.length)],
        neckline: (["v", "round", "halter", "sweetheart"] as const)[Math.floor(r(19) * 4)],
        sleeves: r(20) < 0.35 ? "short" : "none",
        hem: 0.3 + r(21) * 0.2,
        flare: r(22),
        shoe: ["#E8C890", "#1A1410", "#C8A890", "#F2EEE6"][Math.floor(r(23) * 4)],
        heels: true,
        hat: r(24) < 0.18 ? { kind: "fascinator", color: DRESSES[Math.floor(r(25) * DRESSES.length)], band: "#FFFFFF" } : undefined,
      }
    : {
        kind: "suit",
        main: SUITS[Math.floor(r(26) * SUITS.length)],
        shirt: r(27) < 0.8 ? "#FFFFFF" : "#DCE6F2",
        accent: TIES[Math.floor(r(28) * TIES.length)],
        tie: r(29) < 0.75 ? "tie" : "bow",
        shoe: r(30) < 0.6 ? "#1A120C" : "#5A3A22",
        pocket: r(31) < 0.5 ? "#FFFFFF" : undefined,
      };
  return { person, outfit, at: g.at, row: g.row, side: g.side, seat: g.seat, nearest: g.nearest, phone: r(32) < 0.28, laugh: r(33), role, k: woman ? 0.95 : 1 };
});
