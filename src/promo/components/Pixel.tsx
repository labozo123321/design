import React from "react";
import { AbsoluteFill, random } from "remotion";
import { PFONTS } from "../fonts";

/**
 * Original 8-bit kit: pixel hero, coin block, coins, clouds, hills, bricks.
 * (Generic retro-platformer language; no existing game characters.)
 */

const SPRITE_COLORS: Record<string, string> = {
  c: "#88CC2D", // cap + hoodie (FourFig lime)
  d: "#4E8A12", // shading
  s: "#F2C29B", // skin
  h: "#3B2416", // hair
  k: "#141414", // outline / eyes
  p: "#2B3A67", // pants
  w: "#FFFFFF",
  b: "#7A4A22", // shoes
};

const HERO_RUN_A = [
  "....cccc....",
  "...cccccc...",
  "...hhsssk...",
  "..hsshsks...",
  "..hsssssss..",
  "....ssss....",
  "...cccccc...",
  "..ccdccdcc..",
  ".sccccccccs.",
  ".sscccccccs.",
  "...cccccc...",
  "...pppppp...",
  "..ppp..ppp..",
  ".ppp....pp..",
  ".bb......bb.",
  "bbb.....bbb.",
];
const HERO_RUN_B = [
  "....cccc....",
  "...cccccc...",
  "...hhsssk...",
  "..hsshsks...",
  "..hsssssss..",
  "....ssss....",
  "...cccccc...",
  "..ccdccdcc..",
  "..scccccs...",
  "..sccccccs..",
  "...cccccc...",
  "...pppppp...",
  "....pppp....",
  "....ppp.....",
  "....bbb.....",
  "...bbbb.....",
];
const HERO_JUMP = [
  "....cccc...s",
  "...cccccc.ss",
  "...hhsssk.c.",
  "..hsshsks.c.",
  "..hssssssc..",
  "....sssscc..",
  "...ccccccc..",
  "..ccdccdc...",
  ".sccccccc...",
  "ss.cccccc...",
  "...cccccc...",
  "...pppppp...",
  "..ppp..ppp..",
  "..pp....ppb.",
  ".bbb.....bb.",
  "............",
];

export const Sprite: React.FC<{
  rows: string[];
  px: number;
  colors?: Record<string, string>;
  flip?: boolean;
}> = ({ rows, px, colors = SPRITE_COLORS, flip = false }) => (
  <svg
    width={rows[0].length * px}
    height={rows.length * px}
    shapeRendering="crispEdges"
    style={{ transform: flip ? "scaleX(-1)" : undefined, display: "block" }}
  >
    {rows.flatMap((row, y) =>
      [...row].map((ch, x) =>
        colors[ch] ? (
          <rect key={`${x}-${y}`} x={x * px} y={y * px} width={px} height={px} fill={colors[ch]} />
        ) : null,
      ),
    )}
  </svg>
);

export const Hero: React.FC<{ frame: number; jumping: boolean; px?: number }> = ({
  frame,
  jumping,
  px = 8,
}) => <Sprite rows={jumping ? HERO_JUMP : Math.floor(frame / 4) % 2 ? HERO_RUN_A : HERO_RUN_B} px={px} />;

const DOLLAR = [".kkk.", "k.k.k", "k.k..", ".kkk.", "..k.k", "k.k.k", ".kkk.", "..k.."];
/** 16×16 block: outline, rivets, and a "$" in the middle. */
const BLOCK = Array.from({ length: 16 }).map((_, y) =>
  Array.from({ length: 16 })
    .map((__, x) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return "k";
      if ((x === 2 || x === 13) && (y === 2 || y === 13)) return "y";
      const gx = x - 5;
      const gy = y - 4;
      if (gx >= 0 && gx < 5 && gy >= 0 && gy < 8 && DOLLAR[gy][gx] === "k") return "k";
      return "o";
    })
    .join(""),
);
/** A gold "$" block. `used` turns it into a spent brown block. */
export const CoinBlock: React.FC<{ px: number; used?: boolean }> = ({ px, used }) => (
  <Sprite
    rows={BLOCK}
    px={px}
    colors={
      used ? { k: "#3B2416", o: "#9C6B3C", y: "#9C6B3C" } : { k: "#3B2416", o: "#F7B731", y: "#FFF3B0" }
    }
  />
);

const COIN = [
  "...kkkk...",
  "..kyyyyk..",
  ".kyywwyyk.",
  ".kywyyyyk.",
  ".kywyyyyk.",
  ".kywyyyyk.",
  ".kywyyyyk.",
  ".kyyyyyyk.",
  "..kyyyyk..",
  "...kkkk...",
];
/** Spinning coin (horizontal squash). */
export const Coin: React.FC<{ px: number; frame: number }> = ({ px, frame }) => (
  <div style={{ transform: `scaleX(${Math.max(0.12, Math.abs(Math.cos(frame / 3)))})` }}>
    <Sprite rows={COIN} px={px} colors={{ k: "#7A4A00", y: "#FFD23F", w: "#FFFBE0" }} />
  </div>
);

/** Chunky pixel text with a hard drop shadow. */
export const PixelText: React.FC<{
  children: React.ReactNode;
  size: number;
  color?: string;
  shadow?: string;
  style?: React.CSSProperties;
}> = ({ children, size, color = "#fff", shadow = "#141414", style }) => (
  <div
    style={{
      fontFamily: PFONTS.pixel,
      fontSize: size,
      lineHeight: 1.35,
      color,
      textShadow: `${size / 6}px ${size / 6}px 0 ${shadow}`,
      WebkitFontSmoothing: "none",
      textAlign: "center",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Blocky cloud. */
export const Cloud: React.FC<{ x: number; y: number; px: number }> = ({ x, y, px }) => (
  <div style={{ position: "absolute", left: x, top: y }}>
    <Sprite
      px={px}
      colors={{ w: "#FFFFFF", s: "#CFE6FF" }}
      rows={[
        ".....wwww.......",
        "...wwwwwwww.....",
        "..wwwwwwwwwwww..",
        ".wwwwwwwwwwwwww.",
        "wwwwwwwwwwwwwwww",
        "swwwwwwwwwwwwwws",
        ".ssssssssssssss.",
      ]}
    />
  </div>
);

/** Scrolling brick ground, `scroll` in px. */
export const Ground: React.FC<{ y: number; scroll: number; tile?: number }> = ({ y, scroll, tile = 64 }) => {
  const off = -(scroll % tile);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, bottom: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: off,
          top: 0,
          width: 1080 + tile * 2,
          height: "100%",
          backgroundColor: "#C8641E",
          backgroundImage: `linear-gradient(#5A2A0A 4px, transparent 4px), linear-gradient(90deg, #5A2A0A 4px, transparent 4px)`,
          backgroundSize: `${tile}px ${tile / 2}px, ${tile}px ${tile}px`,
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 16, background: "#6BBF3A" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 16, height: 6, background: "#3E8A1E" }} />
    </div>
  );
};

/**
 * Pixel dissolve: big square cells pop in (progress 0→1 covers the frame).
 * Use reverse to reveal. Deterministic order from a seed.
 */
export const PixelWipe: React.FC<{ progress: number; color?: string; cell?: number; seed?: string }> = ({
  progress,
  color = "#141414",
  cell = 90,
  seed = "wipe",
}) => {
  if (progress <= 0) return null;
  const cols = Math.ceil(1080 / cell);
  const rows = Math.ceil(1920 / cell);
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // diagonal sweep + noise so it reads as a dissolve, not a grid
      const order = 0.55 * ((x / cols + y / rows) / 2) + 0.45 * random(`${seed}-${x}-${y}`);
      if (order < progress) {
        cells.push(
          <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={color} />,
        );
      }
    }
  }
  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} shapeRendering="crispEdges">
        {cells}
      </svg>
    </AbsoluteFill>
  );
};

/** Hard-edged pixel window frame (stepped corners). */
export const PixelFrame: React.FC<{ w: number; h: number; children: React.ReactNode; border?: string }> = ({
  w,
  h,
  children,
  border = "#FFFFFF",
}) => {
  const b = 10;
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <div style={{ position: "absolute", left: b, right: b, top: 0, bottom: 0, background: border }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: b, bottom: b, background: border }} />
      <div
        style={{
          position: "absolute",
          left: b,
          top: b,
          right: b,
          bottom: b,
          overflow: "hidden",
          background: "#000",
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          left: b * 2,
          top: h + 4,
          width: w - b * 2,
          height: b,
          background: "rgba(0,0,0,0.45)",
        }}
      />
    </div>
  );
};
