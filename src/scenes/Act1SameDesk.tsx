import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { LetterReveal, TextColumn } from "../components/Type";
import { HEIGHT, WIDTH } from "../timeline";
import { COLORS } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE } from "../lib/anim";
import { useSafeId } from "../lib/ids";
import { SceneProps } from "./types";

/* One-point perspective corridor, built from projected rectangles. */
const VP = { x: 540, y: 790 };
const F = 800;
const HALF_W = 1.25;
const CEIL = -1.2;
const FLOOR = 1.5;
const Z_NEAR = 0.32;
const Z_FAR = 15;

type V = { x: number; y: number };
const P = (X: number, Y: number, Z: number): V => ({ x: VP.x + (X * F) / Z, y: VP.y + (Y * F) / Z });
const poly = (pts: V[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

/** Fluorescent panels, nearest first. */
const LIGHT_Z = Array.from({ length: 8 }).map((_, i) => 2.1 + i * 1.65);
const DOORS = [
  { side: -1, z: 3.6 },
  { side: 1, z: 5.4 },
  { side: -1, z: 7.9 },
  { side: 1, z: 10.2 },
  { side: -1, z: 12.4 },
];

/** Lights die from the far end toward the camera, each with a pre-death flicker. */
const FIRST_DEATH = 9;
const DEATH_GAP = 4;
export const lightLevel = (i: number, frame: number): number => {
  const die = FIRST_DEATH + (LIGHT_Z.length - 1 - i) * DEATH_GAP;
  if (frame >= die) return 0;
  if (frame >= die - 6) return random(`corridor-fl-${i}-${frame}`) > 0.5 ? 1 : 0.06;
  return random(`corridor-buzz-${i}-${frame}`) > 0.95 ? 0.6 : 1;
};

/** 135–180 · Noir corridor. The lights flicker out one by one toward camera. */
export const Act1SameDesk: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const poolId = useSafeId("pool");
  const panelGlow = useSafeId("panel-glow");
  const wallL = useSafeId("wall-l");
  const wallR = useSafeId("wall-r");
  const floorG = useSafeId("floor");
  const ceilG = useSafeId("ceil");

  const levels = LIGHT_Z.map((_, i) => lightLevel(i, frame));
  const push = interpolate(frame, [0, duration], [1, 1.08], { ...CLAMP, easing: EASE.noir });
  // Ambient bounce dies with the lights.
  const ambient = levels.reduce((a, l, i) => a + l * (1 - i * 0.08), 0) / LIGHT_Z.length;
  const textLight = Math.max(levels[0], levels[1] * 0.85);

  const nearL = [
    P(-HALF_W, CEIL, Z_NEAR),
    P(-HALF_W, CEIL, Z_FAR),
    P(-HALF_W, FLOOR, Z_FAR),
    P(-HALF_W, FLOOR, Z_NEAR),
  ];
  const nearR = [
    P(HALF_W, CEIL, Z_NEAR),
    P(HALF_W, CEIL, Z_FAR),
    P(HALF_W, FLOOR, Z_FAR),
    P(HALF_W, FLOOR, Z_NEAR),
  ];
  const floor = [
    P(-HALF_W, FLOOR, Z_NEAR),
    P(HALF_W, FLOOR, Z_NEAR),
    P(HALF_W, FLOOR, Z_FAR),
    P(-HALF_W, FLOOR, Z_FAR),
  ];
  const ceil = [
    P(-HALF_W, CEIL, Z_NEAR),
    P(HALF_W, CEIL, Z_NEAR),
    P(HALF_W, CEIL, Z_FAR),
    P(-HALF_W, CEIL, Z_FAR),
  ];
  const back = [
    P(-HALF_W, CEIL, Z_FAR),
    P(HALF_W, CEIL, Z_FAR),
    P(HALF_W, FLOOR, Z_FAR),
    P(-HALF_W, FLOOR, Z_FAR),
  ];

  // The desk waiting at the end of the hall.
  const deskZ = 14.2;
  const desk = {
    top: [
      P(-0.55, 0.72, deskZ - 0.3),
      P(0.55, 0.72, deskZ - 0.3),
      P(0.55, 0.72, deskZ + 0.3),
      P(-0.55, 0.72, deskZ + 0.3),
    ],
    front: [
      P(-0.55, 0.72, deskZ - 0.3),
      P(0.55, 0.72, deskZ - 0.3),
      P(0.55, 0.8, deskZ - 0.3),
      P(-0.55, 0.8, deskZ - 0.3),
    ],
    legL: [
      P(-0.5, 0.8, deskZ - 0.3),
      P(-0.44, 0.8, deskZ - 0.3),
      P(-0.44, FLOOR, deskZ - 0.3),
      P(-0.5, FLOOR, deskZ - 0.3),
    ],
    legR: [
      P(0.44, 0.8, deskZ - 0.3),
      P(0.5, 0.8, deskZ - 0.3),
      P(0.5, FLOOR, deskZ - 0.3),
      P(0.44, FLOOR, deskZ - 0.3),
    ],
    screen: [P(-0.26, 0.22, deskZ), P(0.26, 0.22, deskZ), P(0.26, 0.64, deskZ), P(-0.26, 0.64, deskZ)],
    stand: [P(-0.03, 0.64, deskZ), P(0.03, 0.64, deskZ), P(0.03, 0.72, deskZ), P(-0.03, 0.72, deskZ)],
    chairBack: [
      P(-0.2, 0.35, deskZ - 0.75),
      P(0.2, 0.35, deskZ - 0.75),
      P(0.2, 0.95, deskZ - 0.75),
      P(-0.2, 0.95, deskZ - 0.75),
    ],
    chairPost: [
      P(-0.03, 0.95, deskZ - 0.75),
      P(0.03, 0.95, deskZ - 0.75),
      P(0.03, FLOOR, deskZ - 0.75),
      P(-0.03, FLOOR, deskZ - 0.75),
    ],
  };

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `${VP.x}px ${VP.y}px` }}>
        <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <defs>
            <radialGradient id={poolId}>
              <stop offset="0%" stopColor={COLORS.bone} stopOpacity={1} />
              <stop offset="45%" stopColor={COLORS.bone} stopOpacity={0.38} />
              <stop offset="100%" stopColor={COLORS.bone} stopOpacity={0} />
            </radialGradient>
            <filter id={panelGlow} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation={14} />
            </filter>
            <linearGradient id={wallL} x1={0} y1={0} x2={VP.x} y2={0} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1E1D1B" />
              <stop offset="100%" stopColor="#070707" />
            </linearGradient>
            <linearGradient id={wallR} x1={WIDTH} y1={0} x2={VP.x} y2={0} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1A1918" />
              <stop offset="100%" stopColor="#070707" />
            </linearGradient>
            <linearGradient id={floorG} x1={0} y1={HEIGHT} x2={0} y2={VP.y} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#161615" />
              <stop offset="100%" stopColor="#060606" />
            </linearGradient>
            <linearGradient id={ceilG} x1={0} y1={0} x2={0} y2={VP.y} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#141413" />
              <stop offset="100%" stopColor="#050505" />
            </linearGradient>
          </defs>

          {/* shell, dimmed by the dying ambient light */}
          <g opacity={0.25 + 0.75 * ambient}>
            <polygon points={poly(ceil)} fill={`url(#${ceilG})`} />
            <polygon points={poly(floor)} fill={`url(#${floorG})`} />
            <polygon points={poly(nearL)} fill={`url(#${wallL})`} />
            <polygon points={poly(nearR)} fill={`url(#${wallR})`} />
            <polygon points={poly(back)} fill="#0C0C0B" />
            {/* the far light washes the back wall, so the desk reads as a silhouette */}
            <polygon
              points={poly(back)}
              fill={COLORS.bone}
              opacity={0.32 * levels[LIGHT_Z.length - 1] + 0.05}
            />
            {DOORS.map((d, i) => {
              const X = d.side * HALF_W;
              const door = [
                P(X, -0.35, d.z),
                P(X, -0.35, d.z + 0.85),
                P(X, FLOOR, d.z + 0.85),
                P(X, FLOOR, d.z),
              ];
              const frameOuter = [
                P(X, -0.45, d.z - 0.08),
                P(X, -0.45, d.z + 0.93),
                P(X, FLOOR, d.z + 0.93),
                P(X, FLOOR, d.z - 0.08),
              ];
              // long hard shadow thrown across the floor by the door frame
              const shadow = [
                P(X, FLOOR, d.z + 0.85),
                P(X, FLOOR, d.z + 0.93),
                P(-X * 0.2, FLOOR, d.z + 1.9),
                P(-X * 0.2, FLOOR, d.z + 1.6),
              ];
              return (
                <g key={i}>
                  <polygon points={poly(frameOuter)} fill="#232220" />
                  <polygon points={poly(door)} fill="#090909" />
                  <polygon points={poly(shadow)} fill="#000" opacity={0.75} />
                </g>
              );
            })}
            {/* edges */}
            {[
              [P(-HALF_W, CEIL, Z_NEAR), P(-HALF_W, CEIL, Z_FAR)],
              [P(HALF_W, CEIL, Z_NEAR), P(HALF_W, CEIL, Z_FAR)],
              [P(-HALF_W, FLOOR, Z_NEAR), P(-HALF_W, FLOOR, Z_FAR)],
              [P(HALF_W, FLOOR, Z_NEAR), P(HALF_W, FLOOR, Z_FAR)],
            ].map(([a, b], i) => (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2E2C29" strokeWidth={2} />
            ))}
          </g>

          {/* light pools on floor, walls and ceiling */}
          <g style={{ mixBlendMode: "screen" }}>
            {LIGHT_Z.map((z, i) => {
              const L = levels[i];
              if (L <= 0) return null;
              const fall = 1 - i * 0.06;
              const floorC = P(0, FLOOR, z);
              const ceilC = P(0, CEIL, z);
              const wallLC = P(-HALF_W, 0.2, z);
              const wallRC = P(HALF_W, 0.2, z);
              return (
                <g key={i} opacity={L * fall}>
                  <ellipse
                    cx={floorC.x}
                    cy={floorC.y}
                    rx={(1.35 * F) / z}
                    ry={(1.25 * FLOOR * F) / (z * z)}
                    fill={`url(#${poolId})`}
                    opacity={0.55}
                  />
                  {/* polished floor: a soft reflection of the panel */}
                  <ellipse
                    cx={floorC.x}
                    cy={floorC.y}
                    rx={(0.32 * F) / z}
                    ry={(0.5 * FLOOR * F) / (z * z)}
                    fill={`url(#${poolId})`}
                    opacity={0.45}
                  />
                  <ellipse
                    cx={ceilC.x}
                    cy={ceilC.y}
                    rx={(1.05 * F) / z}
                    ry={(0.9 * -CEIL * F) / (z * z)}
                    fill={`url(#${poolId})`}
                    opacity={0.42}
                  />
                  <ellipse
                    cx={wallLC.x}
                    cy={wallLC.y}
                    rx={(1.1 * HALF_W * F) / (z * z)}
                    ry={(1.7 * F) / z}
                    fill={`url(#${poolId})`}
                    opacity={0.34}
                  />
                  <ellipse
                    cx={wallRC.x}
                    cy={wallRC.y}
                    rx={(1.1 * HALF_W * F) / (z * z)}
                    ry={(1.7 * F) / z}
                    fill={`url(#${poolId})`}
                    opacity={0.34}
                  />
                </g>
              );
            })}
          </g>

          {/* the desk, silhouetted under the last light */}
          <g fill="#030303" opacity={0.6 + 0.4 * levels[LIGHT_Z.length - 1]}>
            {Object.values(desk).map((q, i) => (
              <polygon key={i} points={poly(q)} />
            ))}
          </g>

          {/* fluorescent panels */}
          {LIGHT_Z.map((z, i) => {
            const panel = [
              P(-0.32, CEIL, z - 0.38),
              P(0.32, CEIL, z - 0.38),
              P(0.32, CEIL, z + 0.38),
              P(-0.32, CEIL, z + 0.38),
            ];
            const L = levels[i];
            return (
              <g key={i}>
                <polygon points={poly(panel)} fill="#1C1B1A" />
                {L > 0 ? (
                  <>
                    <polygon
                      points={poly(panel)}
                      fill={COLORS.bone}
                      opacity={0.85 * L}
                      filter={`url(#${panelGlow})`}
                    />
                    <polygon points={poly(panel)} fill="#F7F3EC" opacity={L} />
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
      </AbsoluteFill>

      <TextColumn y={1410} style={{ opacity: textLight }}>
        <LetterReveal
          text="same desk"
          frame={frame}
          start={5}
          stagger={2}
          fade={9}
          style={{ fontFamily: FONTS.serif, fontSize: 112, color: COLORS.bone }}
        />
      </TextColumn>
    </AbsoluteFill>
  );
};
