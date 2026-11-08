import { registerRoot } from "remotion";
import { LiftRoot } from "./Root";

/** Lift's own entry point: only its compositions (and only its local font), so a render needs no network. */
registerRoot(LiftRoot);
