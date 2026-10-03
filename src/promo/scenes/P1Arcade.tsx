import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CoinBlock, Coin, Cloud, Ground, Hero, PixelText, PixelWipe } from "../components/Pixel";
import { PB } from "../timeline";
import { CLAMP, ramp } from "../../lib/anim";

const GROUND_Y = 1500;
const PX = 10;
const HERO_X = 300;
const HERO_H = 16 * PX;
const JUMP_H = 230;
const SPEED = 12;
const BLOCK_PX = 7;
const BLOCK = 16 * BLOCK_PX;
const BLOCK_Y = GROUND_Y - HERO_H - JUMP_H - BLOCK;

/** Hero height off the ground: up 6 frames into the hit, down 8 after. */
const jumpLift = (f: number) => {
  for (const j of PB.jumps) {
    const d = f - (j - 6);
    if (d >= 0 && d <= 14) {
      const p = d <= 6 ? d / 6 : 1 - (d - 6) / 8;
      return JUMP_H * (1 - (1 - p) * (1 - p));
    }
  }
  return 0;
};

/** 0–150 · 8-bit intro: PRESS START, hero runs and head-bumps "$" blocks on the beat. */
export const P1Arcade: React.FC<{ duration: number }> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const running = frame >= PB.pressStart;
  const scroll = Math.max(0, frame - PB.pressStart) * SPEED;
  const lift = jumpLift(frame);
  const coins = PB.jumps.filter((j) => frame >= j).length;
  const banner = spring({ frame: frame - PB.unlocked, fps, config: { damping: 9, stiffness: 180 } });

  const line = (at: number) => spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 220 } });

  return (
    <AbsoluteFill style={{ background: "linear-gradient(#4FA0FF, #9ED2FF 70%)" }}>
      {/* parallax clouds + hills */}
      <Cloud x={120 - scroll * 0.2} y={360} px={10} />
      <Cloud x={720 - scroll * 0.2} y={260} px={8} />
      <Cloud x={1300 - scroll * 0.2} y={420} px={9} />
      {[0, 1, 2, 3].map((i) => {
        const x = ((((i * 520 - scroll * 0.5) % 2080) + 2080) % 2080) - 400;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: GROUND_Y - 260 + (i % 2) * 70,
              width: 420,
              height: 420,
              background: i % 2 ? "#3E9A2E" : "#4FB33A",
              clipPath:
                "polygon(0% 100%, 20% 40%, 30% 30%, 40% 18%, 50% 14%, 60% 18%, 70% 30%, 80% 40%, 100% 100%)",
            }}
          />
        );
      })}
      <Ground y={GROUND_Y} scroll={scroll} />

      {/* "$" blocks scroll in so each sits over the hero on its beat */}
      {PB.jumps.map((j) => {
        const x = HERO_X + 8 + (j - frame) * SPEED - (BLOCK - 12 * PX) / 2;
        if (x < -200 || x > 1200) return null;
        const hit = frame >= j;
        const bump = hit && frame - j < 6 ? Math.sin(((frame - j) / 6) * Math.PI) * 20 : 0;
        const coinT = frame - j;
        return (
          <React.Fragment key={j}>
            <div style={{ position: "absolute", left: x, top: BLOCK_Y - bump }}>
              <CoinBlock px={BLOCK_PX} used={hit} />
            </div>
            {coinT >= 0 && coinT < 16 ? (
              <div
                style={{
                  position: "absolute",
                  left: x + BLOCK / 2 - 35,
                  top: BLOCK_Y - 90 - Math.sin((coinT / 16) * Math.PI) * 170,
                  opacity: coinT > 12 ? 0 : 1,
                }}
              >
                <Coin px={7} frame={coinT} />
                <PixelText size={28} color="#FFE14D" style={{ position: "absolute", left: 80, top: 0 }}>
                  +1
                </PixelText>
              </div>
            ) : null}
          </React.Fragment>
        );
      })}

      <div style={{ position: "absolute", left: HERO_X, top: GROUND_Y - HERO_H - lift }}>
        <Hero frame={running ? frame : 0} jumping={lift > 4} px={PX} />
      </div>

      {/* HUD */}
      <div
        style={{
          position: "absolute",
          left: 100,
          right: 150,
          top: 110,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <PixelText size={30} style={{ textAlign: "left" }}>
          COINS
          <br />
          <span style={{ color: "#FFE14D" }}>×{String(coins).padStart(2, "0")}</span>
        </PixelText>
        <PixelText size={30}>
          STAGE
          <br />1
        </PixelText>
        <PixelText size={30} style={{ textAlign: "right" }}>
          TIME
          <br />
          {String(Math.max(0, 365 - Math.floor(frame / 3))).padStart(3, "0")}
        </PixelText>
      </div>

      {/* PRESS START */}
      {frame < PB.pressStart ? (
        <PixelText
          size={58}
          color="#FFFFFF"
          style={{
            position: "absolute",
            left: 140,
            right: 140,
            top: 820,
            opacity: Math.floor(frame / 7) % 2 ? 1 : 0.15,
          }}
        >
          PRESS START
        </PixelText>
      ) : null}

      {/* the hook */}
      <div
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: 520,
          opacity: 1 - ramp(frame, PB.unlocked - 3, PB.unlocked + 3),
        }}
      >
        <PixelText size={50} style={{ transform: `scale(${line(PB.lineDay)})` }}>
          9 TO 5
          <br />
          BY DAY.
        </PixelText>
        <PixelText
          size={50}
          color="#FFE14D"
          style={{ marginTop: 40, transform: `scale(${line(PB.lineNight)})` }}
        >
          SIDE QUEST
          <br />
          BY NIGHT.
        </PixelText>
      </div>

      {frame >= PB.unlocked ? (
        <div
          style={{
            position: "absolute",
            left: 140,
            right: 140,
            top: 600,
            display: "flex",
            justifyContent: "center",
            transform: `scale(${banner}) rotate(${(1 - banner) * -12}deg)`,
          }}
        >
          <div
            style={{
              background: "#141414",
              border: "8px solid #FFE14D",
              padding: "22px 24px 14px",
              boxShadow: "12px 12px 0 rgba(0,0,0,0.35)",
            }}
          >
            <PixelText size={40} color="#88CC2D" shadow="#000">
              QUEST
              <br />
              UNLOCKED
            </PixelText>
          </div>
        </div>
      ) : null}

      <PixelWipe
        progress={interpolate(frame, [PB.arcadeWipe, PB.arcadeWipe + 13], [0, 1], CLAMP)}
        seed="arcade-out"
      />
    </AbsoluteFill>
  );
};
