import * as THREE from "three";

/**
 * Shared materials and procedural textures: the Roadster's "Ano White", its gold-visor canopy (a gold mirror
 * from outside, a warm tint from inside), black trim, carbon twill, tyres, titanium; lights as HDR colour.
 */

const cache: Record<string, THREE.Material> = {};
export const mat = <T extends THREE.Material>(key: string, make: () => T): T => (cache[key] ??= make()) as T;

const texCache: Record<string, THREE.Texture> = {};

/** A canvas texture made once. */
export const canvasTex = (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number], srgb = true) => {
  if (texCache[key]) return texCache[key];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  texCache[key] = t;
  return t;
};

export const rand = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
};

/** Carbon fibre: a 2x2 twill of tows, each with a sheen along its fibres. */
export const carbonTex = () =>
  canvasTex(
    "carbon",
    256,
    256,
    (g, w) => {
      const n = 16;
      const s = w / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const horiz = (i + j) % 4 < 2;
          const grad = horiz ? g.createLinearGradient(i * s, j * s, i * s, j * s + s) : g.createLinearGradient(i * s, j * s, i * s + s, j * s);
          grad.addColorStop(0, "#0b0c0e");
          grad.addColorStop(0.5, horiz ? "#2a2d33" : "#1d1f24");
          grad.addColorStop(1, "#0b0c0e");
          g.fillStyle = grad;
          g.fillRect(i * s, j * s, s, s);
        }
    },
    [6, 6],
  );

/** Alcantara/suede: fine noise. */
export const suedeTex = () =>
  canvasTex(
    "suede",
    256,
    256,
    (g, w, h) => {
      const r = rand(7);
      g.fillStyle = "#18191c";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const v = 18 + r() * 22;
        g.fillStyle = `rgb(${v},${v},${v + 3})`;
        g.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
    },
    [4, 4],
  );

/** A soft bumpy normal map (orange peel). */
const peelTex = () => {
  const key = "peel";
  return canvasTex(
    key,
    256,
    256,
    (g, w, h) => {
      const r = rand(77);
      g.fillStyle = "rgb(128,128,255)";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3500; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 2 + r() * 5;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        const dx = Math.round(128 + (r() - 0.5) * 60);
        const dy = Math.round(128 + (r() - 0.5) * 60);
        grd.addColorStop(0, `rgba(${dx},${dy},255,0.6)`);
        grd.addColorStop(1, "rgba(128,128,255,0)");
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    },
    [6, 6],
    false,
  );
};

export const M = {
  paint: () =>
    mat(
      "paint",
      () =>
        new THREE.MeshPhysicalMaterial({
          color: "#D5D9DC",
          roughness: 0.3,
          metalness: 0.0,
          clearcoat: 0.8,
          clearcoatRoughness: 0.1,
          sheen: 0.25,
          sheenColor: new THREE.Color("#DCE6F0"),
          envMapIntensity: 1.5,
          // a faint orange peel in the clear coat breaks the facets' reflections up a little
          clearcoatNormalMap: peelTex(),
          clearcoatNormalScale: new THREE.Vector2(0.06, 0.06),
        }),
    ),
  /** the canopy from outside: a gold visor */
  glassOut: () =>
    mat(
      "glassOut",
      () =>
        new THREE.MeshPhysicalMaterial({
          color: "#B98E3E",
          metalness: 0.92,
          roughness: 0.05,
          transparent: true,
          opacity: 0.86,
          envMapIntensity: 1.3,
          side: THREE.FrontSide,
          depthWrite: false,
        }),
    ),
  /** the canopy from inside: the world through it a little warmer and darker */
  glassIn: () =>
    mat("glassIn", () => {
      const m = new THREE.MeshBasicMaterial({ color: "#E4CB9A", side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true });
      return m;
    }),
  black: () => mat("black", () => new THREE.MeshStandardMaterial({ color: "#0C0D0F", roughness: 0.5, metalness: 0.1 })),
  gloss: () => mat("gloss", () => new THREE.MeshPhysicalMaterial({ color: "#07080A", roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 })),
  carbon: () => mat("carbon", () => new THREE.MeshPhysicalMaterial({ map: carbonTex(), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0.2 })),
  /** satin carbon for the cockpit (a mirror finish in there throws the spotlights straight into your eyes) */
  carbonIn: () => mat("carbonIn", () => new THREE.MeshPhysicalMaterial({ map: carbonTex(), roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.45, metalness: 0.1 })),
  /** dark satin plastic for the cockpit */
  satin: () => mat("satin", () => new THREE.MeshStandardMaterial({ color: "#0E0F12", roughness: 0.6, metalness: 0.05 })),
  well: () => mat("well", () => new THREE.MeshStandardMaterial({ color: "#060607", roughness: 0.9 })),
  tyre: () => mat("tyre", () => new THREE.MeshStandardMaterial({ color: "#141415", roughness: 0.82 })),
  titanium: () => mat("titanium", () => new THREE.MeshPhysicalMaterial({ color: "#7C818A", metalness: 0.85, roughness: 0.42, clearcoat: 0.2 })),
  steel: () => mat("steel", () => new THREE.MeshStandardMaterial({ color: "#9EA3AA", metalness: 1.0, roughness: 0.32 })),
  nozzle: () => mat("nozzle", () => new THREE.MeshStandardMaterial({ color: "#2B2D31", metalness: 0.95, roughness: 0.35 })),
  suede: () => mat("suede", () => new THREE.MeshStandardMaterial({ map: suedeTex(), roughness: 0.95 })),
  light: (key: string, color: string, k: number) => {
    const m = mat(`light-${key}`, () => new THREE.MeshBasicMaterial({ color, toneMapped: true }));
    m.color.set(color).multiplyScalar(k);
    return m;
  },
};
