import React from "react";

/**
 * Small drawn illustrations for the chat card (no emoji font, no real-app artwork): Nora's avatar (a little
 * photo of her at 9: two braids, the yellow plastic clip at her crown, freckles, purple star pajamas), the
 * party popper, and the heart of your tapback.
 */

/** one braid: a chain of plaited lobes from (x, y) downward, ending in a hair tie and a tuft */
const Braid: React.FC<{ x: number; y: number; dx: number; n: number; flip?: boolean }> = ({ x, y, dx, n, flip }) => {
  const lobes: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const cx = x + dx * i + (i % 2 === 0 ? -1.6 : 1.6) * (flip ? -1 : 1);
    const cy = y + i * 7.2;
    const rot = (i % 2 === 0 ? -28 : 28) * (flip ? -1 : 1);
    lobes.push(
      <g key={i} transform={`rotate(${rot} ${cx} ${cy})`}>
        <ellipse cx={cx} cy={cy} rx={6.4} ry={4.6} fill="url(#kn-av-hair)" stroke="#3E2412" strokeWidth={0.7} />
        <path d={`M${cx - 4} ${cy - 1.2} Q${cx} ${cy - 3.2} ${cx + 4} ${cy - 1.2}`} stroke="#B07A4C" strokeWidth={0.8} fill="none" opacity={0.8} />
      </g>,
    );
  }
  const ex = x + dx * n;
  const ey = y + n * 7.2 - 2;
  return (
    <g>
      {lobes}
      <rect x={ex - 3.6} y={ey - 1.6} width={7.2} height={3.4} rx={1.6} fill="#C24E9E" />
      <path d={`M${ex - 3.5} ${ey + 1.6} Q${ex - 4.6} ${ey + 7} ${ex - 1.4} ${ey + 9} Q${ex} ${ey + 6} ${ex + 1.2} ${ey + 9.2} Q${ex + 4.6} ${ey + 7} ${ex + 3.4} ${ey + 1.6} Z`} fill="url(#kn-av-hair)" stroke="#3E2412" strokeWidth={0.6} />
    </g>
  );
};

const Star: React.FC<{ x: number; y: number; r: number; rot?: number }> = ({ x, y, r, rot = 0 }) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36 - 90) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(2)},${(y + rr * Math.sin(a)).toFixed(2)}`);
  }
  return <polygon points={pts.join(" ")} fill="#FFD84A" />;
};

export const NoraAvatar: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ display: "block" }}>
    <defs>
      <radialGradient id="kn-av-bg" cx="32%" cy="26%" r="85%">
        <stop offset="0" stopColor="#C9B6EA" />
        <stop offset="0.55" stopColor="#8D76C2" />
        <stop offset="1" stopColor="#4E3D7A" />
      </radialGradient>
      <radialGradient id="kn-av-skin" cx="44%" cy="38%" r="68%">
        <stop offset="0" stopColor="#FFE6D6" />
        <stop offset="0.65" stopColor="#F6CDB6" />
        <stop offset="1" stopColor="#E3A98F" />
      </radialGradient>
      <linearGradient id="kn-av-hair" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#93623A" />
        <stop offset="1" stopColor="#5E3B1F" />
      </linearGradient>
      <linearGradient id="kn-av-pj" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7B58B0" />
        <stop offset="1" stopColor="#56397F" />
      </linearGradient>
      <radialGradient id="kn-av-vig" cx="50%" cy="45%" r="62%">
        <stop offset="0.6" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.32" />
      </radialGradient>
      <clipPath id="kn-av-clip">
        <circle cx="60" cy="60" r="60" />
      </clipPath>
    </defs>
    <g clipPath="url(#kn-av-clip)">
      <rect width="120" height="120" fill="url(#kn-av-bg)" />
      {/* framed like a portrait photo: head and shoulders filling the circle */}
      <g transform="translate(60 64) scale(1.2) translate(-60 -60)">
      {/* string-light bokeh behind her */}
      <circle cx="16" cy="24" r="7" fill="#FFE6A8" opacity="0.32" />
      <circle cx="104" cy="18" r="6" fill="#FFE6A8" opacity="0.26" />
      <circle cx="108" cy="46" r="4.5" fill="#FFD9F0" opacity="0.22" />
      {/* hair behind the head */}
      <ellipse cx="60" cy="54" rx="31" ry="32" fill="url(#kn-av-hair)" />
      {/* pajama top with stars */}
      <path d="M10 120 C 13 99, 33 89, 60 89 C 87 89, 107 99, 110 120 Z" fill="url(#kn-av-pj)" />
      <path d="M50 89.5 Q60 97 70 89.5" stroke="#9C7BD0" strokeWidth="2.2" fill="none" />
      <Star x={28} y={108} r={3.6} rot={8} />
      <Star x={44} y={101} r={2.8} rot={-12} />
      <Star x={79} y={104} r={3.2} rot={20} />
      <Star x={95} y={112} r={3.4} rot={-6} />
      <Star x={62} y={113} r={2.6} rot={14} />
      {/* neck */}
      <path d="M51.5 76 L51.5 90 Q60 95 68.5 90 L68.5 76 Z" fill="#EBB79C" />
      {/* ears */}
      <ellipse cx="35" cy="59" rx="4.2" ry="6" fill="#EDB89D" />
      <ellipse cx="85" cy="59" rx="4.2" ry="6" fill="#EDB89D" />
      {/* the braids, over the shoulders */}
      <Braid x={33} y={70} dx={-0.9} n={6} />
      <Braid x={87} y={70} dx={0.9} n={6} flip />
      {/* face */}
      <ellipse cx="60" cy="57" rx="25" ry="27.5" fill="url(#kn-av-skin)" />
      <ellipse cx="45.5" cy="66" rx="5.4" ry="3.3" fill="#F2937F" opacity="0.4" />
      <ellipse cx="74.5" cy="66" rx="5.4" ry="3.3" fill="#F2937F" opacity="0.4" />
      {/* a band of freckles across the nose */}
      {[
        [49, 61.2],
        [51.8, 63.4],
        [54.4, 61],
        [56.6, 63.2],
        [63.4, 63.2],
        [65.6, 61],
        [68.2, 63.4],
        [71, 61.2],
        [59.8, 61.6],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.75} fill="#B8775A" opacity={0.75} />
      ))}
      {/* eyes (hazel), brows */}
      {[49, 71].map((x, i) => (
        <g key={i}>
          <ellipse cx={x} cy={55.5} rx={4.4} ry={3.6} fill="#FFFFFF" />
          <circle cx={x + 0.3} cy={55.9} r={2.8} fill="#7D6334" />
          <circle cx={x + 0.3} cy={55.9} r={1.25} fill="#22170D" />
          <circle cx={x + 1.3} cy={54.8} r={0.85} fill="#FFFFFF" />
          <path d={`M${x - 4.8} ${54.4} Q${x} ${50.6} ${x + 4.8} ${54.4}`} stroke="#3F2716" strokeWidth={1.3} fill="none" strokeLinecap="round" />
          <path d={i === 0 ? `M${x - 5} 48.6 Q${x} 46 ${x + 5} 48` : `M${x - 5} 48 Q${x} 46 ${x + 5} 48.6`} stroke="#6A4428" strokeWidth={1.9} fill="none" strokeLinecap="round" />
        </g>
      ))}
      {/* nose, the big grin, the chin dimple */}
      <path d="M59.2 58.5 Q57.6 64.6 59.8 65.8 Q61.8 66.3 62.8 65.2" stroke="#D3957B" strokeWidth={1.3} fill="none" strokeLinecap="round" />
      <path d="M49.5 70.5 Q60 80.5 70.5 70.5 Q60 74.8 49.5 70.5 Z" fill="#9B3B3E" />
      <path d="M51.2 71.1 Q60 74.6 68.8 71.1 L68.2 72.4 Q60 75.4 51.8 72.4 Z" fill="#FFFFFF" />
      <path d="M58.4 82 Q60 83.2 61.6 82" stroke="#D99C83" strokeWidth={0.9} fill="none" strokeLinecap="round" />
      {/* front hair: a centre parting, smoothed back into the braids */}
      <path d="M34.5 54 C 33 33, 47 26.5, 60 27 C 73 26.5, 87 33, 85.5 54 C 82 42, 72 35.5, 60.6 34.6 C 59.8 34.6 59.6 34.6 59.4 34.6 C 48 35.5, 38 42, 34.5 54 Z" fill="url(#kn-av-hair)" />
      <path d="M60 27.4 L60 34.4" stroke="#4A2D17" strokeWidth={0.9} />
      <path d="M44 33 Q38 39 36.4 48" stroke="#B07A4C" strokeWidth={0.9} fill="none" opacity={0.7} />
      <path d="M76 33 Q82 39 83.6 48" stroke="#B07A4C" strokeWidth={0.9} fill="none" opacity={0.7} />
      {/* the yellow plastic clip at her crown */}
      <g transform="rotate(-22 73 31)">
        <rect x="64.5" y="27.6" width="17.5" height="7.2" rx="3.6" fill="#FFD23F" stroke="#B88A10" strokeWidth={0.8} />
        <rect x="66.6" y="28.8" width="8.6" height="1.8" rx="0.9" fill="#FFF4B8" opacity={0.95} />
        <circle cx="79" cy="31.2" r="1.1" fill="#E0AE1C" />
      </g>
      </g>
      <rect width="120" height="120" fill="url(#kn-av-vig)" />
    </g>
  </svg>
);

/** a party popper, sized to sit in a line of 34 px text */
export const Popper: React.FC<{ size: number; seed?: number }> = ({ size, seed = 0 }) => {
  const flip = seed % 2 === 1;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" style={{ display: "inline-block", verticalAlign: "-0.16em", overflow: "visible" }}>
      <g transform={flip ? "translate(36 0) scale(-1 1) rotate(-6 18 18)" : undefined}>
        {/* the cone, mouth to the upper right */}
        <path d="M3.5 33 L13.2 12.6 L23.6 22.9 Z" fill="#F4B63F" />
        <path d="M3.5 33 L13.2 12.6 L16.3 15.7 Z" fill="#FFD36B" />
        <path d="M6.6 26.6 L11.4 31.4 M9.4 20.8 L17.6 28.6 M12.1 15.2 L21 24" stroke="#E2484F" strokeWidth={2.1} strokeLinecap="round" />
        <ellipse cx="18.4" cy="17.8" rx="7.4" ry="2.5" transform="rotate(45 18.4 17.8)" fill="#D9932A" />
        {/* streamers and confetti */}
        <path d="M19 15 C 21 9, 26 11, 25 6.5" stroke="#5CC8F2" strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <path d="M21.5 18.2 C 27 16, 28.5 20.5, 33 18" stroke="#FF5A8A" strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <rect x="27.5" y="5" width="3.2" height="3.2" rx="0.6" fill="#8BE07A" transform="rotate(20 29 6.6)" />
        <rect x="30.6" y="11.6" width="3" height="3" rx="0.6" fill="#FFD84A" transform="rotate(-15 32 13)" />
        <circle cx="22.6" cy="4.2" r="1.6" fill="#FF5A6E" />
        <circle cx="32.4" cy="24.4" r="1.5" fill="#5CC8F2" />
        <rect x="16.6" y="6.4" width="2.6" height="2.6" rx="0.5" fill="#B48CFF" transform="rotate(30 18 7.7)" />
      </g>
    </svg>
  );
};

/** the heart of the tapback */
export const Heart: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
    <defs>
      <linearGradient id="kn-heart" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FF7183" />
        <stop offset="1" stopColor="#E8364E" />
      </linearGradient>
    </defs>
    <path d="M12 20.6s-7.3-4.6-9.4-9.1C1.1 8.3 3 4.6 6.7 4.6c2.3 0 3.7 1.3 5.3 3.2 1.6-1.9 3-3.2 5.3-3.2 3.7 0 5.6 3.7 4.1 6.9-2.1 4.5-9.4 9.1-9.4 9.1z" fill="url(#kn-heart)" />
    <path d="M6.2 7.4c-1.3.3-2.1 1.6-1.9 3" stroke="#FFC2CB" strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.85} />
  </svg>
);
