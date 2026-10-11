import * as THREE from "three";

/**
 * What the chrome reflects and what you see up through the glass: an arcade at night, out of focus (the
 * lens is focused on the table). Rows of other machines glowing round the horizon, string lights and
 * neon signs higher up, a couple of warm ceiling spots, the cosmic carpet underfoot; all in an
 * equirectangular canvas, also prefiltered (PMREM) as the scene's base environment.
 *
 * Equirect layout: canvas x = 512 is up the table (-z), 1536 is behind you; y = 0 is straight up.
 */
let room: THREE.CanvasTexture | null = null;

let seed = 17;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** A soft out-of-focus disc of light. */
const bokeh = (g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a: number) => {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, col.replace("A", String(a)));
  rg.addColorStop(0.7, col.replace("A", String(a * 0.85)));
  rg.addColorStop(1, col.replace("A", "0"));
  g.fillStyle = rg;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
};

export const roomTexture = () => {
  if (room) return room;
  seed = 17;
  const W = 2048;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#120A22");
  bg.addColorStop(0.35, "#1E1038");
  bg.addColorStop(0.5, "#2C1650");
  bg.addColorStop(0.62, "#1A0C30");
  bg.addColorStop(1, "#0A0614");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // the cosmic carpet: neon squiggles on black
  g.save();
  g.filter = "blur(3px)";
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W;
    const y = 640 + rnd() * 380;
    g.strokeStyle = ["#FF3FB5", "#2FD8FF", "#FFE14D", "#7CFF6B"][i % 4];
    g.globalAlpha = 0.35;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + 20, y - 15, x + 30, y + 15, x + 50, y);
    g.stroke();
  }
  g.restore();
  g.globalAlpha = 1;
  // a row of other machines round the horizon: glowing backglasses and playfields, out of focus
  g.save();
  g.filter = "blur(10px)";
  for (let i = 0; i < 22; i++) {
    const x = (i / 22) * W + (rnd() - 0.5) * 30;
    const hue = [300, 190, 45, 330, 260, 140, 20][i % 7];
    const w = 58 + rnd() * 20;
    // backglass (higher) and the lit playfield under its glass (a lower slanted glow)
    const grd = g.createLinearGradient(0, 360, 0, 470);
    grd.addColorStop(0, `hsla(${hue}, 95%, 66%, 0.95)`);
    grd.addColorStop(1, `hsla(${(hue + 40) % 360}, 95%, 50%, 0.85)`);
    g.fillStyle = grd;
    g.fillRect(x, 372 + (i % 3) * 6, w, 82);
    g.fillStyle = `hsla(${hue}, 90%, 55%, 0.5)`;
    g.fillRect(x - 6, 470, w + 12, 40);
    g.fillStyle = "rgba(10, 4, 20, 0.85)";
    g.fillRect(x - 4, 512, w + 8, 120);
  }
  g.restore();
  // string lights swagging round the walls, and scattered bokeh
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 120; i++) {
      const x = (i / 120) * W;
      const y = 250 + k * 70 + Math.sin((x / W) * Math.PI * 16 + k) * 26;
      const col = ["rgba(255,214,140,A)", "rgba(255,120,200,A)", "rgba(120,220,255,A)"][(i + k) % 3];
      bokeh(g, x, y, 9 + rnd() * 6, col, 0.9);
    }
  }
  for (let i = 0; i < 90; i++) {
    const col = ["rgba(255,80,190,A)", "rgba(80,220,255,A)", "rgba(255,220,90,A)", "rgba(160,110,255,A)"][
      i % 4
    ];
    bokeh(g, rnd() * W, 120 + rnd() * 380, 14 + rnd() * 34, col, 0.35 + rnd() * 0.4);
  }
  // warm ceiling spots
  for (let i = 0; i < 5; i++) bokeh(g, 200 + i * 410, 70, 70, "rgba(255,236,200,A)", 0.9);
  // neon signs: tubes with glow
  const neon = (text: string, x: number, y: number, size: number, col: string) => {
    g.save();
    g.font = `bold ${size}px sans-serif`;
    g.textAlign = "center";
    g.shadowColor = col;
    g.shadowBlur = 30;
    g.fillStyle = col;
    g.fillText(text, x, y);
    g.shadowBlur = 12;
    g.fillStyle = "#FFFFFF";
    g.globalAlpha = 0.6;
    g.fillText(text, x, y);
    g.restore();
  };
  neon("ARCADE", 520, 230, 110, "#FF4FC0");
  neon("HIGH SCORE", 1240, 210, 70, "#4FE8FF");
  neon("GAME ON", 1820, 230, 80, "#FFE14D");
  // neon tubes round the room
  const tube = (y: number, col: string, w = 7) => {
    g.save();
    g.strokeStyle = col;
    g.lineWidth = w;
    g.shadowColor = col;
    g.shadowBlur = 26;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, y + Math.sin(x * 0.01) * 6);
    g.stroke();
    g.restore();
  };
  tube(330, "#FF3FB5");
  tube(352, "#2FD8FF", 5);
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
