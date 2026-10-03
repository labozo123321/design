import React from "react";
import { AbsoluteFill, interpolate, random } from "remotion";
import { HEIGHT, WIDTH } from "../timeline";
import { CLAMP } from "../lib/anim";
import { useSafeId } from "../lib/ids";

type InkBleedProps = {
  /** 0 = no ink, 1 = frame fully swallowed. */
  progress: number;
  origin: { x: number; y: number };
  seed?: string;
  color?: string;
  /** Wet rim colour just outside the ink edge. */
  rim?: string;
};

/**
 * Organic ink spreading from a point. Circles (a core, satellites, capillary
 * tendrils) are warped by low-frequency turbulence and fused with a gooey
 * blur/alpha-threshold, which turns geometry into liquid.
 */
export const InkBleed: React.FC<InkBleedProps> = ({
  progress,
  origin,
  seed = "ink",
  color = "#000",
  rim = "#2B0406",
}) => {
  const id = useSafeId("ink");
  if (progress <= 0) return null;
  const r = (k: string) => random(`${seed}-${k}`);

  const core = interpolate(progress, [0, 1], [0, 2500], CLAMP);

  const satellites = Array.from({ length: 16 }).map((_, i) => {
    const ang = r(`sa${i}`) * Math.PI * 2;
    const dist = 140 + r(`sd${i}`) * 820;
    const start = 0.04 + r(`ss${i}`) * 0.45;
    const size = 90 + r(`sr${i}`) * 380;
    return {
      x: origin.x + Math.cos(ang) * dist,
      y: origin.y + Math.sin(ang) * dist * 1.25,
      r: interpolate(progress, [start, start + 0.4], [0, size], CLAMP),
    };
  });

  const tendrils = Array.from({ length: 7 }).flatMap((_, t) => {
    let ang = r(`ta${t}`) * Math.PI * 2;
    let x = origin.x;
    let y = origin.y;
    const delay = r(`td${t}`) * 0.2;
    return Array.from({ length: 12 }).map((__, j) => {
      ang += (r(`tj${t}-${j}`) - 0.5) * 0.7;
      x += Math.cos(ang) * 70;
      y += Math.sin(ang) * 70;
      const at = delay + j * 0.035;
      return {
        x,
        y,
        r: interpolate(progress, [at, at + 0.12], [0, 26 + (12 - j) * 2.4], CLAMP),
      };
    });
  });

  const blobs = [{ x: origin.x, y: origin.y, r: core }, ...satellites, ...tendrils].filter((b) => b.r > 0.5);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <defs>
          <filter
            id={id}
            filterUnits="userSpaceOnUse"
            x={-200}
            y={-200}
            width={WIDTH + 400}
            height={HEIGHT + 400}
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.0065 0.0085"
              numOctaves={4}
              seed={Math.floor(r("turb") * 1000)}
              result="warp"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="warp"
              scale={190}
              xChannelSelector="R"
              yChannelSelector="B"
              result="warped"
            />
            <feGaussianBlur in="warped" stdDeviation={15} result="soft" />
            <feColorMatrix
              in="soft"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 32 -13"
              result="goo"
            />
            <feMorphology in="goo" operator="dilate" radius={6} result="rimShape" />
            <feFlood floodColor={rim} result="rimColor" />
            <feComposite in="rimColor" in2="rimShape" operator="in" result="rimLayer" />
            <feFlood floodColor={color} result="inkColor" />
            <feComposite in="inkColor" in2="goo" operator="in" result="inkLayer" />
            <feMerge>
              <feMergeNode in="rimLayer" />
              <feMergeNode in="inkLayer" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#${id})`}>
          {blobs.map((b, i) => (
            <circle key={i} cx={b.x} cy={b.y} r={b.r} fill="#000" />
          ))}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
