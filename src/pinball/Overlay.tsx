import React from "react";
import * as THREE from "three";
import { poseAt } from "./camera";
import { EVENTS, LAY, M, T, clampF } from "./timeline";
import { KEY } from "./show";
import SCRIPT from "./script.json";

/**
 * Everything written on the screen (no voice): the cold open's meme ("yep. that's me."), the VHS rewind,
 * the "15 SECONDS EARLIER" card, the title, what the ball is thinking, comic-book sound words where
 * things hit you, score pop-ups, five fun facts, and the big moments (MULTIBALL, JACKPOT, TILT, GAME OVER,
 * "here we go again"). The thoughts and facts are in script.json (the sound reads it too, for its pops
 * and whooshes).
 */

const W = 1080;
const H = 1920;
const FPS = 30;

export type Fonts = { comic: string; round: string; meme: string; vcr: string; title: string };

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
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
/* comic words and score pop-ups, from the events                       */
/* ------------------------------------------------------------------ */

type Word = {
  t: number;
  text: string;
  x: number;
  y: number;
  size: number;
  fill: [string, string];
  burst: string;
  rot: number;
  score?: string;
  hold: number;
};

const BUMPER_WORDS = ["BONK!", "POW!", "BAM!", "BOING!", "ZAP!", "WHAM!", "BOP!"];
const POINTS: Record<string, string> = {
  bumper: "+1,000",
  sling_L: "+100",
  sling_R: "+100",
  drop: "+10,000",
  ramp_in: "+50,000",
  chomp: "+100,000",
};

const anchorFor = (e: (typeof EVENTS)[number]): THREE.Vector3 | null => {
  const k = (e as { k?: number }).k ?? 0;
  const ex = (e as { x?: number }).x;
  const ey = (e as { y?: number }).y;
  switch (e.kind) {
    case "bumper": {
      const [x, y] = (LAY.bumpers as [number, number][])[k];
      return new THREE.Vector3(x, 0.05, -y);
    }
    case "sling_L":
    case "sling_R": {
      const p = LAY.slings[e.kind === "sling_L" ? "L" : "R"] as [number, number][];
      return new THREE.Vector3((p[0][0] + p[1][0] + p[2][0]) / 3, 0.022, -(p[0][1] + p[1][1] + p[2][1]) / 3);
    }
    case "flipper_L":
    case "flipper_R": {
      const fl = LAY.flippers[e.kind === "flipper_L" ? "L" : "R"];
      return new THREE.Vector3(
        fl.pivot[0] + (e.kind === "flipper_L" ? 0.035 : -0.035),
        0.015,
        -fl.pivot[1] + 0.01,
      );
    }
    case "drop": {
      const [x, y] = (LAY.drops as [number, number][])[k];
      return new THREE.Vector3(x, 0.02, -y);
    }
    case "ballhit":
    case "lane":
      return ex !== undefined && ey !== undefined ? new THREE.Vector3(ex, 0.015, -ey) : null;
    default:
      return null;
  }
};

const WORDS: Word[] = (() => {
  const out: Word[] = [];
  let nb = 0;
  let firstLane = true;
  for (const e of EVENTS) {
    const cold = !!(e as { cold?: boolean }).cold;
    const mine = e.ball === "you" || e.kind === "ballhit";
    if (!mine) continue;
    let text = "";
    let size = 130;
    let fill: [string, string] = ["#FFF36B", "#FF9A1F"];
    let burst = "#FF2E6E";
    let score: string | undefined = POINTS[e.kind];
    switch (e.kind) {
      case "bumper":
        text = cold ? "BONK!" : BUMPER_WORDS[nb++ % BUMPER_WORDS.length];
        size = 150;
        burst = ["#FF2E6E", "#2EC6FF", "#8B3BFF"][(e as { k?: number }).k ?? 0];
        if (cold) score = undefined;
        break;
      case "sling_L":
      case "sling_R":
        text = hash(e.t) > 0.5 ? "THWACK!" : "SMACK!";
        size = 120;
        burst = "#2EC6FF";
        break;
      case "flipper_L":
      case "flipper_R":
        text = "THWACK!";
        size = 175;
        fill = ["#FFFFFF", "#9AF3FF"];
        burst = "#FF2E6E";
        break;
      case "drop":
        text = "CLONK!";
        size = 125;
        fill = ["#FFFFFF", "#B9FF8A"];
        burst = "#1FA34A";
        break;
      case "ballhit":
        text = "CLACK!";
        size = 115;
        fill = ["#FFFFFF", "#D7DCE6"];
        burst = "#5A6178";
        break;
      case "lane":
        if (!firstLane) continue;
        firstLane = false;
        text = "DING!";
        size = 130;
        fill = ["#FFFFFF", "#7FF0FF"];
        burst = "#2E8BFF";
        score = "+25,000";
        break;
      case "launch":
        text = "BOING!";
        size = 180;
        break;
      default:
        continue;
    }
    // where it happened, on screen at that moment (kept there; the camera whips on)
    const frame = Math.round(e.t * FPS);
    const a = anchorFor(e);
    let x = W / 2 + (hash(e.t * 3) - 0.5) * 240;
    let y = 760 + (hash(e.t * 7) - 0.5) * 200;
    if (a) {
      const p = project(frame, a);
      if (!p.behind) {
        x = p.x;
        y = p.y - 60;
      }
    }
    out.push({
      t: e.t,
      text,
      x: clamp(x, 220, W - 220),
      y: clamp(y, 380, 1380),
      size,
      fill,
      burst,
      rot: (hash(e.t * 11) - 0.5) * 0.4,
      score,
      hold: 0.55,
    });
  }
  return out;
})();

/** A jagged comic starburst behind a word. */
const Burst: React.FC<{ r: number; color: string; seed: number }> = ({ r, color, seed }) => {
  const pts: string[] = [];
  const n = 14;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = (i % 2 ? 0.62 : 1) * r * (0.85 + 0.3 * hash(seed + i));
    pts.push(`${(Math.cos(a) * rr * 1.45).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`);
  }
  return (
    <svg
      width={r * 3.2}
      height={r * 2.4}
      viewBox={`${-r * 1.6} ${-r * 1.2} ${r * 3.2} ${r * 2.4}`}
      style={{ position: "absolute", left: -r * 1.6, top: -r * 1.2, overflow: "visible" }}
    >
      <polygon points={pts.join(" ")} fill="#120518" transform="translate(8, 10)" opacity={0.55} />
      <polygon points={pts.join(" ")} fill={color} stroke="#120518" strokeWidth={9} strokeLinejoin="round" />
    </svg>
  );
};

const ComicWord: React.FC<{ w: Word; t: number; font: string; fontScore: string }> = ({
  w,
  t,
  font,
  fontScore,
}) => {
  const d = t - w.t;
  if (d < 0 || d > w.hold + 0.5) return null;
  const s = pop(t, w.t, 0.16, 1.3);
  const fade = 1 - smooth(w.hold, w.hold + 0.25, d);
  const drift = d * 40;
  return (
    <div
      style={{
        position: "absolute",
        left: w.x,
        top: w.y - drift,
        transform: `rotate(${w.rot}rad) scale(${s})`,
        opacity: fade,
      }}
    >
      <Burst r={w.size * 0.62} color={w.burst} seed={Math.round(w.t * 100)} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "translate(-50%, -54%)",
          fontFamily: font,
          fontSize: w.size,
          lineHeight: 1,
          whiteSpace: "nowrap",
          letterSpacing: "0.02em",
          background: `linear-gradient(180deg, ${w.fill[0]} 20%, ${w.fill[1]} 85%)`,
          WebkitBackgroundClip: "text",
          color: "transparent",
          WebkitTextStroke: `${Math.round(w.size * 0.06)}px #120518`,
          paintOrder: "stroke fill",
          filter: "drop-shadow(0 8px 0 rgba(18,5,24,0.7))",
        }}
      >
        {w.text}
      </div>
      {w.score ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: w.size * 0.55 - d * 120,
            transform: "translate(-50%, 0)",
            fontFamily: fontScore,
            fontSize: 58,
            color: "#FFFFFF",
            WebkitTextStroke: "7px #120518",
            paintOrder: "stroke fill",
            whiteSpace: "nowrap",
            opacity: smooth(0.05, 0.15, d),
          }}
        >
          {w.score}
        </div>
      ) : null}
    </div>
  );
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

const Rewind: React.FC<{ t: number; fonts: Fonts }> = ({ t, fonts }) => {
  if (t < M.rewind[0] || t >= M.rewind[1]) return null;
  const u = (t - M.rewind[0]) / (M.rewind[1] - M.rewind[0]);
  const secs = Math.round(15 * (1 - u));
  const blink = Math.floor(t * 4) % 2 === 0;
  const vcr: React.CSSProperties = {
    fontFamily: fonts.vcr,
    color: "#FFFFFF",
    textShadow: "3px 3px 0 #000, 0 0 12px rgba(255,255,255,0.6)",
  };
  return (
    <>
      <div style={{ position: "absolute", left: 80, top: 170, fontSize: 96, ...vcr }}>
        {blink ? "◀◀ REWIND" : "◀◀"}
      </div>
      <div style={{ position: "absolute", left: 80, bottom: 380, fontSize: 64, ...vcr }}>
        SP 0:00:{String(secs).padStart(2, "0")}
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
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 210,
        textAlign: "center",
        opacity: a,
        transform: `scale(${s})`,
      }}
    >
      <div
        style={{
          fontFamily: fonts.meme,
          fontWeight: 800,
          fontSize: 64,
          color: "#FFFFFF",
          WebkitTextStroke: "9px #160A22",
          paintOrder: "stroke fill",
        }}
      >
        POV:
      </div>
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 104,
          color: "#FFE95C",
          WebkitTextStroke: "12px #160A22",
          paintOrder: "stroke fill",
          lineHeight: 1.05,
          textShadow: "0 9px 0 #160A22",
        }}
      >
        you're a pinball
      </div>
    </div>
  );
};

const Stamp: React.FC<{
  t: number;
  t0: number;
  t1: number;
  text: string;
  font: string;
  size: number;
  fill: string;
  stroke: string;
  rot: number;
  top: number;
  glow?: string;
}> = ({ t, t0, t1, text, font, size, fill, stroke, rot, top, glow }) => {
  const a = life(t, t0, t1, 0.02, 0.25);
  if (a <= 0) return null;
  // slams in from huge
  const u = smooth(t0, t0 + 0.14, t);
  const s = 2.4 - 1.4 * u + (u >= 1 ? 0.04 * Math.sin((t - t0) * 30) * Math.exp(-(t - t0) * 4) : 0);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        display: "flex",
        justifyContent: "center",
        opacity: a,
      }}
    >
      <div
        style={{
          transform: `rotate(${rot}deg) scale(${s})`,
          fontFamily: font,
          fontSize: size,
          color: fill,
          WebkitTextStroke: `${Math.round(size * 0.07)}px ${stroke}`,
          paintOrder: "stroke fill",
          letterSpacing: "0.03em",
          whiteSpace: "nowrap",
          textShadow: glow ? `0 0 40px ${glow}, 0 12px 0 ${stroke}` : `0 12px 0 ${stroke}`,
        }}
      >
        {text}
      </div>
    </div>
  );
};

const SlowMo: React.FC<{ t: number; frame: number; fonts: Fonts }> = ({ t, frame, fonts }) => {
  if (t < M.launch + 0.3 || t > M.drain + 3) return null;
  const r = Math.abs(T.rate[clampF(frame)] ?? 1);
  const a = 1 - smooth(0.42, 0.55, r);
  if (a <= 0.01) return null;
  const label = r < 0.12 ? "×0.1" : r < 0.2 ? "×0.15" : r < 0.3 ? "×0.25" : "×0.5";
  return (
    <div
      style={{
        position: "absolute",
        right: 60,
        top: 150,
        opacity: a * 0.92,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 20px 8px 14px",
        borderRadius: 40,
        background: "rgba(10,4,20,0.6)",
      }}
    >
      <svg width={64} height={44} viewBox="0 0 64 44">
        <path d="M6 38 Q30 30 58 38 L58 42 L6 42 Z" fill="#9BE36B" stroke="#160A22" strokeWidth={3} />
        <circle cx={28} cy={24} r={15} fill="#F2B04A" stroke="#160A22" strokeWidth={3} />
        <path d="M28 24 m-8 0 a8 8 0 1 1 8 8" fill="none" stroke="#160A22" strokeWidth={3} />
        <line x1={50} y1={36} x2={54} y2={18} stroke="#160A22" strokeWidth={3} />
        <circle cx={54} cy={17} r={3} fill="#160A22" />
      </svg>
      <div style={{ fontFamily: fonts.vcr, fontSize: 46, color: "#FFFFFF" }}>SLOW-MO {label}</div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* the whole overlay                                                    */
/* ------------------------------------------------------------------ */

export const Overlay: React.FC<{ frame: number; fonts: Fonts }> = ({ frame, fonts }) => {
  const t = frame / FPS;
  // the freeze frame holds the cold open's words still
  const tw = t < M.freeze ? t : t < M.rewind[0] ? M.freeze : t;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {WORDS.map((w, i) =>
        w.t < M.rewind[0] === t < M.rewind[0] ? (
          <ComicWord key={i} w={w} t={tw} font={fonts.comic} fontScore={fonts.title} />
        ) : null,
      )}
      <ColdOpen t={t} frame={frame} fonts={fonts} />
      <Rewind t={t} fonts={fonts} />
      <Title t={t} fonts={fonts} />
      <SlowMo t={t} frame={frame} fonts={fonts} />
      {FACTS.map((f, i) => (
        <FactCard key={i} f={f} t={t} fonts={fonts} />
      ))}
      <Stamp
        t={t}
        t0={KEY.chomp}
        t1={KEY.chomp + 1.0}
        text="CHOMP!"
        font={fonts.comic}
        size={230}
        fill="#FF4F6E"
        stroke="#160A22"
        rot={-6}
        top={700}
      />
      <Stamp
        t={t}
        t0={KEY.multiball}
        t1={KEY.multiball + 1.6}
        text="MULTIBALL!"
        font={fonts.comic}
        size={170}
        fill="#7FF0FF"
        stroke="#160A22"
        rot={4}
        top={760}
        glow="#2EC6FF"
      />
      <Stamp
        t={t}
        t0={KEY.burp}
        t1={KEY.burp + 1.1}
        text="BURRRP!"
        font={fonts.comic}
        size={230}
        fill="#9BFF5C"
        stroke="#160A22"
        rot={-5}
        top={700}
      />
      <Stamp
        t={t}
        t0={KEY.jackpot}
        t1={KEY.jackpot + 1.4}
        text="JACKPOT!"
        font={fonts.comic}
        size={210}
        fill="#FFE14D"
        stroke="#3A1600"
        rot={-4}
        top={640}
        glow="#FFB01F"
      />
      <Stamp
        t={t}
        t0={KEY.jackpot + 0.12}
        t1={KEY.jackpot + 1.4}
        text="+1,000,000"
        font={fonts.title}
        size={96}
        fill="#FFFFFF"
        stroke="#160A22"
        rot={-4}
        top={900}
      />
      <Stamp
        t={t}
        t0={KEY.tilt}
        t1={KEY.tilt + 1.3}
        text="TILT"
        font={fonts.comic}
        size={300}
        fill="#FF2A2A"
        stroke="#1A0000"
        rot={-9}
        top={640}
        glow="#FF0000"
      />
      <Stamp
        t={t}
        t0={M.drain + 0.12}
        t1={M.drain + 0.9}
        text="plop."
        font={fonts.meme}
        size={110}
        fill="#FFFFFF"
        stroke="#000"
        rot={0}
        top={780}
      />
      <Stamp
        t={t}
        t0={KEY.gameOver}
        t1={KEY.coin2}
        text="GAME OVER"
        font={fonts.vcr}
        size={190}
        fill="#FF8A1E"
        stroke="#200800"
        rot={0}
        top={760}
        glow="#FF6A00"
      />
      <Stamp
        t={t}
        t0={KEY.coin2}
        t1={KEY.coin2 + 0.8}
        text="CLINK!"
        font={fonts.comic}
        size={150}
        fill="#FFE14D"
        stroke="#160A22"
        rot={6}
        top={700}
      />
      <Stamp
        t={t}
        t0={M.drain + 6.15}
        t1={M.drain + 7.1}
        text="THUNK!"
        font={fonts.comic}
        size={150}
        fill="#FFFFFF"
        stroke="#160A22"
        rot={-5}
        top={700}
      />
      {THOUGHTS.map((l, i) => (
        <Thought key={i} line={l} t={t} font={fonts.round} />
      ))}
      {/* the end: the meme */}
      {t >= 67.9 ? (
        <div
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            top: 1280,
            ...memeText(fonts.meme, 84),
            opacity: smooth(67.9, 68.1, t),
          }}
        >
          here we go again
        </div>
      ) : null}
      <EarlierCard t={t} fonts={fonts} />
    </div>
  );
};
