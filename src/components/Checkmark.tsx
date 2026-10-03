import React from "react";

const CHECK = { d: "M 26 52 L 43 69 L 76 34", len: Math.hypot(17, 17) + Math.hypot(33, 35) };

/** Stroke-drawn checkmark in a 100×100 box. */
export const CheckPath: React.FC<{
  progress: number;
  color: string;
  width?: number;
}> = ({ progress, color, width = 9 }) => (
  <path
    d={CHECK.d}
    fill="none"
    stroke={color}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeDasharray={CHECK.len}
    strokeDashoffset={CHECK.len * (1 - Math.min(1, Math.max(0, progress)))}
  />
);

type CircleCheckProps = {
  size: number;
  /** 0..1 ring draws around */
  ring: number;
  /** 0..1 disc fills (scale) */
  fill: number;
  /** 0..1 check draws */
  check: number;
  color: string;
  checkColor?: string;
  ringColor?: string;
  style?: React.CSSProperties;
};

/** Circle + checkmark: ring draws, disc fills, check strokes on. */
export const CircleCheck: React.FC<CircleCheckProps> = ({
  size,
  ring,
  fill,
  check,
  color,
  checkColor = "#fff",
  ringColor,
  style,
}) => {
  const C = 2 * Math.PI * 46;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible", ...style }}>
      <circle
        cx={50}
        cy={50}
        r={46}
        fill="none"
        stroke={ringColor ?? color}
        strokeWidth={3}
        strokeDasharray={C}
        strokeDashoffset={C * (1 - ring)}
        transform="rotate(-90 50 50)"
        strokeLinecap="round"
      />
      <circle cx={50} cy={50} r={42 * fill} fill={color} />
      <CheckPath progress={check} color={checkColor} />
    </svg>
  );
};
