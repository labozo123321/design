import React, { useMemo } from "react";
import * as THREE from "three";
import { HALL, OUTLET, ROOM } from "./layout";

/**
 * The light, by era and time of day:
 *  - night: a cool streetlight from across the road through the front windows (real shadows through the
 *    window openings lay the window-and-muntin shapes across the floors and the feet of the beds), a dim blue
 *    sky fill, Nora's moon nightlight pooling on her pillow and the seam, the warm hallway light through the
 *    doors until it clicks off at bedtime;
 *  - day (time-lapses): the sun sweeping across the floors through the windows, a bright sky fill.
 */

const spot = (color: string, angle: number, penumbra: number, shadow = true) => {
  const l = new THREE.SpotLight(color, 1, 0, angle, penumbra, 0);
  l.castShadow = shadow;
  l.shadow.mapSize.set(2048, 2048);
  l.shadow.bias = -0.0002;
  l.shadow.normalBias = 0.02;
  l.shadow.camera.near = 1;
  l.shadow.camera.far = 40;
  return l;
};

export const NightLights: React.FC<{ t: number; hall: number; street?: number; moon?: number; nightlight?: number; fill?: number; strings?: number; lightning?: number; sun?: number; sunAz?: number }> = ({
  hall,
  street = 1,
  moon = 0,
  nightlight = 1,
  fill = 1,
  strings = 0,
  lightning = 0,
  sun = 0,
  sunAz = 0.5,
}) => {
  const L = useMemo(() => {
    const st = spot("#CFDDF5", 0.42, 0.6);
    st.position.set(-1.2, 6.5, 9.0);
    st.target.position.set(0.1, 0.0, -1.4);
    const mn = spot("#B7C8E8", 0.4, 0.7);
    mn.position.set(2.5, 9.5, 7.0);
    mn.target.position.set(0, 0, -1.6);
    const hl = new THREE.PointLight("#FFC98A", 1, 7, 1.6);
    hl.position.set(0, 1.95, (HALL.z0 + HALL.z1) / 2);
    hl.castShadow = true;
    hl.shadow.mapSize.set(1024, 1024);
    hl.shadow.bias = -0.0005;
    const nl = new THREE.PointLight("#FFB067", 1, 1.1, 1.2);
    nl.position.copy(OUTLET).add(new THREE.Vector3(-0.06, 0.04, 0));
    // lightning: a hard cold flash from high over the street, through the front windows
    // (no shadow, and always present at zero: switching lights on and off would recompile every material)
    const lt = spot("#DDE6FF", 0.55, 0.3, false);
    lt.position.set(1.5, 9.0, 10.0);
    lt.target.position.set(0, 0, -1.8);
    // the sun: low through the front windows, swinging east to west over a day
    const sn = new THREE.DirectionalLight("#FFE2B8", 1);
    sn.castShadow = true;
    sn.shadow.mapSize.set(2048, 2048);
    sn.shadow.bias = -0.0003;
    sn.shadow.normalBias = 0.02;
    Object.assign(sn.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 30 });
    sn.target.position.set(0, 0, -1.8);
    return { st, mn, hl, nl, lt, sn };
  }, []);
  L.lt.intensity = 2.6 * lightning;
  L.sn.intensity = 3.2 * sun;
  {
    const a = (sunAz - 0.5) * 2.2;
    L.sn.position.set(Math.sin(a) * 9, 4.2 + 2.5 * Math.cos(a), 8 + 0.0 * a);
    L.sn.color.set(new THREE.Color("#FFD29A").lerp(new THREE.Color("#FFF2DE"), Math.cos(a)));
  }
  L.st.intensity = 1.5 * street;
  L.mn.intensity = 1.1 * moon;
  // the hallway's ceiling light, or (2025) the Christmas string lights along the banister: warmer, dimmer
  L.hl.intensity = 2.2 * hall + 1.3 * strings;
  L.hl.color.set(strings > hall ? "#FFB070" : "#FFC98A");
  L.hl.visible = hall + strings > 0.001;
  L.nl.intensity = 0.12 * nightlight;
  return (
    <>
      <hemisphereLight args={[sun > 0 ? "#9FB8D8" : "#3B4C78", sun > 0 ? "#6A5A48" : "#1A1612", 1.5 * fill + 2.4 * sun + 0.35 * lightning]} />
      <primitive object={L.lt} />
      <primitive object={L.lt.target} />
      <primitive object={L.sn} />
      <primitive object={L.sn.target} />
      <directionalLight position={[1.5, 9, 2.5]} intensity={0.35 * fill} color="#9FB2E0" />
      <primitive object={L.st} />
      <primitive object={L.st.target} />
      <primitive object={L.mn} />
      <primitive object={L.mn.target} />
      <primitive object={L.hl} />
      <primitive object={L.nl} />
    </>
  );
};

export { ROOM };
