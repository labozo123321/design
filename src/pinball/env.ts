import * as THREE from "three";

/**
 * What the chrome reflects and what you see up through the glass: a dark arcade. A ceiling with a couple
 * of light panels, neon tubes round the walls, the glow of other machines low down, all in an
 * equirectangular canvas; also prefiltered (PMREM) as the scene's environment for reflections.
 */
let room: THREE.CanvasTexture | null = null;

export const roomTexture = () => {
  if (room) return room;
  const W = 2048;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0C0816");
  bg.addColorStop(0.45, "#160B26");
  bg.addColorStop(0.55, "#22103A");
  bg.addColorStop(1, "#08050E");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // ceiling light panels (near the top: up)
  for (let i = 0; i < 6; i++) {
    const x = (i / 6) * W + 80;
    g.fillStyle = "rgba(255, 240, 220, 0.85)";
    g.fillRect(x, 70, 160, 26);
  }
  // neon tubes round the room
  const neon = (y: number, col: string, w = 8) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.shadowColor = col;
    g.shadowBlur = 30;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, y + Math.sin(x * 0.01) * 6);
    g.stroke();
    g.shadowBlur = 0;
  };
  neon(330, "#FF3FB5");
  neon(360, "#2FD8FF", 6);
  // other machines' screens and marquees glowing round the horizon
  for (let i = 0; i < 26; i++) {
    const x = (i / 26) * W + Math.sin(i * 3.1) * 20;
    const hue = (i * 47) % 360;
    g.fillStyle = `hsl(${hue}, 90%, 60%)`;
    g.fillRect(x, 430 + (i % 3) * 8, 46, 30);
    g.fillStyle = `hsla(${hue}, 90%, 50%, 0.35)`;
    g.fillRect(x - 8, 470, 62, 60);
  }
  // a big neon ARCADE sign
  g.font = "bold 120px sans-serif";
  g.textAlign = "center";
  g.shadowColor = "#FF3FB5";
  g.shadowBlur = 40;
  g.fillStyle = "#FF8AD0";
  g.fillText("ARCADE", W * 0.75, 270);
  g.shadowBlur = 0;
  room = new THREE.CanvasTexture(c);
  room.mapping = THREE.EquirectangularReflectionMapping;
  room.colorSpace = THREE.SRGBColorSpace;
  return room;
};

let env: THREE.Texture | null = null;
export const envMap = (renderer: THREE.WebGLRenderer) => {
  if (env) return env;
  const pm = new THREE.PMREMGenerator(renderer);
  env = pm.fromEquirectangular(roomTexture()).texture;
  pm.dispose();
  return env;
};
