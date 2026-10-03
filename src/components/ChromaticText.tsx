import React from "react";
import { COLORS } from "../theme";

type ChromaticTextProps = {
  children: React.ReactNode;
  /** px offset of the red/cyan layers */
  offset: number;
  /** radians; 0 = horizontal split */
  angle?: number;
  color?: string;
  /** "screen" for light text on dark, "multiply" for dark text on light */
  mode?: "screen" | "multiply";
  fringeOpacity?: number;
  style?: React.CSSProperties;
};

/** Text with offset red/cyan layers behind it: lens-style chromatic aberration. */
export const ChromaticText: React.FC<ChromaticTextProps> = ({
  children,
  offset,
  angle = 0,
  color = COLORS.bone,
  mode = "screen",
  fringeOpacity = 0.85,
  style,
}) => {
  const dx = Math.cos(angle) * offset;
  const dy = Math.sin(angle) * offset;
  const layer = (c: string, sx: number, sy: number): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    color: c,
    transform: `translate(${sx}px, ${sy}px)`,
    mixBlendMode: mode,
    opacity: fringeOpacity,
    pointerEvents: "none",
  });
  return (
    <div style={{ position: "relative", ...style }}>
      {Math.abs(offset) > 0.05 ? (
        <>
          <div aria-hidden style={layer(COLORS.fringeRed, -dx, -dy)}>
            {children}
          </div>
          <div aria-hidden style={layer(COLORS.fringeCyan, dx, dy)}>
            {children}
          </div>
        </>
      ) : null}
      <div style={{ position: "relative", color }}>{children}</div>
    </div>
  );
};
