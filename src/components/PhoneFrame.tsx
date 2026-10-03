import React from "react";

export const PHONE = { w: 600, h: 1240, bezel: 14, radius: 92 } as const;

type PhoneFrameProps = {
  children?: React.ReactNode;
  screenBackground?: string;
  /** 0..1 opacity of the hardware (bezel, island, buttons) */
  hardware?: number;
  style?: React.CSSProperties;
};

/** Generic modern phone: titanium-dark bezel, dynamic island, side buttons. */
export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  children,
  screenBackground = "#0A1222",
  hardware = 1,
  style,
}) => {
  const { w, h, bezel, radius } = PHONE;
  return (
    <div style={{ position: "relative", width: w, height: h, ...style }}>
      {/* body */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          background: "linear-gradient(145deg, #3A3F4A 0%, #15181F 40%, #0B0D12 100%)",
          boxShadow:
            "inset 0 0 0 2px rgba(255,255,255,0.10), inset 0 0 0 5px rgba(0,0,0,0.6), 0 60px 120px -40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)",
          opacity: hardware,
        }}
      />
      {/* side buttons */}
      {[
        { left: -5, top: 250, height: 70 },
        { left: -5, top: 350, height: 120 },
        { left: -5, top: 490, height: 120 },
        { left: w - 1, top: 380, height: 170 },
      ].map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.left,
            top: b.top,
            width: 6,
            height: b.height,
            borderRadius: 3,
            background: "linear-gradient(to right, #2A2E37, #4A505C)",
            opacity: hardware,
          }}
        />
      ))}
      {/* screen */}
      <div
        style={{
          position: "absolute",
          inset: bezel,
          borderRadius: radius - bezel,
          overflow: "hidden",
          background: screenBackground,
        }}
      >
        {children}
        <div
          style={{
            position: "absolute",
            top: 22,
            left: "50%",
            width: 168,
            height: 48,
            marginLeft: -84,
            borderRadius: 24,
            background: "#000",
            opacity: hardware,
          }}
        />
      </div>
    </div>
  );
};
