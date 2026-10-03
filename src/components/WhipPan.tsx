import React from "react";
import { AbsoluteFill } from "remotion";
import { WIDTH } from "../timeline";
import { useSafeId } from "../lib/ids";

type WhipPanProps = {
  /** 0 = outgoing fully on screen, 1 = incoming fully on screen */
  progress: number;
  outgoing: React.ReactNode;
  incoming: React.ReactNode;
  /** peak horizontal blur in px */
  blur?: number;
  /** -1 = whip to the left (new frame enters from the right) */
  direction?: -1 | 1;
};

/** Directional (x-only) Gaussian blur via an SVG filter. */
const MotionBlurX: React.FC<{ amount: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  amount,
  children,
  style,
}) => {
  const id = useSafeId("whip");
  if (amount < 0.5) return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
  return (
    <AbsoluteFill style={style}>
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
        <filter id={id} x="-20%" y="0" width="140%" height="100%">
          <feGaussianBlur stdDeviation={`${amount} 0`} edgeMode="duplicate" />
        </filter>
      </svg>
      <AbsoluteFill style={{ filter: `url(#${id})` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Whip pan: both frames rip sideways with a directional motion blur. */
export const WhipPan: React.FC<WhipPanProps> = ({
  progress,
  outgoing,
  incoming,
  blur = 80,
  direction = -1,
}) => {
  const smear = Math.sin(Math.PI * Math.min(1, Math.max(0, progress))) * blur;
  const travel = WIDTH * 1.15;
  return (
    <AbsoluteFill>
      {progress < 1 ? (
        <MotionBlurX amount={smear} style={{ transform: `translateX(${direction * travel * progress}px)` }}>
          {outgoing}
        </MotionBlurX>
      ) : null}
      <MotionBlurX
        amount={smear}
        style={{ transform: `translateX(${-direction * travel * (1 - progress)}px)` }}
      >
        {incoming}
      </MotionBlurX>
    </AbsoluteFill>
  );
};
