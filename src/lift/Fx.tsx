import React, { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { FX_LAYER } from "./Post";

/** Puts everything inside on the effects layer: drawn, but given no ink lines and no normals (glows,
 * holograms, stars, beams). Runs after every render, so things that appear later are moved too. */
export const Fx: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => o.layers.set(FX_LAYER));
  });
  return <group ref={ref}>{children}</group>;
};
