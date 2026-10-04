import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { SFONTS } from "../fonts";
import { Grain, useSpring } from "../kit";
import { seqDuration, wordAt } from "../timeline";

const C = {
  paper: "#F3E9D6",
  coral: "#E9765B",
  teal: "#2F8F89",
  mustard: "#E9B44C",
  navy: "#22324A",
  cream: "#FFF8EA",
  ink: "#1E1B18",
};
const SHADOW = "drop-shadow(0 7px 0 rgba(40,25,10,0.16)) drop-shadow(0 16px 18px rgba(40,25,10,0.18))";

/** Stop-motion feel: paper moves on twos, with a tiny hand-placed wobble per held frame. */
const useTwos = () => {
  const frame = useCurrentFrame();
  const f2 = Math.floor(frame / 2) * 2;
  const wob = (seed: number, amt = 1) => Math.sin(f2 * 0.9 + seed * 7.3) * amt;
  return { f2, wob };
};

const Pencil = () => (
  <g>
    <g transform="rotate(-38 100 100)">
      <rect x={40} y={82} width={110} height={36} fill={C.mustard} />
      <rect x={40} y={82} width={110} height={12} fill="#F4C96A" />
      <rect x={150} y={82} width={22} height={36} fill="#F2A3A3" />
      <rect x={146} y={82} width={8} height={36} fill="#B9B2A6" />
      <polygon points="40,82 10,100 40,118" fill={C.cream} />
      <polygon points="20,94 10,100 20,106" fill={C.ink} />
    </g>
  </g>
);
const Wrench = ({ bg }: { bg: string }) => (
  <g transform="rotate(40 100 100)">
    <rect x={88} y={70} width={24} height={110} rx={12} fill={C.cream} />
    <circle cx={100} cy={58} r={36} fill={C.cream} />
    <rect x={88} y={14} width={24} height={40} fill={bg} />
  </g>
);
const Pan = () => (
  <g>
    <rect x={128} y={92} width={66} height={18} rx={9} fill={C.ink} />
    <circle cx={92} cy={102} r={62} fill={C.ink} />
    <circle cx={92} cy={102} r={50} fill="#3A3431" />
    <path d="M60 96 C58 70 96 62 108 76 C126 70 132 104 114 116 C104 136 66 132 60 96 Z" fill={C.cream} />
    <circle cx={92} cy={98} r={15} fill={C.mustard} />
  </g>
);
const Book = () => (
  <g>
    <path d="M100 58 C80 46 44 46 24 54 L24 150 C44 142 80 142 100 154 Z" fill={C.cream} />
    <path d="M100 58 C120 46 156 46 176 54 L176 150 C156 142 120 142 100 154 Z" fill="#FBEFD8" />
    {[76, 92, 108, 124].map((y) => (
      <g key={y}>
        <rect x={38} y={y} width={48} height={6} rx={3} fill="#D9CDB6" />
        <rect x={114} y={y} width={48} height={6} rx={3} fill="#D9CDB6" />
      </g>
    ))}
  </g>
);

const CARDS = [
  { label: "design", bg: C.teal, icon: () => <Pencil />, rot: -5, x: 120, y: 760 },
  { label: "fix", bg: C.coral, icon: () => <Wrench bg={C.coral} />, rot: 4, x: 500, y: 720 },
  { label: "cook", bg: C.navy, icon: () => <Pan />, rot: 3, x: 140, y: 1100 },
  { label: "teach", bg: C.mustard, icon: () => <Book />, rot: -4, x: 520, y: 1070 },
];

/** 01 · Paper cutout: "You've got a skill." Four skills pop in as hand-cut cards, on the words. */
export const S1Paper: React.FC = () => {
  const frame = useCurrentFrame();
  const { f2, wob } = useTwos();
  const sp = useSpring();
  const id = "paper" as const;
  const push = 1 + (frame / seqDuration(id)) * 0.05;
  const hills = sp(0, { damping: 14, stiffness: 120 });
  const words = ["you've", "got", "a"];
  const skillAt = wordAt(id, 0, 3);

  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        {/* layered paper hills */}
        {[
          {
            c: C.mustard,
            y: 1500,
            d: "M0 120 C220 20 420 40 600 90 C780 140 920 60 1080 40 L1080 600 L0 600Z",
            k: 0,
          },
          {
            c: C.teal,
            y: 1560,
            d: "M0 60 C200 130 380 110 560 60 C740 10 900 70 1080 110 L1080 600 L0 600Z",
            k: 3,
          },
          {
            c: C.coral,
            y: 1640,
            d: "M0 90 C260 30 460 60 640 100 C820 140 960 90 1080 70 L1080 600 L0 600Z",
            k: 6,
          },
        ].map((h) => {
          const s = sp(h.k, { damping: 13, stiffness: 120 });
          return (
            <svg
              key={h.k}
              width={1080}
              height={600}
              style={{
                position: "absolute",
                left: 0,
                top: h.y + (1 - s) * 500 + wob(h.k, 2),
                filter: SHADOW,
              }}
            >
              <path d={h.d} fill={h.c} />
            </svg>
          );
        })}
        {/* sun */}
        <div
          style={{
            position: "absolute",
            left: 760,
            top: 230,
            width: 170,
            height: 170,
            borderRadius: "50%",
            background: C.mustard,
            transform: `scale(${hills}) rotate(${wob(2, 3)}deg)`,
            filter: SHADOW,
          }}
        />

        {/* headline: cut paper strips */}
        <div style={{ position: "absolute", left: 100, top: 300, display: "flex", gap: 18 }}>
          {words.map((w, i) => {
            const s = sp(wordAt(id, 0, i) - 2, { damping: 10, stiffness: 220 });
            return (
              <div
                key={w}
                style={{
                  padding: "10px 22px",
                  background: [C.cream, C.navy, C.cream][i],
                  color: [C.ink, C.cream, C.ink][i],
                  fontFamily: SFONTS.paper,
                  fontWeight: 700,
                  fontSize: 64,
                  transform: `translateY(${(1 - s) * -260}px) rotate(${[-4, 3, -2][i] + wob(i, 1.2)}deg)`,
                  opacity: frame >= wordAt(id, 0, i) - 3 ? 1 : 0,
                  filter: SHADOW,
                }}
              >
                {w}
              </div>
            );
          })}
        </div>
        <div
          style={{
            position: "absolute",
            left: 100,
            top: 420,
            display: "flex",
            gap: 10,
          }}
        >
          {"skill.".split("").map((ch, i) => {
            const s = sp(skillAt - 2 + i * 2, { damping: 9, stiffness: 240 });
            return (
              <div
                key={i}
                style={{
                  width: ch === "." ? 60 : 128,
                  height: 170,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: [C.coral, C.teal, C.mustard, C.navy, C.coral, C.teal][i],
                  color: C.cream,
                  fontFamily: SFONTS.paper,
                  fontWeight: 700,
                  fontSize: 140,
                  lineHeight: 1,
                  transform: `scale(${s}) rotate(${[-6, 4, -3, 5, -4, 3][i] + wob(i + 9, 1.5)}deg)`,
                  opacity: frame >= skillAt - 3 + i * 2 ? 1 : 0,
                  filter: SHADOW,
                }}
              >
                {ch}
              </div>
            );
          })}
        </div>

        {/* skill cards, one per spoken skill */}
        {CARDS.map((c, i) => {
          const at = wordAt(id, 1, i * 2 + 1) - 3;
          if (f2 < at) return null;
          const s = sp(at, { damping: 9, stiffness: 200 });
          return (
            <div
              key={c.label}
              style={{
                position: "absolute",
                left: c.x,
                top: c.y,
                width: 330,
                height: 300,
                background: c.bg,
                borderRadius: 18,
                transform: `translateY(${(1 - s) * 120}px) scale(${0.4 + 0.6 * s}) rotate(${c.rot + wob(i + 4, 1.4)}deg)`,
                filter: SHADOW,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <svg width={200} height={200} viewBox="0 0 200 200" style={{ marginTop: 14 }}>
                {c.icon()}
              </svg>
              <div
                style={{
                  marginTop: -4,
                  background: C.cream,
                  color: C.ink,
                  padding: "4px 20px",
                  fontFamily: SFONTS.paper,
                  fontWeight: 700,
                  fontSize: 44,
                  transform: `rotate(${-c.rot * 0.6}deg)`,
                }}
              >
                {c.label}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
      <Grain id="paper" opacity={0.35} />
    </AbsoluteFill>
  );
};
