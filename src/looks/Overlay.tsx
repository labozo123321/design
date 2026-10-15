import React from "react";
import * as THREE from "three";
import { Img, staticFile } from "remotion";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadSerif } from "@remotion/google-fonts/DMSerifDisplay";
import { CUE, FPS, smooth } from "./timeline";
import type { Shot } from "./camera";
import { KIDS_IN_ORDER } from "./cast";

/**
 * On top of the picture: the title over the opening; the camera's viewfinder (corner marks, a faint
 * thirds grid, the focus brackets that find the face and lock green, the exposure scale, the battery and
 * the flash's ready light) whenever we're looking through it for real; and the yearbook page at the end.
 * No words but the title and the yearbook's.
 */

const MONT = loadMontserrat("normal", { weights: ["700", "800", "900"], subsets: ["latin"] });
const SERIF = loadSerif("normal", { weights: ["400"], subsets: ["latin"] });

const W = 1080;
const H = 1920;

const pop = (t: number, t0: number, dur = 0.24, over = 1.12) => {
  const u = (t - t0) / dur;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u < 0.6 ? (u / 0.6) * over : over + (1 - over) * ((u - 0.6) / 0.4);
};

const Title: React.FC<{ v: number }> = ({ v }) => {
  const t0 = 0.35;
  const t1 = CUE["mewer.in"] - 0.1;
  const a = smooth(t0, t0 + 0.12, v) * (1 - smooth(t1 - 0.25, t1, v));
  if (a <= 0) return null;
  const stroke = {
    WebkitTextStroke: "9px #111",
    paintOrder: "stroke fill" as const,
    textShadow: "0 6px 0 rgba(0,0,0,0.55), 0 0 26px rgba(0,0,0,0.35)",
  };
  return (
    <div style={{ position: "absolute", left: 56, right: 56, top: 250, textAlign: "center", opacity: a }}>
      <div style={{ fontFamily: MONT.fontFamily, fontWeight: 900, fontSize: 70, color: "#FFD23F", transform: `scale(${pop(v, t0)})`, ...stroke }}>POV:</div>
      <div style={{ fontFamily: MONT.fontFamily, fontWeight: 800, fontSize: 72, lineHeight: 1.08, color: "#FFFFFF", transform: `scale(${pop(v, t0 + 0.18)})`, marginTop: 4, ...stroke }}>
        you're the school photographer in the looksmaxing era
      </div>
    </div>
  );
};

/** Where a world point lands on the screen (px), or null behind the camera. */
const project = (shot: Shot, p: THREE.Vector3) => {
  const cam = new THREE.PerspectiveCamera(shot.pose.fov, W / H, 0.03, 200);
  cam.position.copy(shot.pose.pos);
  cam.quaternion.copy(shot.pose.quat);
  cam.updateMatrixWorld();
  const q = p.clone().project(cam);
  if (q.z > 1) return null;
  return { x: (q.x * 0.5 + 0.5) * W, y: (0.5 - q.y * 0.5) * H, px: H / (2 * Math.tan((shot.pose.fov * Math.PI) / 360) * shot.pose.pos.distanceTo(p)) };
};

const Brackets: React.FC<{ x: number; y: number; w: number; h: number; len: number; color: string; thick?: number }> = ({ x, y, w, h, len, color, thick = 4 }) => (
  <>
    {[
      [0, 0, 1, 1],
      [1, 0, -1, 1],
      [0, 1, 1, -1],
      [1, 1, -1, -1],
    ].map(([cx, cy, dx, dy], i) => (
      <React.Fragment key={i}>
        <div style={{ position: "absolute", left: x + cx * w - (dx < 0 ? len : 0), top: y + cy * h - (dy < 0 ? thick : 0), width: len, height: thick, background: color, boxShadow: "0 0 4px rgba(0,0,0,0.45)" }} />
        <div style={{ position: "absolute", left: x + cx * w - (dx < 0 ? thick : 0), top: y + cy * h - (dy < 0 ? len : 0), width: thick, height: len, background: color, boxShadow: "0 0 4px rgba(0,0,0,0.45)" }} />
      </React.Fragment>
    ))}
  </>
);

const Viewfinder: React.FC<{ v: number; shot: Shot; a: number }> = ({ v, shot, a }) => {
  if (a <= 0.01) return null;
  const kid = shot.block >= 0 && shot.block < KIDS_IN_ORDER.length ? KIDS_IN_ORDER[shot.block].key : null;
  const focusT = kid ? CUE[`${kid}.focus`] : CUE["photog.turn1"] + 0.25;
  const lock = smooth(focusT - 0.02, focusT + 0.02, v);
  const hunt = 1 + 0.35 * (1 - smooth(focusT - 0.25, focusT, v));
  const face = shot.face ? project(shot, shot.face.clone().add(new THREE.Vector3(0, -0.02, 0.06))) : null;
  // the flash's ready light: off while it recharges after each pop
  const flashes = [...KIDS_IN_ORDER.map((k) => CUE[`${k.key}.flash`]), CUE["photog.flash"]];
  const charging = flashes.some((f) => v >= f && v < f + 1.6);
  const ready = !charging || Math.floor(v * 6) % 2 === 0;
  const white = "rgba(255,255,255,0.88)";
  return (
    <div style={{ position: "absolute", inset: 0, opacity: a }}>
      {/* thirds */}
      {[1 / 3, 2 / 3].map((k) => (
        <React.Fragment key={k}>
          <div style={{ position: "absolute", left: W * k, top: 0, width: 1.5, height: H, background: "rgba(255,255,255,0.16)" }} />
          <div style={{ position: "absolute", top: H * k, left: 0, height: 1.5, width: W, background: "rgba(255,255,255,0.16)" }} />
        </React.Fragment>
      ))}
      <Brackets x={60} y={150} w={W - 120} h={H - 330} len={90} color={white} />
      {/* the centre point */}
      <div style={{ position: "absolute", left: W / 2 - 14, top: H / 2 - 1.5, width: 28, height: 3, background: "rgba(255,255,255,0.6)" }} />
      <div style={{ position: "absolute", left: W / 2 - 1.5, top: H / 2 - 14, width: 3, height: 28, background: "rgba(255,255,255,0.6)" }} />
      {/* the focus brackets on the face */}
      {face && face.x > 0 && face.x < W && face.y > 0 && face.y < H ? (() => {
        const s = Math.min(420, Math.max(120, face.px * 0.2)) * hunt;
        const col = lock > 0.5 ? "#59F07A" : white;
        return <Brackets x={face.x - s / 2} y={face.y - s * 0.6} w={s} h={s * 1.2} len={s * 0.22} color={col} thick={5} />;
      })() : null}
      {/* the exposure scale */}
      <div style={{ position: "absolute", left: W / 2 - 230, top: H - 140, width: 460, height: 30 }}>
        {Array.from({ length: 13 }, (_, i) => (
          <div key={i} style={{ position: "absolute", left: (i / 12) * 460 - 1.5, top: i % 3 === 0 ? 0 : 8, width: 3, height: i % 3 === 0 ? 22 : 12, background: white }} />
        ))}
        <div style={{ position: "absolute", left: 230 - 9 + 6 * Math.sin(v * 0.7), top: 26, width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderBottom: `14px solid ${white}` }} />
      </div>
      {/* battery */}
      <div style={{ position: "absolute", left: 92, top: H - 152, width: 64, height: 32, border: `3px solid ${white}`, borderRadius: 5 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ position: "absolute", left: 5 + i * 18, top: 4, width: 14, height: 18, background: i < 2 ? white : "rgba(255,255,255,0.2)" }} />
        ))}
        <div style={{ position: "absolute", right: -9, top: 8, width: 6, height: 12, background: white }} />
      </div>
      {/* the flash ready light (a bolt) */}
      <svg style={{ position: "absolute", right: 92, top: H - 160 }} width="40" height="48" viewBox="0 0 20 24">
        <path d="M12 0 L2 14 L9 14 L7 24 L18 9 L11 9 Z" fill={ready ? "#FFD23F" : "rgba(255,255,255,0.25)"} stroke="rgba(0,0,0,0.4)" strokeWidth="0.8" />
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* The yearbook                                                           */
/* ------------------------------------------------------------------ */

/** The page: three rows of three. The friend with the leaf blower never got his photo taken. */
const SLOTS: { photo: number | null; name: string }[] = [
  { photo: 0, name: "Mason Reyes" },
  { photo: 1, name: "Liam O'Connor" },
  { photo: 2, name: "Jaylen Brooks" },
  { photo: 3, name: "Kenji Watanabe" },
  { photo: 4, name: "Sofia Martinez" },
  { photo: 5, name: "Ethan Price" },
  { photo: 6, name: "Chase Vaughn" },
  { photo: null, name: "Tyler Nguyen" },
  { photo: 7, name: "Mr. Dale" },
];

const Silhouette: React.FC = () => (
  <svg width="100%" height="100%" viewBox="0 0 100 125" preserveAspectRatio="xMidYMid slice" style={{ display: "block", background: "#C9CDD3" }}>
    <circle cx="50" cy="48" r="19" fill="#E8EAED" />
    <path d="M14 125 C14 92 30 78 50 78 C70 78 86 92 86 125 Z" fill="#E8EAED" />
  </svg>
);

const Yearbook: React.FC<{ v: number }> = ({ v }) => {
  const t0 = CUE.yearbook;
  const t = v - t0;
  if (t < 0) return null;
  const slide = smooth(0, 0.55, t);
  const cols = 3;
  const pw = 290;
  const ph = 362;
  const gx = 34;
  const rowH = ph + 24 + 46 + 26;
  const x0 = (W - (cols * pw + (cols - 1) * gx)) / 2;
  const y0 = 330;
  const cellX = (i: number) => x0 + (i % cols) * (pw + gx);
  const cellY = (i: number) => y0 + Math.floor(i / cols) * rowH;
  // a slow drift in, then in on the photographer's own photo (the last one)
  const final = smooth(5.6, 7.4, t);
  const Z = 1 + 0.035 * smooth(0.5, 5.6, t) + 1.55 * final;
  const fx = cellX(8) + pw / 2;
  const fy = cellY(8) + (ph + 24) / 2;
  const cx = W / 2 + (fx - W / 2) * final;
  const cy = H / 2 + (fy - H / 2) * final;
  const tx = W / 2 - Z * cx + (1 - slide) * W * 1.05;
  const ty = H / 2 - Z * cy;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#111", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${Z})`,
          background: "linear-gradient(90deg, #DCCFB8 0%, #F2E9D8 6%, #F6EEDF 60%, #EFE5D2 100%)",
          boxShadow: "-30px 0 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* the paper's grain */}
        <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 0.18, mixBlendMode: "multiply" }}>
          <filter id="paper">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width={W} height={H} filter="url(#paper)" />
        </svg>
        <div style={{ position: "absolute", top: 118, left: 0, right: 0, textAlign: "center", fontFamily: SERIF.fontFamily, fontSize: 100, color: "#6E1A26", letterSpacing: 2 }}>Class of 2026</div>
        <div style={{ position: "absolute", top: 252, left: 210, right: 210, height: 4, background: "#C9A04A" }} />
        {SLOTS.map((slot, i) => {
          const tin = 0.6 + i * 0.3;
          const p = pop(t, tin, 0.22, 1.08);
          const rot = (((i * 37) % 7) - 3) * 0.45;
          return (
            <div key={i} style={{ position: "absolute", left: cellX(i), top: cellY(i), width: pw, opacity: smooth(tin - 0.02, tin + 0.06, t), transform: `scale(${p}) rotate(${rot}deg)` }}>
              <div style={{ width: pw, height: ph + 24, background: "#FFFFFF", padding: 12, boxSizing: "border-box", boxShadow: "0 6px 16px rgba(0,0,0,0.32)" }}>
                {slot.photo === null ? <Silhouette /> : <Img src={staticFile(`looks/photo-${slot.photo}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
              </div>
              <div style={{ marginTop: 10, textAlign: "center", fontFamily: MONT.fontFamily, fontWeight: 700, fontSize: 27, color: "#3A2E26", letterSpacing: 0.4, whiteSpace: "nowrap" }}>{slot.name}</div>
            </div>
          );
        })}
      </div>
      {/* fade out at the very end */}
      <div style={{ position: "absolute", inset: 0, background: "#000", opacity: smooth(CUE.end - t0 - 0.6, CUE.end - t0, t) }} />
    </div>
  );
};

export const Overlay: React.FC<{ frame: number; shot: Shot; edit: number; print: number; white: number; hold: boolean }> = ({ frame, shot, edit, print, white, hold }) => {
  const v = frame / FPS;
  if (v >= CUE.yearbook) return <Yearbook v={v} />;
  // looking through the camera for real: not in the edit, not the flash, not the print, not mid-whip
  const turning = v > CUE["photog.lift"] && v < CUE["photog.turn1"] + 0.2;
  const vf = smooth(0.25, 0.6, v) * (1 - edit) * (1 - print) * (1 - Math.min(1, white * 2)) * (hold ? 0 : 1) * (turning ? 0 : 1);
  return (
    <>
      <Viewfinder v={v} shot={shot} a={vf} />
      <Title v={v} />
    </>
  );
};
