import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";
import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";

/** The overlay's three faces, loaded once at module scope (Remotion holds each frame until they are in). */
const inter = loadInter("normal", { weights: ["200", "400", "500", "600"], subsets: ["latin"] });
const tight = loadInterTight("normal", { weights: ["600"], subsets: ["latin"] });
const news = loadNewsreader("italic", { weights: ["400"], subsets: ["latin"] });

export const F = {
  /** HUD numerals (200), labels (500), chat text (400) */
  ui: inter.fontFamily,
  /** title card, end-card title and CTA (600) */
  display: tight.fontFamily,
  /** captions (italic 400) */
  serif: news.fontFamily,
};
