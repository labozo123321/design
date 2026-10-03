/**
 * TIMELINE
 * --------
 * Every frame number in the trailer comes from this file.
 *
 * Scenes are laid out back to back in the order of SCENE_LENGTHS. Changing a
 * length ripples every later scene (like a ripple edit in an NLE), and the
 * total duration, SFX cues and act boundaries all follow automatically.
 *
 * BEATS are moments *inside* a scene (scene-local frames). The visuals and the
 * SFX cue sheet both read them, so a retimed beat keeps picture and sound in
 * sync.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** Scene order + length in frames. Default absolute ranges in the comments. */
export const SCENE_LENGTHS = {
  // ACT 1 · THE ROUTINE (found footage + noir)
  alarm: 45, //            0 –   45
  everyMorning: 45, //    45 –   90
  sameCommute: 45, //     90 –  135
  sameDesk: 45, //       135 –  180
  spent: 60, //          180 –  240
  sameLife: 60, //       240 –  300
  blackout: 30, //       300 –  330
  // ACT 2 · THE DREAD (glitch + noir)
  flashWords: 60, //     330 –  390
  balance: 60, //        390 –  450
  crackedClock: 60, //   450 –  510
  inkBleed: 30, //       510 –  540
  // ACT 3 · THE TURN (clean UI motion, grain at 20%)
  stillWaiting: 45, //   540 –  585
  search: 45, //         585 –  630
  lookNoFurther: 30, //  630 –  660
  journey: 75, //        660 –  735
  outreach: 45, //       735 –  780
  progress: 30, //       780 –  810
  checklist: 30, //      810 –  840
  // ACT 4 · THE TITLE (editorial prestige + horror callback)
  alarmGold: 60, //      840 –  900
  wakeUp: 60, //         900 –  960
  title: 60, //          960 – 1020
  titleGlitch: 40, //   1020 – 1060
  fadeOut: 20, //       1060 – 1080
} as const;

export type SceneId = keyof typeof SCENE_LENGTHS;
export type Range = { from: number; to: number; duration: number };

const buildRanges = (): Record<SceneId, Range> => {
  const out = {} as Record<SceneId, Range>;
  let cursor = 0;
  for (const id of Object.keys(SCENE_LENGTHS) as SceneId[]) {
    const duration = SCENE_LENGTHS[id];
    out[id] = { from: cursor, to: cursor + duration, duration };
    cursor += duration;
  }
  return out;
};

/** Absolute frame range of every scene. */
export const T = buildRanges();

/** Total length (1080 frames = 36 s). Frame DURATION - 1 loops into frame 0. */
export const DURATION = T.fadeOut.to;

const span = (a: SceneId, b: SceneId): Range => ({
  from: T[a].from,
  to: T[b].to,
  duration: T[b].to - T[a].from,
});

export const ACTS = {
  routine: span("alarm", "blackout"),
  dread: span("flashWords", "inkBleed"),
  turn: span("stillWaiting", "checklist"),
  title: span("alarmGold", "fadeOut"),
};

/** Scene-local beats shared by picture and sound. */
export const BEATS = {
  /** alarm: display flickers on */
  alarmPowerOn: 9,
  /** alarm: distorted beeps (first one is the 0:00.15 cue) */
  alarmBeeps: [15, 19, 23, 27, 36, 40],
  /** alarm: REC HUD appears */
  recOn: 5,
  /** spent: stamp hits the paper */
  spentImpact: 20,
  /** sameLife: text swaps to "same life. forever." */
  foreverAt: 30,
  foreverLen: 5,
  /** blackout: the REC dot stops blinking */
  recStop: 22,
  /** crackedClock: crack bursts */
  crackBursts: [12, 24, 36],
  /** inkBleed: frame is fully black */
  inkCovered: 25,
  /** inkBleed: reversed whoosh lands */
  inkWhoosh: 28,
  /** search: cursor clicks the bar / the clear button */
  searchClick: 11,
  searchClear: 43,
  /** lookNoFurther: the period lands */
  periodClick: 25,
  /** outreach: cursor taps "Write my outreach" */
  outreachTap: 9,
  /** outreach: "Sent" tag pops */
  outreachSent: 37,
  /** search: typing starts / junk results get struck through */
  searchType: 13,
  searchStrikes: [34, 37, 40],
  /** lookNoFurther: typing starts */
  lookType: 5,
  /** journey: nodes light up, CTA appears, zoom-through starts */
  journeyLights: [22, 28, 34, 40, 46],
  journeyCta: 52,
  journeyZoom: 65,
  /** progress: chips pop, boss mission flips */
  progressChips: [11, 14],
  progressBoss: 15,
  /** checklist: items tick */
  checklistTicks: [4, 7, 10],
  /** checklist: big check completes */
  confirmChime: 15,
  /** titleGlitch: first frame of the 3-frame hit */
  titleGlitch: 2,
  titleGlitchLen: 3,
};

/**
 * Flash frames in "flashWords" (scene-local). Each hit is 2–4 frames and gets a
 * percussive SFX on its first frame. Even hits are ink on bone, odd hits bone on ink.
 */
export const FLASH_HITS = [
  { at: 0, len: 4, word: "rent." },
  { at: 9, len: 4, word: "bills." },
  { at: 17, len: 3, word: "overtime." },
  { at: 24, len: 3, word: "someday." },
  { at: 30, len: 3, word: "rent." },
  { at: 36, len: 2, word: "bills." },
  { at: 41, len: 2, word: "overtime." },
  { at: 45, len: 2, word: "someday." },
  { at: 49, len: 2, word: "rent." },
  { at: 52, len: 2, word: "bills." },
  { at: 55, len: 2, word: "overtime." },
  { at: 57, len: 3, word: "someday." },
] as const;

/** Absolute SFX cue frames, derived from scenes + beats (see src/audio/AudioSlot.tsx). */
const at = (id: SceneId, beats: readonly number[]) => beats.map((b) => T[id].from + b);
export const SFX = {
  // ACT 1
  alarmBeep: T.alarm.from + BEATS.alarmBeeps[0], //                 15
  cutHit: T.everyMorning.from, //                                   45
  clockSpin: T.sameCommute.from + 18, //                            108
  spentThud: T.spent.from + BEATS.spentImpact, //                  200
  glitchIn: T.sameLife.from, //                                    240
  foreverGlitch: T.sameLife.from + BEATS.foreverAt, //             270
  // ACT 2
  flashHits: at(
    "flashWords",
    FLASH_HITS.map((h) => h.at),
  ), //       330 … 387
  balanceGlitch: T.balance.from + 47, //                           437
  glitchIn2: T.crackedClock.from, //                               450
  crackHits: at("crackedClock", BEATS.crackBursts), //            462, 474, 486
  reversedWhoosh: T.inkBleed.from + BEATS.inkWhoosh, //            538 (peak)
  // ACT 3
  uiClicks: at("search", [BEATS.searchClick, BEATS.searchClear]), // 596, 628
  typingSearch: T.search.from + BEATS.searchType, //               598
  strikes: at("search", BEATS.searchStrikes), //                  619, 622, 625
  iris: T.lookNoFurther.from, //                                   630
  typingLook: T.lookNoFurther.from + BEATS.lookType, //            635
  periodClick: T.lookNoFurther.from + BEATS.periodClick, //        655
  tiltIn: T.journey.from, //                                       660
  nodePops: at("journey", BEATS.journeyLights), //                682 … 706
  ctaPop: T.journey.from + BEATS.journeyCta, //                    712
  zoom: T.journey.from + BEATS.journeyZoom, //                     725
  outreachTap: T.outreach.from + BEATS.outreachTap, //             744
  sent: T.outreach.from + BEATS.outreachSent, //                   772
  whip: T.progress.from, //                                        780
  chipPops: at("progress", BEATS.progressChips), //               791, 794
  bossFlip: T.progress.from + BEATS.progressBoss, //               795
  checklistTicks: at("checklist", BEATS.checklistTicks), //       814, 817, 820
  confirmChime: T.checklist.from + BEATS.confirmChime, //          825
  // ACT 4
  cutToBlack: T.alarmGold.from, //                                 840
  titleHit: T.title.from, //                                       960
  glitchStinger: T.titleGlitch.from + BEATS.titleGlitch, //       1022
};
