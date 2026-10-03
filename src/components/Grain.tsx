import React from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { HEIGHT, WIDTH } from "../timeline";
import { useSafeId } from "../lib/ids";

type GrainProps = {
  /** Layer opacity. 0 renders nothing. */
  opacity: number;
  /** "screen" reads on dark frames, "overlay" on light UI surfaces. */
  blend?: "screen" | "overlay" | "soft-light" | "normal";
  /** feTurbulence base frequency: higher = finer grain. */
  frequency?: number;
  /** Contrast of the noise (slope of the transfer function). */
  contrast?: number;
  /** 0..1 amount of found-footage dust, hairs and scratches. */
  dust?: number;
  seed?: string;
};

/**
 * Animated film grain: SVG feTurbulence re-seeded every frame with Remotion's
 * deterministic random(), so every render is identical.
 */
export const Grain: React.FC<GrainProps> = ({
  opacity,
  blend = "screen",
  frequency = 0.82,
  contrast = 2.6,
  dust = 0,
  seed = "grain",
}) => {
  const frame = useCurrentFrame();
  const id = useSafeId("grain");
  if (opacity <= 0.002) return null;

  const turbSeed = Math.floor(random(`${seed}-${frame}`) * 10000);
  // Mid-grey sits at 0.5; shift it down so screen-blended grain doesn't lift blacks to grey.
  const intercept = blend === "screen" ? -contrast * 0.5 + 0.12 : 0.5 - contrast * 0.5;

  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: blend, pointerEvents: "none" }}>
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <filter id={id} x={0} y={0} width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={frequency}
            numOctaves={2}
            seed={turbSeed}
            stitchTiles="stitch"
          />
          {/* single channel → grey, alpha forced to 1 */}
          <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" />
          <feComponentTransfer>
            <feFuncR type="linear" slope={contrast} intercept={intercept} />
            <feFuncG type="linear" slope={contrast} intercept={intercept} />
            <feFuncB type="linear" slope={contrast} intercept={intercept} />
          </feComponentTransfer>
        </filter>
        <rect width={WIDTH} height={HEIGHT} filter={`url(#${id})`} />
      </svg>
      {dust > 0 ? <Dust amount={dust} seed={seed} frame={frame} /> : null}
    </AbsoluteFill>
  );
};

/** Dust specks, hairs and the odd vertical scratch: one-frame-only, seeded. */
const Dust: React.FC<{ amount: number; seed: string; frame: number }> = ({ amount, seed, frame }) => {
  const r = (k: string) => random(`${seed}-dust-${frame}-${k}`);
  const specks = Math.floor(r("n") * 7 * amount);
  const hair = r("hair") < 0.18 * amount;
  const scratch = r("scratch") < 0.22 * amount;
  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ position: "absolute", inset: 0 }}
    >
      {Array.from({ length: specks }).map((_, i) => (
        <ellipse
          key={i}
          cx={r(`x${i}`) * WIDTH}
          cy={r(`y${i}`) * HEIGHT}
          rx={1.5 + r(`rx${i}`) * 4}
          ry={1 + r(`ry${i}`) * 3}
          fill={r(`c${i}`) < 0.7 ? "#fff" : "#000"}
          opacity={0.35 + r(`o${i}`) * 0.5}
        />
      ))}
      {hair ? (
        <path
          d={`M ${r("hx") * WIDTH} ${r("hy") * HEIGHT} q ${30 + r("q1") * 60} ${-20 + r("q2") * 40} ${
            60 + r("q3") * 90
          } ${-30 + r("q4") * 60}`}
          stroke="#fff"
          strokeWidth={1.4}
          fill="none"
          opacity={0.5}
        />
      ) : null}
      {scratch ? (
        <rect
          x={r("sx") * WIDTH}
          y={0}
          width={1.3}
          height={HEIGHT}
          fill="#fff"
          opacity={0.12 + r("so") * 0.18}
        />
      ) : null}
    </svg>
  );
};
