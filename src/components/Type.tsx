import React from "react";
import { interpolate } from "remotion";
import { CLAMP, EASE } from "../lib/anim";
import { TEXT_COLUMN } from "../theme";

/**
 * Absolutely positioned, horizontally centred text column that respects the
 * platform safe zones (140px each side keeps centred copy centred on frame).
 * `y` is the vertical centre of the block.
 */
export const TextColumn: React.FC<{
  y: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ y, children, style }) => (
  <div
    style={{
      position: "absolute",
      left: TEXT_COLUMN.left,
      right: TEXT_COLUMN.right,
      top: y,
      transform: "translateY(-50%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      ...style,
    }}
  >
    {children}
  </div>
);

type LetterRevealProps = {
  text: string;
  frame: number;
  /** frame the first letter starts */
  start: number;
  /** frames between letters */
  stagger: number;
  /** frames each letter takes to fade in */
  fade?: number;
  /** starting blur in px */
  blur?: number;
  style?: React.CSSProperties;
};

/** Letter-by-letter fade-in with a little blur, noir timing. */
export const LetterReveal: React.FC<LetterRevealProps> = ({
  text,
  frame,
  start,
  stagger,
  fade = 10,
  blur = 6,
  style,
}) => (
  <span style={{ whiteSpace: "pre", ...style }}>
    {[...text].map((ch, i) => {
      const p = interpolate(frame, [start + i * stagger, start + i * stagger + fade], [0, 1], {
        ...CLAMP,
        easing: EASE.noir,
      });
      return (
        <span
          key={i}
          style={{
            opacity: p,
            filter: blur > 0 && p < 1 ? `blur(${(1 - p) * blur}px)` : undefined,
          }}
        >
          {ch}
        </span>
      );
    })}
  </span>
);

type TypedTextProps = {
  text: string;
  /** characters currently visible (fractional ok) */
  visible: number;
  caret?: boolean;
  caretColor?: string;
  /** caret blink phase source */
  frame: number;
  /** keep the caret solid while typing */
  typing?: boolean;
  style?: React.CSSProperties;
};

/**
 * Typed text that keeps its final layout from frame one (hidden characters
 * still take up space), so centred copy doesn't drift while it types.
 */
export const TypedText: React.FC<TypedTextProps> = ({
  text,
  visible,
  caret = true,
  caretColor = "currentColor",
  frame,
  typing = true,
  style,
}) => {
  const n = Math.floor(visible);
  const blinkOn = typing || Math.floor(frame / 8) % 2 === 0;
  const chars = [...text];
  const caretEl = (
    <span
      style={{
        position: "absolute",
        right: -10,
        top: "8%",
        bottom: "4%",
        width: "0.075em",
        minWidth: 3,
        background: caretColor,
        opacity: caret && blinkOn ? 1 : 0,
        borderRadius: 2,
      }}
    />
  );
  return (
    <span style={{ position: "relative", whiteSpace: "pre-wrap", ...style }}>
      {n === 0 && caret ? (
        <span style={{ position: "relative", display: "inline-block", width: 0, height: "1em" }}>
          {caretEl}
        </span>
      ) : null}
      {chars.map((ch, i) => {
        const shown = i < n;
        const isLast = i === n - 1;
        if (ch === "\n") return <br key={i} />;
        return (
          <span key={i} style={{ opacity: shown ? 1 : 0, position: isLast ? "relative" : undefined }}>
            {ch}
            {isLast && caret ? caretEl : null}
          </span>
        );
      })}
    </span>
  );
};
