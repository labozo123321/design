import * as THREE from "three";

/**
 * The backbox's dot-matrix display: 128 x 32 orange dots. Text is set in a 5 x 7 pixel font (drawn here,
 * so it's crisp) on a small canvas; a shader draws each texel as a round glowing dot.
 */

// 5x7 glyphs, rows top to bottom, 5 bits each (MSB = left column)
const G: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 17, 25, 21, 19, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  ":": [0, 12, 12, 0, 12, 12, 0],
  "-": [0, 0, 0, 31, 0, 0, 0],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "'": [4, 4, 8, 0, 0, 0, 0],
  "*": [0, 21, 14, 31, 14, 21, 0],
  "<": [2, 4, 8, 16, 8, 4, 2],
  ">": [8, 4, 2, 1, 2, 4, 8],
  "/": [1, 1, 2, 4, 8, 16, 16],
  "#": [10, 10, 31, 10, 31, 10, 10],
};

export type DmdLine = { text: string; y: number; scale?: number; blink?: boolean };

const W = 128;
const H = 32;
let canvas: HTMLCanvasElement | null = null;
let tex: THREE.CanvasTexture | null = null;

const textWidth = (s: string, sc: number) => s.length * 6 * sc - sc;

const drawText = (
  ctx: CanvasRenderingContext2D,
  s: string,
  cx: number,
  y: number,
  sc: number,
  level: number,
) => {
  const w = textWidth(s, sc);
  let x = Math.round(cx - w / 2);
  const v = Math.round(255 * level);
  ctx.fillStyle = `rgb(${v},${v},${v})`;
  for (const ch of s.toUpperCase()) {
    const g = G[ch] ?? G[" "];
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++) if (g[r] & (1 << (4 - c))) ctx.fillRect(x + c * sc, y + r * sc, sc, sc);
    x += 6 * sc;
  }
};

/** Draw a frame of the display: text lines, an optional burst of sparkle, an optional full flash. */
export const dmdTexture = (
  lines: DmdLine[],
  frame: number,
  extra?: { flash?: number; sparkle?: number; invert?: boolean },
) => {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = extra?.invert ? "#fff" : "#000";
  ctx.fillRect(0, 0, W, H);
  if (extra?.flash) {
    ctx.fillStyle = `rgba(255,255,255,${extra.flash})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (extra?.sparkle) {
    let s = (frame * 7919) % 2147483647 || 1;
    const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 40 * extra.sparkle; i++) ctx.fillRect(Math.floor(r() * W), Math.floor(r() * H), 1, 1);
  }
  for (const l of lines) {
    if (l.blink && Math.floor(frame / 6) % 2) continue;
    drawText(ctx, l.text, W / 2, l.y, l.scale ?? 1, extra?.invert ? 0 : 1);
  }
  tex!.needsUpdate = true;
  return tex!;
};

// (the scene uses a logarithmic depth buffer: a custom shader has to write the same depth, or it loses
// every depth test to the panel it's mounted on)
export const DMD_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
export const DMD_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform sampler2D uDots;
uniform vec3 uColor;
uniform float uGain;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec2 g = vUv * vec2(128.0, 32.0);
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float on = texture2D(uDots, (cell + 0.5) / vec2(128.0, 32.0)).r;
  float d = length(f);
  float dot = smoothstep(0.46, 0.30, d);
  vec3 col = uColor * (0.05 + on * uGain) * dot + vec3(0.012, 0.006, 0.003);
  gl_FragColor = vec4(col, 1.0);
}
`;
