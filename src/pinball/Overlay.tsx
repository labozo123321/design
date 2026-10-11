import React from "react";
import * as THREE from "three";
import { poseAt } from "./camera";
import { M } from "./timeline";
import SCRIPT from "./script.json";

/**
 * Everything written on the screen (no voice), kept sparse: the cold open's meme ("yep. that's me."), the
 * "15 SECONDS EARLIER" card, the title, a few of the ball's thoughts, one fun fact, and "here we go again".
 * The thoughts and the fact are in script.json (the sound reads it too, for its pops and whooshes).
 */

const W = 1080;
const H = 1920;
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
const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

/* ------------------------------------------------------------------ */
/* projecting the table into the picture                                */
/* ------------------------------------------------------------------ */

const projCam = new THREE.PerspectiveCamera();
export const project = (frame: number, p: THREE.Vector3) => {
  const pose = poseAt(frame);
  projCam.position.copy(pose.pos);
  projCam.quaternion.copy(pose.quat);
  projCam.fov = pose.fov;
  projCam.aspect = W / H;
  projCam.near = 0.003;
  projCam.far = 30;
  projCam.updateProjectionMatrix();
  projCam.updateMatrixWorld();
  const v = p.clone().applyMatrix4(projCam.matrixWorldInverse);
  const n = p.clone().project(projCam);
  return {
    x: (n.x * 0.5 + 0.5) * W,
    y: (1 - (n.y * 0.5 + 0.5)) * H,
    behind: v.z > -0.002,
    onScreen: Math.abs(n.x) < 1 && Math.abs(n.y) < 1,
  };
};

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
/* the cold open, the rewind, the card                                  */
/* ------------------------------------------------------------------ */

const memeText = (font: string, size = 70): React.CSSProperties => ({
  fontFamily: font,
  fontWeight: 800,
  fontSize: size,
  color: "#FFFFFF",
  WebkitTextStroke: "10px #000",
  paintOrder: "stroke fill",
  textAlign: "center",
  lineHeight: 1.15,
});

const ColdOpen: React.FC<{ t: number; frame: number; fonts: Fonts }> = ({ t, frame, fonts }) => {
  if (t < M.freeze || t >= M.rewind[0]) return null;
  // where you are in the frozen picture
  const ball = project(frame, poseAt(frame).ball);
  const yep = life(t, 1.05, 1.95, 0.03, 0.1);
  const me = life(t, 1.35, 1.95, 0.03, 0.1);
  const how = life(t, 2.0, M.rewind[0], 0.05, 0.05);
  const arrowA = Math.max(me, 0);
  const ax0 = 540;
  const ay0 = 1250;
  const dx = ball.x - ax0;
  const dy = ball.y - 60 - ay0;
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: 1290,
          ...memeText(fonts.meme),
          opacity: Math.max(yep, 0),
        }}
      >
        yep.{me > 0 ? " that's me." : ""}
      </div>
      {arrowA > 0 ? (
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity: arrowA }}>
          <g transform={`translate(${ax0}, ${ay0}) rotate(${(ang * 180) / Math.PI})`}>
            <line
              x1={0}
              y1={0}
              x2={len * Math.min(1, pop(t, 1.35, 0.2, 1))}
              y2={0}
              stroke="#000"
              strokeWidth={22}
              strokeLinecap="round"
            />
            <line
              x1={0}
              y1={0}
              x2={len * Math.min(1, pop(t, 1.35, 0.2, 1))}
              y2={0}
              stroke="#fff"
              strokeWidth={12}
              strokeLinecap="round"
            />
            <g transform={`translate(${len * Math.min(1, pop(t, 1.35, 0.2, 1))}, 0)`}>
              <polygon
                points="0,0 -46,-30 -46,30"
                fill="#fff"
                stroke="#000"
                strokeWidth={7}
                strokeLinejoin="round"
              />
            </g>
          </g>
        </svg>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: 1260,
          ...memeText(fonts.meme, 64),
          opacity: how,
        }}
      >
        you're probably wondering how I got here
      </div>
    </>
  );
};

/** The time card (SpongeBob style): sunburst, bubbles, wobbly letters. */
const EarlierCard: React.FC<{ t: number; fonts: Fonts }> = ({ t, fonts }) => {
  const t0 = M.rewind[1];
  const t1 = t0 + 1.45;
  if (t < t0 || t >= t1) return null;
  const s = pop(t, t0, 0.18, 1.06);
  const text = "15 SECONDS EARLIER";
  const rays = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#3B1A8F" }}>
      <svg
        width={W}
        height={H}
        viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <g transform={`rotate(${(t - t0) * 12})`}>
          {rays.map((i) => {
            const a0 = (i / 24) * Math.PI * 2;
            const a1 = a0 + Math.PI / 24;
            const R = 1600;
            return (
              <polygon
                key={i}
                points={`0,0 ${Math.cos(a0) * R},${Math.sin(a0) * R} ${Math.cos(a1) * R},${Math.sin(a1) * R}`}
                fill={i % 2 ? "#6A2BD6" : "#E0409A"}
              />
            );
          })}
        </g>
        {Array.from({ length: 16 }, (_, i) => {
          const x = (hash(i * 3.1) - 0.5) * W;
          const y = H / 2 - ((hash(i * 7.7) * H + (t - t0) * 260 * (0.6 + hash(i))) % H);
          const r = 14 + hash(i * 5.3) * 40;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={r}
              fill="rgba(255,255,255,0.18)"
              stroke="rgba(255,255,255,0.7)"
              strokeWidth={4}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 760,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          transform: `scale(${s})`,
          padding: "0 60px",
        }}
      >
        {text.split(" ").map((word, wi) => (
          <div key={wi} style={{ display: "flex", margin: "0 18px" }}>
            {word.split("").map((ch, i) => {
              const k = wi * 10 + i;
              const bob = Math.sin((t - t0) * 9 + k * 0.8) * 10;
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    fontFamily: fonts.title,
                    fontSize: wi === 2 ? 150 : 132,
                    color: "#FFE95C",
                    WebkitTextStroke: "12px #2A0A40",
                    paintOrder: "stroke fill",
                    transform: `translateY(${bob}px) rotate(${(hash(k) - 0.5) * 14}deg)`,
                    textShadow: "0 10px 0 #2A0A40",
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>
        ))}
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
      <ColdOpen t={t} frame={frame} fonts={fonts} />
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
      <EarlierCard t={t} fonts={fonts} />
    </div>
  );
};
