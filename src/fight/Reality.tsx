import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, EASE } from "../lib/anim";
import { APP, PFONTS } from "../promo/fonts";
import { BRAND, FB } from "./choreo";
import { POSES, Stick, mix } from "./rig";

/** The hard cut to what actually happened: one guy, one laptop, one email. Frames are local (0 = the cut). */
export const Reality: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const send = FB.send - FB.cut;
  const toastAt = FB.toast - FB.cut;
  const voAt = FB.emailVo - FB.cut;
  const typing = frame < send ? Math.floor(frame / 3) % 2 : 0;
  const pose =
    frame < send
      ? mix(POSES.type, POSES.sit, typing * 0.25)
      : mix(POSES.type, POSES.sit, interpolate(frame, [send, send + 10], [0, 1], CLAMP));
  const click = interpolate(frame, [send - 2, send, send + 3], [0, 1, 0], CLAMP);
  const plane = interpolate(frame, [send + 2, send + 18], [0, 1], { ...CLAMP, easing: EASE.whip });
  const toast = spring({ frame: frame - toastAt, fps, config: { damping: 13, stiffness: 200 } });
  const cursor = {
    x: interpolate(frame, [0, send - 6], [760, 712], { ...CLAMP, easing: EASE.ui }),
    y: interpolate(frame, [0, send - 6], [980, 905], { ...CLAMP, easing: EASE.ui }),
  };
  const sub = spring({ frame: frame - voAt, fps, config: { damping: 16, stiffness: 220 } });

  return (
    <AbsoluteFill style={{ background: "linear-gradient(#EFE8DC, #E2D8C8)" }}>
      {/* wall clock + window, quiet room */}
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 520,
          width: 110,
          height: 110,
          borderRadius: "50%",
          border: "6px solid #2A2A2A",
          background: "#F7F2E9",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 50,
            top: 18,
            width: 5,
            height: 38,
            background: "#2A2A2A",
            transformOrigin: "50% 100%",
            transform: "rotate(293deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 51,
            top: 8,
            width: 3,
            height: 48,
            background: "#2A2A2A",
            transformOrigin: "50% 100%",
            transform: "rotate(282deg)",
          }}
        />
      </div>
      {/* the email, zoomed in */}
      <div
        style={{
          position: "absolute",
          left: 300,
          top: 640,
          width: 560,
          background: "#fff",
          borderRadius: 22,
          boxShadow: "0 24px 50px -20px rgba(0,0,0,0.35)",
          fontFamily: PFONTS.app,
          color: "#1B1B1F",
          padding: "26px 30px",
          boxSizing: "border-box",
          transform: `translate(${plane * 40}px, ${-plane * 30}px) rotate(${plane * 6}deg) scale(${1 - plane * 0.9})`,
          opacity: 1 - plane,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 22, color: "#8A8A96" }}>To: my first client</div>
        <div style={{ fontWeight: 900, fontSize: 30, marginTop: 8 }}>Quick idea for you</div>
        <div style={{ fontWeight: 700, fontSize: 22, color: "#55555E", marginTop: 10, lineHeight: 1.35 }}>
          Hi, I can help with this. Want to try one small project?
        </div>
        <div
          style={{
            marginTop: 20,
            marginLeft: "auto",
            width: 150,
            height: 60,
            borderRadius: 30,
            background: "#2F6BFF",
            color: "#fff",
            fontWeight: 900,
            fontSize: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${1 - click * 0.08})`,
          }}
        >
          Send
        </div>
      </div>
      {/* paper plane */}
      {plane > 0 && plane < 1 ? (
        <svg
          width={90}
          height={90}
          viewBox="0 0 24 24"
          style={{
            position: "absolute",
            left: 640 + plane * 500,
            top: 880 - plane * 520,
            transform: `rotate(-30deg)`,
          }}
        >
          <path d="M2 12 L22 3 L15 22 L11 14 Z" fill="#2F6BFF" />
          <path d="M11 14 L22 3" stroke="#fff" strokeWidth={1.4} />
        </svg>
      ) : null}
      {frame < send + 4 ? (
        <svg
          width={60}
          height={70}
          viewBox="0 0 24 28"
          style={{ position: "absolute", left: cursor.x, top: cursor.y }}
        >
          <path
            d="M2 2 L2 22 L8 17 L12 26 L16 24 L12 15 L20 15 Z"
            fill="#111"
            stroke="#fff"
            strokeWidth={1.6}
          />
        </svg>
      ) : null}

      {/* desk, laptop, the hero */}
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 1230,
          height: 22,
          background: "#5A4636",
          borderRadius: 6,
        }}
      />
      {[180, 860].map((x) => (
        <div
          key={x}
          style={{ position: "absolute", left: x, top: 1252, width: 18, height: 150, background: "#5A4636" }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: 470,
          top: 1218,
          width: 200,
          height: 12,
          background: "#2A2A2E",
          borderRadius: 4,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 640,
          top: 1080,
          width: 12,
          height: 146,
          background: "#2A2A2E",
          borderRadius: 4,
          transform: "rotate(-14deg)",
          transformOrigin: "50% 100%",
        }}
      />
      {/* coffee */}
      <div
        style={{
          position: "absolute",
          left: 740,
          top: 1166,
          width: 52,
          height: 64,
          background: "#FAFAFA",
          border: "5px solid #2A2A2E",
          borderRadius: "0 0 14px 14px",
        }}
      />
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        {/* chair */}
        <path
          d="M300 1300 L420 1300 M310 1300 L310 1170 M360 1300 L360 1400"
          stroke="#2A2A2E"
          strokeWidth={12}
          strokeLinecap="round"
          fill="none"
        />
        <g transform="translate(380 1312) scale(1.45)">
          <Stick pose={pose} face={1} color="#151518" width={10} />
        </g>
      </svg>

      {/* app toast */}
      {frame >= toastAt ? (
        <div
          style={{
            position: "absolute",
            left: 110,
            right: 160,
            top: 400 + (1 - toast) * -200,
            opacity: Math.min(1, toast * 2),
            background: APP.bg,
            borderRadius: 30,
            padding: "22px 26px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            boxShadow: "0 24px 50px -16px rgba(0,0,0,0.45)",
            fontFamily: PFONTS.app,
          }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 20,
              background: APP.lime,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "none",
            }}
          >
            <svg width={44} height={44} viewBox="0 0 24 24">
              <path
                d="M5 12.5 L10 17.5 L19 7"
                stroke={APP.bg}
                strokeWidth={3.4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ color: "#fff" }}>
            <div style={{ fontWeight: 800, fontSize: 22, color: "#9AA3B5" }}>{BRAND} · now</div>
            <div style={{ fontWeight: 900, fontSize: 32 }}>Step complete</div>
            <div style={{ fontWeight: 800, fontSize: 24, color: APP.lime }}>
              Send your first pitch · +50 XP
            </div>
          </div>
        </div>
      ) : null}

      {/* deadpan subtitle */}
      {frame >= voAt ? (
        <div
          style={{
            position: "absolute",
            left: 90,
            right: 140,
            top: 1480,
            textAlign: "center",
            opacity: sub,
            transform: `translateY(${(1 - sub) * 14}px)`,
            fontFamily: PFONTS.app,
            fontWeight: 900,
            fontSize: 48,
            color: "#1B1B1F",
          }}
        >
          It was one email.
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
