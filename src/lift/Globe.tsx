import React, { useMemo } from "react";
import * as THREE from "three";
import { LAND } from "./land";
import { canvasTex, flat, hash, toon } from "./toon";
import { Fx } from "./Fx";

/**
 * The planet, twice: the cartoon Earth of the space shots (flat blue sea, green land, white ice, puffy
 * cloud patches, a glowing rim of air), and the war room's hologram (cyan land on a wire globe, yellow
 * rings). Both draw the same Natural Earth coastlines.
 *
 * Longitude 0 faces +x, 90E faces -z; the equator is the xz plane.
 */

const drawLand = (g: CanvasRenderingContext2D, W: number, H: number, fill: (lat: number) => string) => {
  for (const ring of LAND) {
    let latSum = 0;
    for (const p of ring) latSum += p[1];
    g.fillStyle = fill(latSum / ring.length);
    g.beginPath();
    ring.forEach(([lon, lat], i) => {
      const x = ((lon + 180) / 360) * W;
      const y = ((90 - lat) / 180) * H;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
    g.fill();
  }
};

export const earthTex = () =>
  canvasTex("earth-map", 2048, 1024, (g) => {
    const W = 2048;
    const H = 1024;
    g.fillStyle = "#1f6fd1";
    g.fillRect(0, 0, W, H);
    // shallow seas: a soft lighter band round the land
    g.save();
    g.filter = "blur(10px)";
    drawLand(g, W, H, () => "#3d8de0");
    g.restore();
    drawLand(g, W, H, (lat) => (Math.abs(lat) > 60 ? "#eef3f7" : lat < 32 && lat > -32 && Math.abs(lat) > 12 ? "#7cc35a" : "#4fae4a"));
    // a few desert patches
    g.globalCompositeOperation = "source-atop";
    const blot = (lon: number, lat: number, rx: number, ry: number, c: string) => {
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(((lon + 180) / 360) * W, ((90 - lat) / 180) * H, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    };
    blot(15, 22, 150, 50, "#e8c66a");
    blot(45, 24, 60, 40, "#e3be63");
    blot(133, -25, 90, 45, "#e2b65e");
    blot(-112, 33, 30, 25, "#d9b468");
    g.globalCompositeOperation = "source-over";
    // the ice caps
    g.fillStyle = "#eef3f7";
    g.fillRect(0, 0, W, 40);
    g.fillRect(0, H - 70, W, 70);
  });

export const cloudTex = () =>
  canvasTex("earth-clouds", 1024, 512, (g) => {
    g.clearRect(0, 0, 1024, 512);
    for (let i = 0; i < 70; i++) {
      const x = hash(i * 1.7) * 1024;
      const lat = (hash(i * 2.9) - 0.5) * 120;
      const y = ((90 - lat) / 180) * 512;
      const n = 3 + Math.floor(hash(i * 5.3) * 4);
      g.fillStyle = "rgba(255,255,255,0.95)";
      for (let k = 0; k < n; k++) {
        const r = 7 + hash(i * 11 + k) * 12;
        g.beginPath();
        g.ellipse(x + (k - n / 2) * r * 0.9, y + (hash(i * 13 + k) - 0.5) * r * 0.6, r * 1.3, r * 0.8, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  });

const holoTex = () =>
  canvasTex("holo-map", 2048, 1024, (g) => {
    g.clearRect(0, 0, 2048, 1024);
    drawLand(g, 2048, 1024, () => "rgba(120,235,255,1)");
    // coastline glow
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(255,255,255,0.15)";
    g.fillRect(0, 0, 2048, 1024);
  });

const atmoMat = (color: string, power: number, gain: number) =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: power }, uGain: { value: gain } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uPow; uniform float uGain;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow);
        gl_FragColor = vec4(uColor * f * uGain, f);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });

/** The cartoon Earth. spin: radians about the axis (0 puts longitude 0 toward +x). */
export const Earth: React.FC<{ r: number; spin?: number; cloudSpin?: number; pos?: [number, number, number]; tilt?: number; rim?: number }> = ({ r, spin = 0, cloudSpin, pos = [0, 0, 0], tilt = 0, rim = 1 }) => {
  const atmo = useMemo(() => atmoMat("#7fd4ff", 2.6, 1.8), []);
  return (
    <group position={pos} rotation={[0, 0, tilt]}>
      <group rotation={[0, spin, 0]}>
        <mesh material={toon("#ffffff", { map: earthTex() })} receiveShadow>
          <sphereGeometry args={[r, 96, 64]} />
        </mesh>
      </group>
      <group rotation={[0, cloudSpin ?? spin * 1.08, 0]}>
        <mesh material={toon("#ffffff", { map: cloudTex(), opacity: 0.999 })}>
          <sphereGeometry args={[r * 1.012, 96, 64]} />
        </mesh>
      </group>
      {rim > 0 ? (
        <Fx>
          <mesh material={atmo} scale={1.06}>
            <sphereGeometry args={[r, 64, 48]} />
          </mesh>
        </Fx>
      ) : null}
    </group>
  );
};

/** Lines of latitude and longitude, as one LineSegments. */
const gridGeo = (n = 12, m = 8) => {
  const pts: number[] = [];
  const seg = 96;
  for (let i = 0; i < n; i++) {
    const lon = (i / n) * Math.PI * 2;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI - Math.PI / 2;
      const a1 = ((k + 1) / seg) * Math.PI - Math.PI / 2;
      pts.push(Math.cos(a0) * Math.cos(lon), Math.sin(a0), -Math.cos(a0) * Math.sin(lon));
      pts.push(Math.cos(a1) * Math.cos(lon), Math.sin(a1), -Math.cos(a1) * Math.sin(lon));
    }
  }
  for (let j = 1; j < m; j++) {
    const lat = (j / m) * Math.PI - Math.PI / 2;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2;
      const a1 = ((k + 1) / seg) * Math.PI * 2;
      pts.push(Math.cos(lat) * Math.cos(a0), Math.sin(lat), -Math.cos(lat) * Math.sin(a0));
      pts.push(Math.cos(lat) * Math.cos(a1), Math.sin(lat), -Math.cos(lat) * Math.sin(a1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
};
const GRID = gridGeo();

/** The war room's hologram globe, with its yellow rings; `equator` lights the equator line (0..1);
 * `ribbon` grows a line from the equator straight up (0..1). */
export const HoloGlobe: React.FC<{ r: number; spin: number; t: number; equator?: number; ribbon?: number; alarm?: number; pos?: [number, number, number] }> = ({ r, spin, t, equator = 0, ribbon = 0, alarm = 0, pos = [0, 0, 0] }) => {
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color("#5fe3ff"), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  const cyan = alarm > 0 ? new THREE.Color("#5fe3ff").lerp(new THREE.Color("#ff4757"), alarm) : new THREE.Color("#5fe3ff");
  lineMat.color.copy(cyan).multiplyScalar(0.9);
  return (
    <group position={pos}>
      <Fx>
        <group rotation={[0.18, spin, 0]}>
          <mesh material={flat(alarm > 0.5 ? "#ff6b7a" : "#5fd8f2", 0.75, { map: holoTex(), additive: true, opacity: 0.8 })}>
            <sphereGeometry args={[r, 72, 48]} />
          </mesh>
          <lineSegments geometry={GRID} material={lineMat} scale={r * 1.002} />
          <mesh material={flat(alarm > 0.5 ? "#40121a" : "#0b3550", 1, { additive: true, opacity: 0.35 })}>
            <sphereGeometry args={[r * 0.985, 48, 32]} />
          </mesh>
          {equator > 0 ? (
            <mesh rotation={[Math.PI / 2, 0, 0]} material={flat("#ffd23f", 2.4, { additive: true, opacity: equator })}>
              <torusGeometry args={[r * 1.01, r * 0.012, 8, 128]} />
            </mesh>
          ) : null}
          {ribbon > 0 ? (
            <group rotation={[0, -2.2, 0]}>
              <mesh position={[r + (r * 1.4 * ribbon) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={flat("#ffffff", 2.6, { additive: true })}>
                <cylinderGeometry args={[r * 0.012, r * 0.012, r * 1.4 * ribbon, 8]} />
              </mesh>
              <mesh position={[r + r * 1.4 * ribbon, 0, 0]} material={flat("#ffd23f", 2.6, { additive: true })}>
                <sphereGeometry args={[r * 0.04, 16, 12]} />
              </mesh>
            </group>
          ) : null}
        </group>
        {/* the rings */}
        <group rotation={[0.35, t * 0.6, 0.2]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={flat("#ffcf33", 1.5, { additive: true })}>
            <torusGeometry args={[r * 1.32, r * 0.012, 8, 160]} />
          </mesh>
        </group>
        <group rotation={[-0.5, -t * 0.4, -0.25]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={flat("#ffcf33", 1.2, { additive: true, opacity: 0.7 })}>
            <torusGeometry args={[r * 1.5, r * 0.008, 8, 160]} />
          </mesh>
        </group>
      </Fx>
    </group>
  );
};
