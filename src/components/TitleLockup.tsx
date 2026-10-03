import React, { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { fitText } from "@remotion/layout-utils";
import { APP_NAME, COLORS } from "../theme";
import { FONTS, fontsReady } from "../fonts";

const WORDMARK_MAX_WIDTH = 760;
const WORDMARK_MAX_SIZE = 150;
const WORDMARK_TRACKING = "0.14em";

/** Measures APP_NAME once the serif is loaded, so any name fits the safe column. */
const useWordmarkSize = () => {
  const [size, setSize] = useState<number | null>(null);
  const [handle] = useState(() => delayRender("Fitting the wordmark"));
  useEffect(() => {
    let cancelled = false;
    fontsReady()
      .then(() => {
        if (cancelled) return;
        const { fontSize } = fitText({
          text: APP_NAME,
          withinWidth: WORDMARK_MAX_WIDTH,
          fontFamily: FONTS.serif,
          fontWeight: 400,
          letterSpacing: WORDMARK_TRACKING,
          textTransform: "uppercase",
        });
        setSize(Math.min(WORDMARK_MAX_SIZE, Math.floor(fontSize)));
      })
      .finally(() => continueRender(handle));
    return () => {
      cancelled = true;
    };
  }, [handle]);
  return size ?? WORDMARK_MAX_SIZE;
};

type TitleLockupProps = {
  /** 0..1 wordmark reveal (blur → sharp, tracking settles) */
  mark: number;
  /** 0..1 gold rules growing out from the centre */
  rules: number;
  /** 0..1 "COMING SOON" */
  tagline: number;
  /** centre line of the wordmark */
  y: number;
  /** horror trying to come back: swaps the tagline and bleeds the mark red */
  corrupt?: boolean;
};

/** Luxury lockup: gold serif wordmark between thin rules, small caps tagline. */
export const TitleLockup: React.FC<TitleLockupProps> = ({ mark, rules, tagline, y, corrupt = false }) => {
  const size = useWordmarkSize();
  const ruleW = 560;
  const ruleGap = size * 0.78;
  // Tracks out from tight to final, so the mark never grows past its fitted width.
  const tracking = 0.14 - (1 - mark) * 0.08;

  const rule = (top: number) => (
    <div style={{ position: "absolute", left: 540 - ruleW / 2, top, width: ruleW, height: 2 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scaleX(${rules})`,
          background: `linear-gradient(to right, rgba(200,161,90,0) 0%, ${COLORS.gold} 22%, ${COLORS.goldLight} 50%, ${COLORS.gold} 78%, rgba(200,161,90,0) 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: ruleW / 2 - 6,
          top: -5,
          width: 12,
          height: 12,
          transform: `rotate(45deg) scale(${Math.min(1, rules * 3)})`,
          background: COLORS.gold,
          boxShadow: "0 0 0 4px #000",
        }}
      />
    </div>
  );

  return (
    <>
      {rule(y - ruleGap)}
      <div
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: y,
          transform: `translateY(-50%) scale(${1.04 - 0.04 * mark})`,
          textAlign: "center",
          whiteSpace: "nowrap",
          fontFamily: FONTS.serif,
          fontSize: size,
          lineHeight: 1,
          letterSpacing: `${tracking}em`,
          paddingLeft: `${tracking}em`,
          textTransform: "uppercase",
          opacity: mark,
          filter: mark < 1 ? `blur(${(1 - mark) * 14}px)` : undefined,
        }}
      >
        <span
          style={{
            backgroundImage: corrupt
              ? `linear-gradient(180deg, #E0363C 0%, ${COLORS.blood} 100%)`
              : `linear-gradient(180deg, ${COLORS.goldLight} 0%, ${COLORS.gold} 48%, ${COLORS.goldDeep} 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {APP_NAME}
        </span>
      </div>
      {rule(y + ruleGap)}
      <div
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: y + ruleGap + 64,
          textAlign: "center",
          fontFamily: corrupt ? FONTS.serif : FONTS.sans,
          fontWeight: 500,
          fontSize: corrupt ? 44 : 29,
          letterSpacing: corrupt ? "0.02em" : `${0.55 + (1 - tagline) * 0.3}em`,
          paddingLeft: corrupt ? 0 : `${0.55 + (1 - tagline) * 0.3}em`,
          color: corrupt ? "#D9262C" : "rgba(237,230,218,0.82)",
          opacity: corrupt ? 1 : tagline,
          lineHeight: 1,
        }}
      >
        {corrupt ? "same life." : "COMING SOON"}
      </div>
    </>
  );
};
