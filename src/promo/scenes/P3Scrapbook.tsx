import React from "react";
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AppPhone, clipFrame, screenPoint } from "../components/AppScreen";
import { PixelWipe } from "../components/Pixel";
import { MarkerArrow, MarkerLoop, Paper, Sticker, Tape } from "../components/Scrapbook";
import { DEMO, P, PB } from "../timeline";
import { PFONTS } from "../fonts";
import { CLAMP, EASE, ramp } from "../../lib/anim";
import { P2Comic } from "./P2Comic";

const PHONE = { cx: 560, cy: 1000, scale: 0.8, angle: 3 };

const STICKERS: { text: React.ReactNode; bg: string; x: number; y: number; angle: number; color?: string }[] =
  [
    { text: "★ regular client", bg: "#F5A623", x: 420, y: 560, angle: 8 },
    { text: "names saved ✓", bg: "#88CC2D", x: 130, y: 1370, angle: -7 },
    { text: "zero awkward DMs", bg: "#FF5C8A", x: 420, y: 1490, angle: 5, color: "#fff" },
  ];

/** 390–570 · Scrapbook: the real Jobs screen taped down, a marker circles "Ask for a repeat". */
export const P3Scrapbook: React.FC<{ duration: number }> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slap = (at: number) =>
    spring({ frame: frame - at, fps, config: { damping: 10, stiffness: 260, mass: 0.6 } });

  const paperIn = interpolate(frame, [0, 9], [1, 0], { ...CLAMP, easing: EASE.ui });
  const drop = spring({ frame: frame - PB.phoneDrop, fps, config: { damping: 13, stiffness: 160 } });
  const src = clipFrame(frame, DEMO.jobs.from, DEMO.jobs.to, PB.scrapVideo, 0.6);
  const btn = screenPoint(DEMO.repeatButton.x, DEMO.repeatButton.y, PHONE);
  const head1 = slap(PB.headline);
  const head2 = slap(PB.headline + 15);

  return (
    <AbsoluteFill>
      {frame < 10 ? (
        <Sequence from={-P.comic.duration} layout="none">
          <P2Comic duration={P.comic.duration} />
        </Sequence>
      ) : null}

      <AbsoluteFill style={{ transform: `translateX(${paperIn * 1150}px) rotate(${paperIn * 6}deg)` }}>
        <Paper />
        {/* doodles */}
        <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
          <path
            d="M 860 330 l 18 38 l 42 6 l -30 30 l 8 42 l -38 -20 l -38 20 l 8 -42 l -30 -30 l 42 -6 z"
            fill="none"
            stroke="#F5A623"
            strokeWidth={6}
          />
          <path
            d="M 120 1180 q 40 -60 80 0 t 80 0 t 80 0"
            fill="none"
            stroke="#3BA3F5"
            strokeWidth={7}
            strokeLinecap="round"
          />
        </svg>

        {/* headline in marker */}
        <div
          style={{
            position: "absolute",
            left: 140,
            right: 140,
            top: 150,
            fontFamily: PFONTS.marker,
            color: "#141414",
          }}
        >
          <div
            style={{
              fontSize: 76,
              transform: `scale(${head1}) rotate(-3deg)`,
              transformOrigin: "left center",
            }}
          >
            got paid once?
          </div>
          <div
            style={{
              fontSize: 76,
              marginTop: 6,
              transform: `scale(${head2}) rotate(-2deg)`,
              transformOrigin: "left center",
            }}
          >
            get booked <span style={{ background: "#88CC2D", padding: "0 12px" }}>again.</span>
          </div>
        </div>

        {/* phone, taped */}
        <div
          style={{
            position: "absolute",
            left: PHONE.cx - 300,
            top: PHONE.cy - 620,
            transform: `translateY(${(1 - drop) * -1600}px) rotate(${PHONE.angle + (1 - drop) * -15}deg) scale(${PHONE.scale})`,
            filter: "drop-shadow(0 30px 30px rgba(60,40,20,0.35))",
          }}
        >
          <AppPhone srcFrame={src} />
          <Tape w={200} angle={-35} style={{ left: -70, top: 20 }} />
          <Tape w={200} angle={35} color="rgba(245,166,35,0.72)" style={{ right: -90, top: 30 }} />
        </div>

        <MarkerLoop
          cx={btn.x}
          cy={btn.y}
          rx={300}
          ry={72}
          progress={ramp(frame, PB.circle, PB.circle + 12, EASE.uiInOut)}
        />
        <MarkerArrow
          x1={250}
          y1={360}
          x2={btn.x - 230}
          y2={btn.y - 90}
          progress={ramp(frame, PB.circle + 6, PB.circle + 18, EASE.uiInOut)}
        />

        {STICKERS.map((s, i) => {
          const p = slap(PB.stickers[i]);
          if (frame < PB.stickers[i]) return null;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: s.x,
                top: s.y,
                transform: `scale(${1 + (1 - p) * 0.6})`,
                opacity: Math.min(1, p * 3),
              }}
            >
              <Sticker bg={s.bg} angle={s.angle} color={s.color}>
                {s.text}
              </Sticker>
            </div>
          );
        })}
      </AbsoluteFill>

      <PixelWipe
        progress={interpolate(frame, [PB.scrapWipe, PB.scrapWipe + 13], [0, 1], CLAMP)}
        color="#0E1119"
        seed="scrap-out"
      />
    </AbsoluteFill>
  );
};
