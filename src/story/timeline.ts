/**
 * STORY TIMELINE · voice-driven. scripts/generate-voiceover.py story writes vo.json:
 * one clip per sentence, and each scene lasts as long as its lines need.
 * Everything here (picture, captions, sfx, music) reads those frames.
 */
import VO from "./vo.json";

export type StorySceneId = "paper" | "blueprint" | "bauhaus" | "riso" | "groovy" | "end";
type SceneWin = { id: string; from: number; to: number; lines: number[] };

export const STORY_DURATION = VO.duration;
export const LINES = VO.lines;
export const SCENES = VO.scenes as SceneWin[];
export const SC = Object.fromEntries(SCENES.map((s) => [s.id, s])) as Record<StorySceneId, SceneWin>;

/** Each incoming scene wipes over the last OVER frames of the one before. */
export const OVER = 12;
export const seqFrom = (id: StorySceneId) => SC[id].from - (id === "paper" ? 0 : OVER);
export const seqDuration = (id: StorySceneId) => SC[id].to - seqFrom(id);

/** Scene-local frame where line k of this scene starts. */
export const lineAt = (id: StorySceneId, k: number) => LINES[SC[id].lines[k]].from - seqFrom(id);
/** Scene-local frame where word w of line k is spoken. */
export const wordAt = (id: StorySceneId, k: number, w: number) =>
  LINES[SC[id].lines[k]].words[w].at - seqFrom(id);
/** Absolute frame where a scene's line k starts (for audio). */
export const lineAbs = (id: StorySceneId, k: number) => LINES[SC[id].lines[k]].from;
