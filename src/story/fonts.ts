import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import { loadFont as loadArchitects } from "@remotion/google-fonts/ArchitectsDaughter";
import { loadFont as loadArchivo } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as loadRubikMono } from "@remotion/google-fonts/RubikMonoOne";
import { loadFont as loadShrikhand } from "@remotion/google-fonts/Shrikhand";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";

/** One face per art style. */
export const SFONTS = {
  /** paper cutout */
  paper: loadFredoka("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily,
  /** blueprint handwriting */
  hand: loadArchitects("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  /** blueprint annotations */
  tech: loadSpaceGrotesk("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily,
  /** Bauhaus poster */
  poster: loadArchivo("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  /** risograph print */
  riso: loadRubikMono("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  /** 70s groovy */
  groovy: loadShrikhand("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
};
