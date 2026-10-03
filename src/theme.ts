/** The only place the product name lives. Shown on the title card and nowhere else. */
export const APP_NAME = "[APP NAME]";

export const COLORS = {
  // Horror acts
  black: "#000000",
  noir: "#0A0A0A",
  bone: "#EDE6DA",
  blood: "#8B0E12",
  /** Lit LED segments: blood red pushed just far enough to read as light. */
  led: "#B5161C",
  ledGhost: "#1C0606",
  // The turn
  emerald: "#1F8A5B",
  emeraldDeep: "#15603F",
  gold: "#C8A15A",
  goldLight: "#E4CB92",
  goldDeep: "#8F6E35",
  // UI surfaces
  navy: "#0B1426",
  navyDeep: "#070D1A",
  navySurface: "#13213C",
  offWhite: "#F3F0E9",
  paper: "#FBFAF6",
  ink: "#0E1A2E",
  inkSoft: "rgba(14, 26, 46, 0.55)",
  // Chromatic aberration fringes (technical artefact, never used as a brand colour)
  fringeRed: "#D7262E",
  fringeCyan: "#1FB6CC",
} as const;

/**
 * Platform safe zones. Text must live inside: 90px from every edge, plus the
 * bottom 300px (captions, CTA) and right 140px (like/comment rail) kept clear.
 */
export const SAFE = { top: 90, left: 90, right: 140, bottom: 300 } as const;

/** Symmetric text column so centred copy is centred on the frame AND safe. */
export const TEXT_COLUMN = { left: 140, right: 140 } as const;

/** Optical centre for hero copy: a little above frame centre, clear of the UI zone. */
export const FOCUS_Y = 860;
