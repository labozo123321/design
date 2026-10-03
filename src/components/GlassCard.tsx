import React from "react";

type GlassCardProps = {
  tone?: "light" | "dark";
  radius?: number;
  blur?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/** Frosted glass surface: backdrop blur, hairline border, soft layered shadow. */
export const GlassCard: React.FC<GlassCardProps> = ({
  tone = "light",
  radius = 36,
  blur = 26,
  style,
  children,
}) => {
  const light = tone === "light";
  return (
    <div
      style={{
        position: "relative",
        borderRadius: radius,
        background: light
          ? "linear-gradient(160deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.56) 100%)"
          : "linear-gradient(160deg, rgba(34,50,82,0.78) 0%, rgba(16,26,46,0.66) 100%)",
        backdropFilter: `blur(${blur}px) saturate(140%)`,
        WebkitBackdropFilter: `blur(${blur}px) saturate(140%)`,
        border: light ? "1.5px solid rgba(255,255,255,0.95)" : "1.5px solid rgba(255,255,255,0.10)",
        boxShadow: light
          ? "inset 0 1px 0 rgba(255,255,255,0.9), 0 30px 70px -28px rgba(14,26,46,0.35), 0 10px 22px -10px rgba(14,26,46,0.16)"
          : "inset 0 1px 0 rgba(255,255,255,0.08), 0 36px 80px -30px rgba(0,0,0,0.75), 0 10px 24px -12px rgba(0,0,0,0.5)",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
