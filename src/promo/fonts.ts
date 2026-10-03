import { loadFont as loadPixel } from "@remotion/google-fonts/PressStart2P";
import { loadFont as loadComic } from "@remotion/google-fonts/Bangers";
import { loadFont as loadMarker } from "@remotion/google-fonts/PermanentMarker";
import { loadFont as loadNunito } from "@remotion/google-fonts/Nunito";

export const PFONTS = {
  pixel: loadPixel("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  comic: loadComic("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  marker: loadMarker("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  /** the app's own rounded face */
  app: loadNunito("normal", { weights: ["700", "800", "900"], subsets: ["latin"] }).fontFamily,
};

/** FourFig app palette, sampled from the screen recording. */
export const APP = {
  bg: "#0E1119",
  lime: "#88CC2D",
  limeDark: "#5E9A16",
  gold: "#F5A623",
  blue: "#3BA3F5",
  cream: "#F6EEDD",
  ink: "#141414",
};
