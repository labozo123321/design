import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AppVideo } from "../components/AppScreen";
import { Coin, Hero, PixelFrame, PixelText, PixelWipe, Sprite } from "../components/Pixel";
import { Cursor } from "../../components/Cursor";
import { DEMO, PB } from "../timeline";
import { CLAMP, EASE, ramp } from "../../lib/anim";
import { shake } from "../../lib/noise";

const COUCH = [
  "....pppppppppppp....",
  "...pppppppppppppp...",
  "..pppwwkppppwwkppp..",
  "..pppwwkppppwwkppp..",
  "..pppppppppppppppp..",
  "pp.ppppkkkkkkpppp.pp",
  "pppppppkppppkppppppp",
  "pppppppppppppppppppp",
  "pppPPPPPPPPPPPPPPppp",
  "pp..pppppppppppp..pp",
  "pp................pp",
  "kk................kk",
];

const WIN = { x: 160, y: 420, w: 760, h: 560 };
const APP_W = WIN.w - 20;
const APP_H = (APP_W * 1560) / 720;
const CROP_FROM = 0.6; // show only the neutral "log it" part of the Money tab
const BUTTON = { fx: 0.5, fy: 0.865 };
const GROUND = 1520;
const HERO = { x: 170, px: 9 };
const BOSS = { x: 600, y: GROUND - 12 * 14, px: 14 };
const FINAL = PB.tap;
const POOF = PB.tap + 18;

/** 570–720 · Pixel boss fight: hits on the beat, logging a win in the app lands the final blow. */
export const P4Boss: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hitsLanded = [...PB.hits, FINAL].filter((h) => frame >= h).length;
  const hp = Math.max(0, 100 - hitsLanded * 20);
  const lastHit = [...PB.hits, FINAL].filter((h) => frame >= h).pop() ?? -99;
  const sinceHit = frame - lastHit;
  const s = shake("boss", frame, sinceHit < 6 ? 14 * (1 - sinceHit / 6) : 0, 1.2);
  const xp = spring({ frame: frame - PB.xp, fps, config: { damping: 14, stiffness: 120 } });
  const defeated = spring({ frame: frame - PB.defeated, fps, config: { damping: 9, stiffness: 190 } });
  const button = {
    x: WIN.x + 10 + BUTTON.fx * APP_W,
    y: WIN.y + 10 + BUTTON.fy * APP_H - CROP_FROM * APP_H,
  };
  const cursorIn = ramp(frame, PB.tap - 14, PB.tap - 2, EASE.ui);

  return (
    <AbsoluteFill style={{ background: "#0E1119" }}>
      {/* twinkling pixel stars */}
      {Array.from({ length: 70 }).map((_, i) => {
        const tw = Math.sin(frame / 5 + i * 1.7) > 0.3;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: Math.floor(random(`st-x-${i}`) * 135) * 8,
              top: Math.floor(random(`st-y-${i}`) * 180) * 8,
              width: tw ? 8 : 4,
              height: tw ? 8 : 4,
              background: i % 7 === 0 ? "#88CC2D" : "#FFFFFF",
              opacity: 0.6,
            }}
          />
        );
      })}

      <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px)` }}>
        <PixelText
          size={50}
          color="#FFE14D"
          style={{
            position: "absolute",
            left: 140,
            right: 140,
            top: 120,
            opacity: Math.floor(frame / 8) % 4 === 3 ? 0.4 : 1,
          }}
        >
          BOSS MISSION
        </PixelText>
        <PixelText size={24} style={{ position: "absolute", left: 140, right: 140, top: 210 }}>
          VS. PROCRASTINATION
        </PixelText>
        {/* HP bar */}
        <div
          style={{
            position: "absolute",
            left: 160,
            top: 268,
            width: 760,
            height: 48,
            background: "#fff",
            padding: 6,
            boxSizing: "border-box",
          }}
        >
          <div style={{ width: "100%", height: "100%", background: "#2A0D12" }}>
            <div
              style={{
                width: `${interpolate(sinceHit, [0, 6], [hp + 20, hp], CLAMP)}%`,
                height: "100%",
                background: "#E8202A",
                maxWidth: "100%",
              }}
            />
          </div>
        </div>

        {/* the real app, in a pixel window */}
        <div style={{ position: "absolute", left: WIN.x, top: WIN.y }}>
          <PixelFrame w={WIN.w} h={WIN.h}>
            <div
              style={{ position: "absolute", left: 0, top: -CROP_FROM * APP_H, width: APP_W, height: APP_H }}
            >
              <AppVideo srcFrame={DEMO.addIncome} />
            </div>
          </PixelFrame>
        </div>
        {frame >= PB.tap && frame < PB.tap + 22 ? (
          <PixelText
            size={40}
            color="#88CC2D"
            style={{
              position: "absolute",
              left: button.x - 200,
              width: 400,
              top: button.y - 120 - (frame - PB.tap) * 4,
            }}
          >
            +250 XP
          </PixelText>
        ) : null}

        {/* XP + streak */}
        <div style={{ position: "absolute", left: 160, top: 1030, width: 760 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <PixelText size={26}>XP</PixelText>
            <div style={{ flex: 1, height: 34, background: "#fff", padding: 5, boxSizing: "border-box" }}>
              <div style={{ height: "100%", background: "#1C2433" }}>
                <div style={{ width: `${30 + 52 * xp}%`, height: "100%", background: "#88CC2D" }} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 18 }}>
            <Sprite
              px={6}
              colors={{ r: "#E8202A", o: "#F5A623", y: "#FFE14D" }}
              rows={[
                "...r....",
                "..rr..r.",
                ".rorr.rr",
                ".roorrro",
                "rooyooor",
                "rooyyoor",
                ".ooyyoo.",
                "..oooo..",
              ]}
            />
            <PixelText size={26} color="#F5A623">
              STREAK 12
            </PixelText>
          </div>
        </div>

        {/* hero vs couch */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: GROUND,
            bottom: 0,
            background: "#232B3D",
            borderTop: "8px solid #88CC2D",
          }}
        />
        {(() => {
          const j = [...PB.hits].find((h) => frame >= h - 8 && frame < h + 4);
          const lift = j !== undefined ? Math.sin(((frame - (j - 8)) / 12) * Math.PI) * 90 : 0;
          return (
            <div style={{ position: "absolute", left: HERO.x, top: GROUND - 16 * HERO.px - lift }}>
              <Hero frame={frame} jumping={lift > 2} px={HERO.px} />
            </div>
          );
        })()}
        {PB.hits.map((h) => {
          const t = (frame - (h - 8)) / 8;
          if (t < 0 || t > 1) return null;
          return (
            <div
              key={h}
              style={{
                position: "absolute",
                left: HERO.x + 120 + t * 420,
                top: GROUND - 220 - Math.sin(t * Math.PI) * 120,
              }}
            >
              <Coin px={6} frame={frame} />
            </div>
          );
        })}
        {frame < POOF ? (
          <div
            style={{
              position: "absolute",
              left: BOSS.x,
              top: BOSS.y,
              filter: sinceHit < 3 ? "brightness(4)" : undefined,
              transform: `translateX(${sinceHit < 6 ? (6 - sinceHit) * 3 : 0}px)`,
            }}
          >
            <Sprite
              rows={COUCH}
              px={BOSS.px}
              colors={{ p: "#7B4FD6", P: "#5A36A8", w: "#FFFFFF", k: "#141414" }}
            />
          </div>
        ) : frame < POOF + 14 ? (
          Array.from({ length: 10 }).map((_, i) => {
            const a = (i / 10) * Math.PI * 2;
            const r = (frame - POOF) * 14;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: BOSS.x + 140 + Math.cos(a) * r,
                  top: BOSS.y + 80 + Math.sin(a) * r,
                  width: 40,
                  height: 40,
                  background: "#D8D8E8",
                  opacity: 1 - (frame - POOF) / 14,
                }}
              />
            );
          })
        ) : null}
        {[...PB.hits, FINAL].map((h) =>
          frame >= h && frame < h + 14 ? (
            <PixelText
              key={h}
              size={34}
              color="#FF5C5C"
              style={{
                position: "absolute",
                left: BOSS.x + 60,
                width: 220,
                top: BOSS.y - 60 - (frame - h) * 5,
              }}
            >
              -20
            </PixelText>
          ) : null,
        )}
      </AbsoluteFill>

      <Cursor
        x={button.x + (1 - cursorIn) * 260}
        y={button.y + (1 - cursorIn) * 300}
        frame={frame}
        clicks={[PB.tap]}
        opacity={frame > PB.tap + 20 ? 0 : cursorIn}
        rippleColor="rgba(136,204,45,0.9)"
      />

      {frame >= PB.defeated ? (
        <div
          style={{
            position: "absolute",
            left: 140,
            right: 140,
            top: 700,
            display: "flex",
            justifyContent: "center",
            transform: `scale(${defeated})`,
          }}
        >
          <div
            style={{
              background: "#141414",
              border: "8px solid #FFE14D",
              padding: "26px 22px 18px",
              boxShadow: "12px 12px 0 rgba(0,0,0,0.5)",
            }}
          >
            <PixelText size={44} color="#FFE14D">
              BOSS
              <br />
              DEFEATED
            </PixelText>
          </div>
        </div>
      ) : null}

      <PixelWipe
        progress={1 - interpolate(frame, [0, 12], [0, 1], { ...CLAMP, easing: EASE.uiInOut })}
        color="#0E1119"
        seed="scrap-out"
      />
      <AbsoluteFill
        style={{ background: "#fff", opacity: interpolate(frame, [duration - 8, duration], [0, 1], CLAMP) }}
      />
    </AbsoluteFill>
  );
};
