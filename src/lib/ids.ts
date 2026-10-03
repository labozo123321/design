import { useId } from "react";

/** Unique, CSS-safe id for SVG filters/masks (several instances can share a frame). */
export const useSafeId = (prefix: string) => `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
