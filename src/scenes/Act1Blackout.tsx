import React from "react";
import { AbsoluteFill } from "remotion";
import { SceneProps } from "./types";

/**
 * 300–330 · Total blackout. No picture, no sound. The REC dot (global HUD
 * layer) keeps blinking a little longer, then stops.
 */
export const Act1Blackout: React.FC<SceneProps> = () => <AbsoluteFill style={{ background: "#000" }} />;
