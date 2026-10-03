import React from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { HEIGHT, WIDTH } from "../timeline";
import { useSafeId } from "../lib/ids";

type GlitchSliceProps = {
  children: React.ReactNode;
  /** 0 = untouched (children render once, no filter). 1 = heavy corruption. */
  intensity: number;
  seed?: string;
  /** Hold each corrupted state for N frames (glitch is a step function). */
  hold?: number;
  /** Max horizontal slice displacement in px at intensity 1. */
  maxShift?: number;
  /** RGB split in px at intensity 1. */
  rgb?: number;
  /** Allow pixel-block mosaic patches. */
  mosaic?: boolean;
  /** Opaque backing so the channel split never eats into transparency. */
  background?: string;
  style?: React.CSSProperties;
};

const DISP_SCALE = 520; // flood colour 0..255 ↔ ±260px of displacement

const toByte = (shift: number) => Math.round(Math.min(255, Math.max(0, 255 * (shift / DISP_SCALE + 0.5))));

/**
 * Data-corruption wrapper. A single SVG filter does all of it in one pass:
 *  1. horizontal slice displacement (feDisplacementMap driven by a map of
 *     flood-filled bands),
 *  2. RGB split (red and green/blue separated and offset),
 *  3. pixel-block mosaic patches (sample grid + morphology dilate).
 */
export const GlitchSlice: React.FC<GlitchSliceProps> = ({
  children,
  intensity,
  seed = "glitch",
  hold = 1,
  maxShift = 170,
  rgb = 16,
  mosaic = true,
  background = "#000",
  style,
}) => {
  const frame = useCurrentFrame();
  const id = useSafeId("glitch");

  if (intensity <= 0.001) {
    return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
  }

  const k = Math.floor(frame / hold);
  const r = (key: string) => random(`${seed}-${k}-${key}`);

  // Bands of random height; a share of them displaced.
  const bands: { y: number; h: number; shift: number }[] = [];
  let y = 0;
  let i = 0;
  while (y < HEIGHT) {
    const h = Math.min(HEIGHT - y, 14 + r(`h${i}`) ** 2 * 240);
    const displaced = r(`p${i}`) < 0.25 + 0.5 * intensity;
    const shift = displaced ? (r(`s${i}`) * 2 - 1) * maxShift * intensity : 0;
    bands.push({ y, h, shift });
    y += h;
    i += 1;
  }

  const blocks =
    mosaic && r("mosaic") < 0.35 + 0.6 * intensity
      ? Array.from({ length: 1 + Math.floor(r("mcount") * 2.5 * intensity) }).map((_, b) => {
          const w = 160 + r(`mw${b}`) * 520;
          const h = 60 + r(`mh${b}`) * 260;
          return {
            x: Math.round(r(`mx${b}`) * (WIDTH - w)),
            y: Math.round(220 + r(`my${b}`) * (HEIGHT - 520 - h)),
            w: Math.round(w),
            h: Math.round(h),
            cell: [20, 28, 36, 48][Math.floor(r(`mc${b}`) * 4)],
          };
        })
      : [];

  const split = rgb * intensity * (0.6 + 0.8 * r("rgb"));

  return (
    <AbsoluteFill style={style}>
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter
            id={id}
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={WIDTH}
            height={HEIGHT}
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodColor="rgb(128,128,0)" x={0} y={0} width={WIDTH} height={HEIGHT} result="base" />
            {bands.map((b, n) =>
              b.shift === 0 ? null : (
                <feFlood
                  key={n}
                  x={0}
                  y={b.y}
                  width={WIDTH}
                  height={b.h}
                  floodColor={`rgb(${toByte(b.shift)},128,0)`}
                  result={`band${n}`}
                />
              ),
            )}
            <feMerge result="map">
              <feMergeNode in="base" />
              {bands.map((b, n) => (b.shift === 0 ? null : <feMergeNode key={n} in={`band${n}`} />))}
            </feMerge>
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={DISP_SCALE}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feColorMatrix
              in="displaced"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="red"
            />
            <feOffset in="red" dx={-split} dy={0} result="redShift" />
            <feColorMatrix
              in="displaced"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"
              result="cyan"
            />
            <feOffset in="cyan" dx={split} dy={0} result="cyanShift" />
            <feComposite
              in="redShift"
              in2="cyanShift"
              operator="arithmetic"
              k1={0}
              k2={1}
              k3={1}
              k4={0}
              result="split"
            />
            {blocks.map((b, n) => (
              <React.Fragment key={n}>
                <feFlood
                  x={b.x + b.cell / 2}
                  y={b.y + b.cell / 2}
                  width={2}
                  height={2}
                  floodColor="#000"
                  result={`dot${n}`}
                />
                <feComposite
                  in={`dot${n}`}
                  in2={`dot${n}`}
                  operator="over"
                  x={b.x}
                  y={b.y}
                  width={b.cell}
                  height={b.cell}
                  result={`cell${n}`}
                />
                <feTile in={`cell${n}`} x={b.x} y={b.y} width={b.w} height={b.h} result={`grid${n}`} />
                <feComposite
                  in="split"
                  in2={`grid${n}`}
                  operator="in"
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  result={`samples${n}`}
                />
                <feMorphology
                  in={`samples${n}`}
                  operator="dilate"
                  radius={b.cell / 2}
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  result={`mosaic${n}`}
                />
              </React.Fragment>
            ))}
            <feMerge>
              <feMergeNode in="split" />
              {blocks.map((_, n) => (
                <feMergeNode key={n} in={`mosaic${n}`} />
              ))}
            </feMerge>
          </filter>
        </defs>
      </svg>
      <AbsoluteFill style={{ filter: `url(#${id})`, background }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
