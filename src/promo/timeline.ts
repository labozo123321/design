/**
 * PROMO TIMELINE · 30 s, 30 fps, 120 BPM → one beat = 15 frames, one bar = 60.
 * Scene lengths ripple like the trailer's; beats are scene-local frames.
 */
export const BEAT = 15;
export const BAR = 60;

export const PROMO_LENGTHS = {
  arcade: 150, //      0 – 150  8-bit intro
  comic: 240, //     150 – 390  comic book · Journey
  scrapbook: 180, // 390 – 570  sticker scrapbook · Jobs
  boss: 150, //      570 – 720  pixel boss fight · log a win
  finale: 180, //    720 – 900  confetti + FourFig
} as const;

export type PromoSceneId = keyof typeof PROMO_LENGTHS;
type Range = { from: number; to: number; duration: number };

export const P = (() => {
  const out = {} as Record<PromoSceneId, Range>;
  let c = 0;
  for (const id of Object.keys(PROMO_LENGTHS) as PromoSceneId[]) {
    out[id] = { from: c, to: c + PROMO_LENGTHS[id], duration: PROMO_LENGTHS[id] };
    c += PROMO_LENGTHS[id];
  }
  return out;
})();

export const PROMO_DURATION = P.finale.to;

/** Source frames inside public/app/demo.mp4 (30 fps, 222 frames). */
export const DEMO = {
  journey: { from: 0, to: 96 },
  jobs: { from: 102, to: 168 },
  /** "$ Amount · Add income": only the neutral logging view is shown */
  addIncome: 214,
  /** fraction of the screen height covered by the recorded status bar */
  statusBar: 0.053,
  /** "Ask for a repeat" button centre, as fractions of the screen (settled scroll) */
  repeatButton: { x: 0.5, y: 0.442 },
  /** journey check node centre at source frame 45 */
  checkNode: { x: 0.48, y: 0.41 },
};

export const PB = {
  // arcade
  pressStart: 30,
  jumps: [45, 60, 75, 90],
  lineDay: 32,
  lineNight: 75,
  unlocked: 105,
  arcadeWipe: 136,
  // comic
  comicVideo: 12,
  captions: [30, 75],
  bubbles: [120, 135, 150],
  zoom: 180,
  cleared: 195,
  // scrapbook
  phoneDrop: 4,
  scrapVideo: 14,
  headline: 30,
  circle: 75,
  stickers: [90, 120, 135],
  scrapWipe: 166,
  // boss
  hits: [15, 30, 45, 60],
  tap: 75,
  xp: 80,
  defeated: 120,
  // finale
  logo: 6,
  tagline: 45,
  pill: 75,
  hero: 90,
} as const;
