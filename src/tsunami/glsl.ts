/**
 * GLSL shared by the sky, the sea and the ground: hash noise, and the golden-hour sky as a function of
 * direction (so the sea reflects exactly the sky you see, and the haze on the horizon matches it).
 */

export const NOISE = /* glsl */ `
float tsHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float tsNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = tsHash(i);
  float b = tsHash(i + vec2(1.0, 0.0));
  float c = tsHash(i + vec2(0.0, 1.0));
  float d = tsHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float tsFbm(vec2 p) {
  float f = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    f += a * tsNoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return f / 0.96875;
}
`;

/** Needs uniforms: vec3 uSun. */
export const SKY = /* glsl */ `
vec3 skyCol(vec3 d) {
  d = normalize(d);
  float e = d.y;
  vec2 hz = normalize(d.xz + vec2(1e-5, 0.0));
  vec2 hs = normalize(uSun.xz);
  float az = dot(hz, hs) * 0.5 + 0.5;
  vec3 zen = vec3(0.12, 0.25, 0.56);
  vec3 mid = vec3(0.34, 0.5, 0.8);
  vec3 horAway = vec3(0.84, 0.68, 0.66);
  vec3 horSun = vec3(1.2, 0.74, 0.42);
  vec3 hor = mix(horAway, horSun, pow(az, 2.6));
  float h = max(e, 0.0);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.3, pow(h, 0.8)));
  col = mix(col, zen, smoothstep(0.22, 1.0, h));
  if (e < 0.0) col = hor * 0.93;
  float s = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.6, 0.28) * (pow(s, 8.0) * 0.35 + pow(s, 48.0) * 0.9);
  return col;
}
`;

/** The sky's clouds: a sunset deck of fair-weather cumulus, lit gold on the sun's side. Needs SKY, NOISE. */
export const CLOUDS = /* glsl */ `
vec4 skyClouds(vec3 d) {
  d = normalize(d);
  if (d.y < 0.004) return vec4(0.0);
  vec2 p = d.xz / (d.y + 0.03) * 0.7;
  float n = tsFbm(p * 1.1 + vec2(3.1, -1.7));
  float n2 = tsFbm(p * 3.7 + vec2(-5.2, 2.4));
  float c = smoothstep(0.5, 0.74, n * 0.8 + n2 * 0.25);
  c *= smoothstep(0.004, 0.05, d.y) * (1.0 - smoothstep(0.55, 0.9, d.y) * 0.7);
  vec2 hz = normalize(d.xz + vec2(1e-5, 0.0));
  float az = dot(hz, normalize(uSun.xz)) * 0.5 + 0.5;
  float s = max(dot(d, uSun), 0.0);
  vec3 base = vec3(0.5, 0.45, 0.55);
  vec3 lit = vec3(1.7, 1.05, 0.62);
  // thin edges glow, thick middles stay grey-violet
  float edge = 1.0 - smoothstep(0.55, 0.85, n2 * 0.6 + n * 0.6);
  vec3 col = mix(base, lit, clamp(pow(az, 3.0) * 0.8 + edge * 0.35 + pow(s, 6.0), 0.0, 1.0));
  return vec4(col, c * 0.92);
}
`;
