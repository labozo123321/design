import React, { useMemo } from "react";
import * as THREE from "three";
import { DMD_FRAG, DMD_VERT, DmdLine, dmdTexture } from "./Dmd";
import { std, wood } from "./mats";
import { LAY } from "./timeline";

/**
 * The backbox at the far end of the table, towering over you from down on the playfield: the backlit
 * backglass with the game's art, the dot-matrix display under it, speaker grilles either side.
 */

let glassTex: THREE.CanvasTexture | null = null;
const backglass = (font: string) => {
  if (glassTex) return glassTex;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d")!;
  const bg = g.createRadialGradient(512, 560, 40, 512, 560, 700);
  bg.addColorStop(0, "#FF5FB0");
  bg.addColorStop(0.35, "#8A1FD0");
  bg.addColorStop(1, "#1A0638");
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 1024);
  // rays
  for (let i = 0; i < 24; i++) {
    g.save();
    g.translate(512, 600);
    g.rotate((i / 24) * Math.PI * 2);
    g.fillStyle = i % 2 ? "rgba(255,230,120,0.18)" : "rgba(255,255,255,0.06)";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-60, -900);
    g.lineTo(60, -900);
    g.closePath();
    g.fill();
    g.restore();
  }
  // the monster: a big purple face with a huge grin and googly eyes
  g.fillStyle = "#7A2BD6";
  g.strokeStyle = "#14051F";
  g.lineWidth = 16;
  g.beginPath();
  g.ellipse(512, 640, 300, 250, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = "#FFE08A";
  for (const sd of [-1, 1]) {
    g.beginPath();
    g.moveTo(512 + sd * 170, 450);
    g.quadraticCurveTo(512 + sd * 260, 330, 512 + sd * 300, 360);
    g.quadraticCurveTo(512 + sd * 250, 420, 512 + sd * 220, 480);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#FFFFFF";
    g.beginPath();
    g.arc(512 + sd * 110, 580, 78, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#050505";
    g.beginPath();
    g.arc(512 + sd * 110 + (sd > 0 ? -18 : 22), 600, 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#FFE08A";
  }
  g.fillStyle = "#1A0210";
  g.beginPath();
  g.ellipse(512, 760, 190, 90, 0, 0, Math.PI);
  g.fill();
  g.stroke();
  g.fillStyle = "#FFFDF4";
  for (let i = 0; i < 7; i++) {
    const x = 352 + i * 53;
    g.beginPath();
    g.moveTo(x, 760);
    g.lineTo(x + 26, 760);
    g.lineTo(x + 13, 800);
    g.closePath();
    g.fill();
  }
  g.fillStyle = "#F0608E";
  g.beginPath();
  g.ellipse(512, 830, 70, 30, 0, 0, Math.PI * 2);
  g.fill();
  // the title
  const title = (txt: string, y: number, size: number, fill: string, rot: number) => {
    g.save();
    g.translate(512, y);
    g.rotate(rot);
    g.font = `${size}px "${font}"`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = size * 0.2;
    g.strokeStyle = "#14051F";
    g.strokeText(txt, 0, 0);
    g.fillStyle = fill;
    g.fillText(txt, 0, 0);
    g.restore();
  };
  title("MONSTER", 150, 150, "#B6FF4D", -0.05);
  title("CHOMP!", 290, 170, "#FF4FA0", 0.04);
  glassTex = new THREE.CanvasTexture(c);
  glassTex.colorSpace = THREE.SRGBColorSpace;
  return glassTex;
};

const BB_Z = -(LAY.L + 0.05);
const BB_W = 0.62;
const BB_X = LAY.W / 2;

export const Backbox: React.FC<{ lines: DmdLine[]; frame: number; extra?: { flash?: number; sparkle?: number; invert?: boolean }; glow: number; font: string }> = ({
  lines,
  frame,
  extra,
  glow,
  font,
}) => {
  const dmdMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: DMD_VERT,
        fragmentShader: DMD_FRAG,
        uniforms: { uDots: { value: null }, uColor: { value: new THREE.Color(1.0, 0.45, 0.08) }, uGain: { value: 3.5 } },
        toneMapped: false,
      }),
    [],
  );
  dmdMat.uniforms.uDots.value = dmdTexture(lines, frame, extra);
  const glassMat = std(
    "backglass",
    () => new THREE.MeshBasicMaterial({ map: backglass(font), toneMapped: false, color: new THREE.Color(1, 1, 1) }),
  ) as THREE.MeshBasicMaterial;
  glassMat.color.setScalar(glow);
  return (
    <group position={[BB_X, 0, BB_Z]}>
      {/* the box */}
      <mesh position={[0, 0.5, -0.1]} material={wood()}>
        <boxGeometry args={[BB_W + 0.04, 0.8, 0.2]} />
      </mesh>
      {/* backglass */}
      <mesh position={[0, 0.6, 0.0015]} material={glassMat}>
        <planeGeometry args={[BB_W - 0.04, 0.5]} />
      </mesh>
      {/* the display panel: dot matrix, speaker grilles */}
      <mesh position={[0, 0.23, 0.002]} material={std("dmdPanel", () => new THREE.MeshStandardMaterial({ color: "#0A0A0C", roughness: 0.6 }))}>
        <planeGeometry args={[BB_W - 0.02, 0.2]} />
      </mesh>
      <mesh position={[0, 0.23, 0.004]} material={dmdMat}>
        <planeGeometry args={[0.36, 0.09]} />
      </mesh>
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * 0.24, 0.23, 0.003]} material={std("grille", () => new THREE.MeshStandardMaterial({ color: "#26232B", roughness: 0.8, metalness: 0.3 }))}>
          <circleGeometry args={[0.045, 32]} />
        </mesh>
      ))}
    </group>
  );
};
