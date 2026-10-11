import * as THREE from "three";

/** Shared materials (created once per tab; colours are linear-light via THREE.Color). */
const cache: Record<string, THREE.Material> = {};

export const std = (key: string, make: () => THREE.Material) => (cache[key] ??= make());

export const chrome = () =>
  std("chrome", () => new THREE.MeshStandardMaterial({ color: "#E8ECF2", metalness: 1, roughness: 0.12 }));
export const steelDull = () =>
  std("steelDull", () => new THREE.MeshStandardMaterial({ color: "#B9BEC6", metalness: 1, roughness: 0.35 }));
export const rubber = (c = "#F4F1EA") =>
  std("rubber" + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, metalness: 0 }));
export const plastic = (c: string, rough = 0.3) =>
  std(
    `plastic${c}${rough}`,
    () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 }),
  );
export const glossy = (c: string) =>
  std(
    "glossy" + c,
    () =>
      new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }),
  );
export const translucent = (c: string, opacity = 0.78, emissive = 0.35) =>
  std(`transl${c}${opacity}${emissive}`, () => {
    const col = new THREE.Color(c);
    return new THREE.MeshStandardMaterial({
      color: col,
      emissive: col.clone().multiplyScalar(emissive),
      roughness: 0.2,
      transparent: true,
      opacity,
      depthWrite: false,
    });
  });
export const wood = () =>
  std("wood", () => new THREE.MeshStandardMaterial({ color: "#1A0F24", roughness: 0.6 }));
export const black = () =>
  std("black", () => new THREE.MeshStandardMaterial({ color: "#0B0A10", roughness: 0.5 }));
