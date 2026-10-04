/**
 * EXPLAINER TIMELINE · 30 s, 30 fps, 120 BPM (beat = 15 frames).
 * Pure motion graphics: the app's screens are rebuilt as animated UI, no footage.
 */
export const EX_LENGTHS = {
  hook: 120, //       0 – 120  "How FourFig works"
  path: 180, //     120 – 300  01 · Follow the path
  move: 150, //     300 – 450  02 · Do the next move
  regulars: 180, // 450 – 630  03 · Turn clients into regulars
  money: 150, //    630 – 780  04 · Watch it add up
  end: 120, //      780 – 900  FourFig · coming soon
} as const;

export type ExSceneId = keyof typeof EX_LENGTHS;
type Range = { from: number; to: number; duration: number };

export const E = (() => {
  const out = {} as Record<ExSceneId, Range>;
  let c = 0;
  for (const id of Object.keys(EX_LENGTHS) as ExSceneId[]) {
    out[id] = { from: c, to: c + EX_LENGTHS[id], duration: EX_LENGTHS[id] };
    c += EX_LENGTHS[id];
  }
  return out;
})();
export const EX_DURATION = E.end.to;

/** Scene-local beats shared by picture and sound. */
export const EB = {
  hookWords: [6, 14, 30, 38, 46],
  hookWipe: 104,
  pathPhone: 4,
  pathChecks: [30, 42, 54, 66],
  pathCurrent: 82,
  pathCardOut: 150,
  moveSteps: [30, 60, 90],
  moveDone: 108,
  regType: 40,
  regSave: 66,
  regTap: 90,
  regSent: 118,
  moneyTabs: [36, 54],
  moneyTap: 84,
  moneyStep: 92,
  moneyBadge: 112,
  endWord: 10,
  endPill: 50,
} as const;
