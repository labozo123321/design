import VO from "./vo.json";

/** The voice drives the edit: every cut and move is pinned to a word of the narration. */
export const FPS = 30;
export const DURATION = VO.duration;
export const LIFT_FRAMES = Math.ceil(DURATION * FPS);

export type Word = { w: string; s: number; e: number };
export type Sentence = { i: number; text: string; s: number; e: number; words: Word[] };
export type Caption = { text: string; s: number; e: number; show: number; hide: number; sent: number };

export const SENTENCES = VO.sentences as Sentence[];
export const CAPTIONS = VO.captions as Caption[];

const clean = (w: string) => w.toLowerCase().replace(/[^a-z0-9'-]/g, "");

/** When word `w` of sentence `i` starts (w may be an index or the word itself, first match). */
export const at = (i: number, w: number | string = 0): number => {
  const s = SENTENCES[i];
  if (typeof w === "number") return s.words[Math.max(0, Math.min(s.words.length - 1, w))].s;
  const k = s.words.findIndex((x) => clean(x.w) === clean(w));
  if (k < 0) throw new Error(`no word "${w}" in sentence ${i}: ${s.text}`);
  return s.words[k].s;
};
/** When word `w` of sentence `i` ends. */
export const atEnd = (i: number, w: number | string): number => {
  const s = SENTENCES[i];
  if (typeof w === "number") return s.words[Math.max(0, Math.min(s.words.length - 1, w))].e;
  const k = s.words.findIndex((x) => clean(x.w) === clean(w));
  if (k < 0) throw new Error(`no word "${w}" in sentence ${i}: ${s.text}`);
  return s.words[k].e;
};
export const start = (i: number) => SENTENCES[i].s;
export const end = (i: number) => SENTENCES[i].e;
