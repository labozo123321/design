import { getInputProps } from "remotion";

/**
 * Switches for diagnosing the picture from a preview render (input prop `debug`, comma-separated):
 * nobloom, noblur, nosteel (hide the steel ball guides), nogi (general illumination off), noenv (no live
 * reflections). Off in a normal render.
 */
const raw = (getInputProps() as { debug?: string }).debug ?? "";
export const DEBUG = new Set(raw.split(",").filter(Boolean));
