import React from "react";
import { M } from "./timeline";
import SCRIPT from "./script.json";

/**
 * Everything written on the screen (no voice), kept sparse: the title, a few of the ball's thoughts, one
 * fun fact, and "here we go again". The thoughts and the fact are in script.json (the sound reads it too,
 * for its pops and whooshes). The cold open plays with no words over it: the delivered cut trims the freeze
 * frame to a beat and goes from the rewind straight to the title (see README).
 */

const FPS = 30;

export type Fonts = { comic: string; round: string; meme: string; vcr: string; title: string };

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** A pop: overshoots to `over`, settles at 1 (0 before t0). */
const pop = (t: number, t0: number, dur = 0.22, over = 1.18) => {
  const u = (t - t0) / dur;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u < 0.6 ? (u / 0.6) * over : over + (1 - over) * ((u - 0.6) / 0.4);
};
/** Fade in, hold, fade out. */
const life = (t: number, t0: number, t1: number, fi = 0.08, fo = 0.18) =>
  smooth(t0, t0 + fi, t) * (1 - smooth(t1 - fo, t1, t));

/* ------------------------------------------------------------------ */
/* the ball's thoughts                                                  */
/* ------------------------------------------------------------------ */

type Line = { t0: number; t1: number; text: string; big?: boolean };

const THOUGHTS: Line[] = SCRIPT.thoughts;

const Thought: React.FC<{ line: Line; t: number; font: string }> = ({ line, t, font }) => {
  const a = life(t, line.t0, line.t1, 0.06, 0.15);
  if (a <= 0) return null;
  const s = pop(t, line.t0, 0.2, 1.08);
  const size = line.big ? 66 : 54;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 1300,
        display: "flex",
        justifyContent: "center",
        opacity: a,
      }}
    >
      <div style={{ position: "relative", transform: `scale(${s})`, transformOrigin: "50% 100%" }}>
        <div
          style={{
            maxWidth: 820,
            padding: "22px 40px 26px",
            borderRadius: 60,
            background: "rgba(255,255,255,0.96)",
            color: "#160A22",
            fontFamily: font,
            fontWeight: 600,
            fontSize: size,
            lineHeight: 1.12,
            textAlign: "center",
            boxShadow: "0 10px 0 rgba(22,10,34,0.45), 0 0 0 6px #160A22",
          }}
        >
          {line.text}
        </div>
        {/* thought-bubble dots, trailing down to you */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: -46,
            width: 30,
            height: 30,
            marginLeft: -15,
            borderRadius: 15,
            background: "#fff",
            boxShadow: "0 0 0 5px #160A22",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: -82,
            width: 17,
            height: 17,
            marginLeft: -8,
            borderRadius: 9,
            background: "#fff",
            boxShadow: "0 0 0 4px #160A22",
          }}
        />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* fun facts                                                            */
/* ------------------------------------------------------------------ */

type Fact = { t0: number; t1: number; head: string; body: string; color: string };

const FACTS: Fact[] = SCRIPT.facts;

const FactCard: React.FC<{ f: Fact; t: number; fonts: Fonts }> = ({ f, t, fonts }) => {
  if (t < f.t0 - 0.1 || t > f.t1 + 0.1) return null;
  const inn = smooth(f.t0, f.t0 + 0.25, t);
  const out = smooth(f.t1 - 0.25, f.t1, t);
  const x = (1 - inn) * -900 + out * 900;
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 70,
        top: 300,
        transform: `translateX(${x}px) rotate(-1.5deg)`,
      }}
    >
      <div
        style={{
          background: "rgba(22, 8, 40, 0.88)",
          border: `5px solid ${f.color}`,
          borderRadius: 34,
          padding: "20px 34px 26px",
          boxShadow: "0 12px 0 rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            fontFamily: fonts.title,
            fontSize: 46,
            color: f.color,
            letterSpacing: "0.04em",
            marginBottom: 6,
          }}
        >
          {f.head}
        </div>
        <div
          style={{
            fontFamily: fonts.round,
            fontWeight: 500,
            fontSize: 44,
            lineHeight: 1.2,
            color: "#FFFFFF",
          }}
        >
          {f.body}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* big moments                                                          */
/* ------------------------------------------------------------------ */

const Title: React.FC<{ t: number; fonts: Fonts }> = ({ t, fonts }) => {
  const t0 = M.rewind[1] + 1.45;
  const a = life(t, t0, M.launch - 0.1, 0.12, 0.25);
  if (a <= 0) return null;
  const s = pop(t, t0, 0.25, 1.1);
  // on a plate of its own: the backglass behind it is busy
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 190,
        display: "flex",
        justifyContent: "center",
        opacity: a,
      }}
    >
      <div
        style={{
          transform: `scale(${s}) rotate(-2deg)`,
          textAlign: "center",
          padding: "18px 46px 26px",
          borderRadius: 44,
          background: "rgba(20, 8, 38, 0.9)",
          border: "6px solid #FFE95C",
          boxShadow: "0 12px 0 rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{ fontFamily: fonts.meme, fontWeight: 800, fontSize: 60, color: "#FFFFFF", lineHeight: 1.1 }}
        >
          POV:
        </div>
        <div
          style={{
            fontFamily: fonts.title,
            fontSize: 100,
            color: "#FFE95C",
            WebkitTextStroke: "10px #160A22",
            paintOrder: "stroke fill",
            lineHeight: 1.05,
            textShadow: "0 8px 0 #160A22",
            whiteSpace: "nowrap",
          }}
        >
          you're a pinball
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* the whole overlay                                                    */
/* ------------------------------------------------------------------ */

export const Overlay: React.FC<{ frame: number; fonts: Fonts }> = ({ frame, fonts }) => {
  const t = frame / FPS;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Title t={t} fonts={fonts} />
      {FACTS.map((f, i) => (
        <FactCard key={i} f={f} t={t} fonts={fonts} />
      ))}
      {THOUGHTS.map((l, i) => (
        <Thought key={i} line={l} t={t} font={fonts.round} />
      ))}
      {/* the end: the meme, on a plate like the title's */}
      {t >= 67.9 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 230,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              opacity: smooth(67.9, 68.05, t),
              transform: `scale(${pop(t, 67.9, 0.22, 1.12)}) rotate(-2deg)`,
              padding: "20px 44px 26px",
              borderRadius: 44,
              background: "rgba(20, 8, 38, 0.9)",
              border: "6px solid #FFFFFF",
              boxShadow: "0 12px 0 rgba(0,0,0,0.45)",
              fontFamily: fonts.meme,
              fontWeight: 800,
              fontSize: 82,
              color: "#FFFFFF",
              whiteSpace: "nowrap",
            }}
          >
            here we go again
          </div>
        </div>
      ) : null}
    </div>
  );
};
