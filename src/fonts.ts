import { loadFont as loadInstrumentSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";
import { loadFont as loadPlexMono } from "@remotion/google-fonts/IBMPlexMono";

// Loaded once at module scope; Remotion holds every frame until they are ready.
const serif = loadInstrumentSerif("normal", { weights: ["400"], subsets: ["latin"] });
const sans = loadInterTight("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
const mono = loadPlexMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

export const FONTS = {
  /** Horror lines + editorial titles */
  serif: serif.fontFamily,
  /** UI motion section */
  sans: sans.fontFamily,
  /** REC HUD, paycheck, balance */
  mono: mono.fontFamily,
};

export const fontsReady = () =>
  Promise.all([serif.waitUntilDone(), sans.waitUntilDone(), mono.waitUntilDone()]);
