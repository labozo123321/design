import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP, EASE } from "../../lib/anim";
import { APP, PFONTS } from "../../promo/fonts";
import { useSpring } from "../kit";
import { lineAt, seqDuration, wordAt } from "../timeline";

/** One swatch per style we passed through, converging into the logo. */
const SWATCHES = [
  { c: "#E9765B", shape: "square", from: [-200, 300] },
  { c: "#0E3A70", shape: "square", from: [1250, 420], border: "#E8F1FF" },
  { c: "#D7392B", shape: "circle", from: [-180, 1500] },
  { c: "#FF48B0", shape: "circle", from: [1260, 1350] },
  { c: "#F2B33D", shape: "circle", from: [540, -200] },
];
const CENTER = { x: 540, y: 820 };

/** 06 · End card in the app's own look: "FourFig. Your side hustle, mapped." */
export const S6End: React.FC = () => {
  const frame = useCurrentFrame();
  const sp = useSpring();
  const id = "end" as const;
  const l0 = lineAt(id, 0);
  const l1 = lineAt(id, 1);
  const dur = seqDuration(id);
  const gather = interpolate(frame, [2, l0 + 2], [0, 1], { ...CLAMP, easing: EASE.uiInOut });
  const burst = sp(l0 + 2, { damping: 10, stiffness: 200 });
  const ring = interpolate(frame, [l0 + 2, l0 + 22], [0, 1], { ...CLAMP, easing: EASE.ui });
  const tag = (w: number) => sp(wordAt(id, 1, w) - 2, { damping: 14, stiffness: 220 });
  const pill = sp(l1 + 34, { damping: 10, stiffness: 220 });
  const mapDraw = interpolate(frame, [wordAt(id, 1, 3) - 4, wordAt(id, 1, 3) + 16], [0, 1], {
    ...CLAMP,
    easing: EASE.uiInOut,
  });
  const fadeOut = interpolate(frame, [dur - 8, dur], [1, 0], CLAMP);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 42%, #18202E 0%, ${APP.bg} 62%)`,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      {/* dotted map grid */}
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 2px, transparent 2px)",
          backgroundSize: "40px 40px",
        }}
      />
      {/* style swatches converge */}
      {burst < 0.98
        ? SWATCHES.map((s, i) => {
            const x = s.from[0] + (CENTER.x - s.from[0]) * gather;
            const y = s.from[1] + (CENTER.y - s.from[1]) * gather;
            const size = 120 * (1 - burst);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x - size / 2,
                  top: y - size / 2,
                  width: size,
                  height: size,
                  borderRadius: s.shape === "circle" ? "50%" : 16,
                  background: s.c,
                  border: s.border ? `4px solid ${s.border}` : undefined,
                  transform: `rotate(${frame * (i % 2 ? 6 : -6)}deg)`,
                }}
              />
            );
          })
        : null}
      {/* lime shock ring */}
      {ring > 0 && ring < 1 ? (
        <div
          style={{
            position: "absolute",
            left: CENTER.x - 500 * ring,
            top: CENTER.y - 500 * ring,
            width: 1000 * ring,
            height: 1000 * ring,
            borderRadius: "50%",
            border: `${14 * (1 - ring)}px solid ${APP.lime}`,
            opacity: 1 - ring,
          }}
        />
      ) : null}

      {/* wordmark */}
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 140,
          top: CENTER.y - 110,
          textAlign: "center",
          fontFamily: PFONTS.app,
          fontWeight: 900,
          fontSize: 190,
          letterSpacing: "-0.04em",
          color: "#fff",
          lineHeight: 1,
          transform: `scale(${burst})`,
          opacity: Math.min(1, burst * 2),
        }}
      >
        Four<span style={{ color: APP.lime }}>Fig</span>
      </div>

      {/* tagline with a little map route under "mapped" */}
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 140,
          top: CENTER.y + 140,
          textAlign: "center",
          fontFamily: PFONTS.app,
          fontWeight: 800,
          fontSize: 56,
          color: "#E8ECF4",
        }}
      >
        {["Your", "side", "hustle,", "mapped."].map((w, i) => (
          <span
            key={w}
            style={{
              display: "inline-block",
              marginRight: i < 3 ? 16 : 0,
              color: i === 3 ? APP.lime : undefined,
              opacity: tag(i),
              transform: `translateY(${(1 - tag(i)) * 30}px)`,
            }}
          >
            {w}
          </span>
        ))}
        <svg width={420} height={70} style={{ display: "block", margin: "6px auto 0" }}>
          <path
            d="M20 40 C80 10 120 60 180 34 S290 10 330 40 L392 30"
            stroke={APP.lime}
            strokeWidth={6}
            fill="none"
            strokeDasharray="2 14"
            strokeLinecap="round"
            opacity={mapDraw}
          />
          <circle cx={20} cy={40} r={9 * mapDraw} fill={APP.lime} />
          <circle cx={392} cy={30} r={12 * mapDraw} fill="#fff" stroke={APP.lime} strokeWidth={5} />
        </svg>
      </div>

      {/* coming soon */}
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 140,
          top: CENTER.y + 330,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: APP.lime,
            color: APP.bg,
            fontFamily: PFONTS.app,
            fontWeight: 900,
            fontSize: 40,
            letterSpacing: "0.08em",
            padding: "16px 40px",
            borderRadius: 999,
            boxShadow: `0 8px 0 ${APP.limeDark}`,
            transform: `scale(${pill})`,
          }}
        >
          COMING SOON
        </div>
      </div>
    </AbsoluteFill>
  );
};
