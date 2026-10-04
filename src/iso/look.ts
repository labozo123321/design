import * as THREE from "three";

/** Palette from the brief. */
export const ISO = {
  void: "#0A0F1E",
  voidDeep: "#05070D",
  charcoal: "#30343C",
  slate: "#4A515B",
  stone: "#383D46",
  gold: "#D4A84B",
  emerald: "#2E8B6E",
  amber: "#FFB566",
  walnut: "#3B2618",
};

/** Premium, grown-up materials: matte stone, brushed brass, walnut, smoked glass, frosted acrylic. */
export const MAT = {
  stone: new THREE.MeshStandardMaterial({ color: ISO.stone, roughness: 0.92, metalness: 0.05 }),
  charcoal: new THREE.MeshStandardMaterial({ color: ISO.charcoal, roughness: 0.88, metalness: 0.05 }),
  slate: new THREE.MeshStandardMaterial({ color: ISO.slate, roughness: 0.8, metalness: 0.08 }),
  brass: new THREE.MeshStandardMaterial({ color: "#B8893A", roughness: 0.32, metalness: 0.95 }),
  walnut: new THREE.MeshStandardMaterial({ color: ISO.walnut, roughness: 0.55, metalness: 0.05 }),
  glass: new THREE.MeshStandardMaterial({
    color: "#2A3446",
    roughness: 0.08,
    metalness: 0.3,
    transparent: true,
    opacity: 0.38,
  }),
  acrylic: new THREE.MeshStandardMaterial({
    color: "#E8E4DC",
    roughness: 0.75,
    metalness: 0,
    transparent: true,
    opacity: 0.72,
  }),
  fabric: new THREE.MeshStandardMaterial({ color: "#3E4554", roughness: 0.85, metalness: 0 }),
  skin: new THREE.MeshStandardMaterial({ color: "#A29484", roughness: 0.9, metalness: 0 }),
  dark: new THREE.MeshStandardMaterial({ color: "#14171C", roughness: 0.9, metalness: 0 }),
};

/** Soft radial glow texture (for halos, haze, light pools). Generated in code. */
let _glow: THREE.Texture | null = null;
export const glowTexture = () => {
  if (_glow) return _glow;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
};

/** Night skyline for the apartment window. */
let _sky: THREE.Texture | null = null;
export const skylineTexture = () => {
  if (_sky) return _sky;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#0B1430");
  grd.addColorStop(1, "#24304F");
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 256);
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let x = 0; x < 512;) {
    const w = 18 + rnd() * 40;
    const h = 60 + rnd() * 150;
    g.fillStyle = "#0A0F1E";
    g.fillRect(x, 256 - h, w, h);
    for (let wy = 256 - h + 8; wy < 250; wy += 12)
      for (let wx = x + 4; wx < x + w - 4; wx += 9)
        if (rnd() < 0.35) {
          g.fillStyle = rnd() < 0.8 ? "rgba(255,190,110,0.85)" : "rgba(212,168,75,0.9)";
          g.fillRect(wx, wy, 4, 5);
        }
    x += w + 3;
  }
  _sky = new THREE.CanvasTexture(c);
  _sky.colorSpace = THREE.SRGBColorSpace;
  return _sky;
};

/** Small amber LED clock face reading 9:47 PM. */
let _clock: THREE.Texture | null = null;
export const clockTexture = () => {
  if (_clock) return _clock;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0B0C10";
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = "#FFB566";
  g.font = "600 58px monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("9:47 PM", 128, 52);
  _clock = new THREE.CanvasTexture(c);
  _clock.colorSpace = THREE.SRGBColorSpace;
  return _clock;
};
