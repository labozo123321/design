import { continueRender, delayRender, staticFile } from "remotion";

/** Nunito (SIL Open Font License), served from public/lift/fonts so renders need no network. One
 * variable file covers the 800 and 900 weights. */
export const LIFT_FONT = "NunitoLift";

let ready = false;
const waiters: (() => void)[] = [];
export const fontReady = () => ready;
export const onFontReady = (f: () => void) => (ready ? f() : waiters.push(f));

if (typeof document !== "undefined") {
  const handle = delayRender("Loading Nunito");
  const face = new FontFace(LIFT_FONT, `url(${staticFile("lift/fonts/nunito-latin-var.woff2")}) format("woff2")`, { weight: "200 1000" });
  face
    .load()
    .then((f) => {
      document.fonts.add(f);
      return document.fonts.load(`900 40px ${LIFT_FONT}`);
    })
    .then(() => {
      ready = true;
      waiters.splice(0).forEach((w) => w());
      continueRender(handle);
    })
    .catch((e) => {
      console.error("font", e);
      ready = true;
      waiters.splice(0).forEach((w) => w());
      continueRender(handle);
    });
}
