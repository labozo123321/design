/**
 * The black hole, ray-traced per pixel on one full-screen quad.
 *
 * Units: the Schwarzschild radius r_s = 1, the hole at the origin, its accretion disk in the y = 0 plane
 * (inner edge at the innermost stable orbit, 3 r_s). Each pixel's ray is traced backwards from your eye:
 *
 *  1. Aberration: your velocity relative to an observer hovering where you are (uBeta) bends the view
 *     direction into that observer's frame, and shifts the colour of everything you see.
 *  2. A light ray in Schwarzschild spacetime stays in one plane through the hole. In that plane, with
 *     u = 1/r against the angle phi swept round the hole, its path obeys u'' = 1.5 u^2 - u (r_s = 1).
 *     That is integrated (RK4) from your eye until the ray falls through the horizon (u > 1), escapes to
 *     the sky (u < 0), or circles the photon sphere for too long.
 *  3. The ray crosses the disk's plane at fixed angles phi_c + k pi (the line where the two planes meet):
 *     each crossing inside the disk is a hit, interpolated exactly on the step (cubic Hermite). The first
 *     is the disk as you'd see it in flat space; the second is the far side of the disk, lensed over the
 *     top and under the bottom of the shadow; the third hugs the photon ring.
 *  4. The disk's light is shifted by g = (gravity at the disk / gravity at you) x the gas's Doppler shift
 *     (it orbits at up to half the speed of light) x your own Doppler shift: colour by temperature, a
 *     blackbody at g T, brightness by (g T)^k. The sky's light falls in from far away: blueshifted by
 *     1 / sqrt(1 - 1/r) when you hover, enormously so just above the horizon.
 *
 * Anti-aliasing: everything is shaded after the loop, so screen-space derivatives of where each pixel's ray
 * ends up (the sky direction, the disk coordinates) give its footprint. Lensing stretches it hugely near the
 * shadow's edge: stars, sky and disk texture are filtered over it (stars as anisotropic Gaussians).
 */
export const BH_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const BH_FRAG = /* glsl */ `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uPos;
uniform float uEps;
uniform vec3 uBeta;
uniform samplerCube uSky;
uniform sampler2D uNoise;
uniform float uSkyGain;
uniform float uStarGain;
uniform float uDiskGain;
uniform float uDiskT;
uniform float uFlow;
uniform float uPx;
uniform float uTime;
uniform float uInside;
uniform float uDebris;
uniform float uShiftMax;
varying vec2 vNdc;

const float PI = 3.14159265;
const float TAU = 6.28318531;
const float RIN = 3.0;
const float ROUT = 15.0;
const float PHIMAX = 12.0;
const int MAXSTEP = 300;

float accel(float u) { return 1.5 * u * u - u; }

// cubic Hermite through (0, a, da) and (1, b, db), slopes per unit s: value and slope at s
vec2 herm(float a, float da, float b, float db, float s) {
  float s2 = s * s;
  float s3 = s2 * s;
  float v = (2.0 * s3 - 3.0 * s2 + 1.0) * a + (s3 - 2.0 * s2 + s) * da + (-2.0 * s3 + 3.0 * s2) * b + (s3 - s2) * db;
  float d = (6.0 * s2 - 6.0 * s) * a + (3.0 * s2 - 4.0 * s + 1.0) * da + (-6.0 * s2 + 6.0 * s) * b + (3.0 * s2 - 2.0 * s) * db;
  return vec2(v, d);
}

uint hashu(uint x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float h01(uint h) { return float(h >> 8) * (1.0 / 16777216.0); }

// blackbody colour (linear RGB, brightest channel 1)
vec3 blackbody(float T) {
  float t = clamp(T, 800.0, 4.0e5) / 100.0;
  vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp(1.29293618606 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
  c.g = t <= 66.0 ? clamp(0.39008157876 * log(t) - 0.63184144378, 0.0, 1.0)
                  : clamp(1.12989086089 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.54320678911 * log(t - 10.0) - 1.19625408914, 0.0, 1.0));
  return pow(c, vec3(2.2));
}

// light shifted by g: bluer and brighter, or redder and dimmer (intensity ~ g^3, compressed when huge)
vec3 shifted(vec3 c, float g) {
  float lg = log2(max(g, 1e-6));
  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 o = lg > 0.0
    ? mix(c, L * vec3(0.62, 0.86, 1.65), clamp(lg * 0.45, 0.0, 0.92))
    : mix(c, L * vec3(1.7, 0.62, 0.22), clamp(-lg * 0.9, 0.0, 0.95));
  float k = g * g;
  return o * k / (1.0 + k / uShiftMax);
}

// cube-face coordinates for the procedural stars (any consistent layout will do)
vec2 cubeST(vec3 d, out int face) {
  vec3 a = abs(d);
  if (a.x >= a.y && a.x >= a.z) { face = d.x > 0.0 ? 0 : 1; return d.yz / a.x; }
  if (a.y >= a.z) { face = d.y > 0.0 ? 2 : 3; return d.xz / a.y; }
  face = d.z > 0.0 ? 4 : 5;
  return d.xy / a.z;
}
vec3 faceDir(int face, vec2 st) {
  float s = (face == 0 || face == 2 || face == 4) ? 1.0 : -1.0;
  if (face < 2) return vec3(s, st.x, st.y);
  if (face < 4) return vec3(st.x, s, st.y);
  return vec3(st.x, st.y, s);
}

// one layer of stars: N cells per cube-face edge, a star in a fraction p of them, Gaussian images filtered
// over the pixel's footprint (covariance S in the tangent plane t1, t2 at d)
vec3 starLayer(vec3 d, vec3 t1, vec3 t2, vec3 Sfp, float ext, float N, float p, float fk, uint seed) {
  int face;
  vec2 st = cubeST(d, face);
  vec2 g = (st * 0.5 + 0.5) * N;
  vec2 cell = floor(g);
  uint h = hashu(uint(face) * 0x9E3779B1u ^ hashu(uint(cell.x) + 4099u * uint(cell.y) + seed * 0x85EBCA77u));
  float cellSa = (2.0 / N) * (2.0 / N) / pow(1.0 + dot(st, st), 1.5);
  float sig = 1.2e-4;
  // brightness: a power law, a few bright ones among many faint
  float x = h01(hashu(h ^ 0x27D4EB2Fu));
  float F = fk * min(60.0, pow(1.0 - 0.985 * x, -1.6));
  // colour: mostly white-yellow, some blue, some orange
  float ct = h01(hashu(h ^ 0x165667B1u));
  vec3 col = blackbody(mix(3200.0, 16000.0, ct * ct));
  vec3 mean = vec3(1.0, 0.9, 0.82) * p * fk * 10.0 / cellSa;
  float fade = smoothstep(0.1, 0.35, ext * N * 0.5);
  vec3 star = vec3(0.0);
  if (fade < 1.0 && h01(h) < p) {
    vec2 off = vec2(0.2 + 0.6 * h01(hashu(h ^ 0xB5297A4Du)), 0.2 + 0.6 * h01(hashu(h ^ 0x68E31DA4u)));
    vec3 ds = normalize(faceDir(face, (cell + off) / N * 2.0 - 1.0));
    vec3 dv = ds - d;
    vec2 del = vec2(dot(dv, t1), dot(dv, t2));
    // S = Sfp + sig^2 I, as (xx, xy, yy)
    vec3 S = Sfp + vec3(sig * sig, 0.0, sig * sig);
    float det = S.x * S.z - S.y * S.y;
    vec2 q = vec2(S.z * del.x - S.y * del.y, -S.y * del.x + S.x * del.y) / det;
    float e = dot(del, q);
    star = col * F * exp(-0.5 * e) / (TAU * sqrt(det));
  }
  return mix(star, mean, fade);
}

// the sky (escaped rays): Milky Way and nebulae from the cube map, stars on top
vec3 skyAt(vec3 d, vec3 dx, vec3 dy) {
  vec3 base = textureGrad(uSky, d, dx, dy).rgb * uSkyGain;
  vec3 t1 = normalize(cross(d, abs(d.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(d, t1);
  vec2 jx = vec2(dot(dx, t1), dot(dx, t2));
  vec2 jy = vec2(dot(dy, t1), dot(dy, t2));
  vec3 Sfp = 0.2 * vec3(jx.x * jx.x + jy.x * jy.x, jx.x * jx.y + jy.x * jy.y, jx.y * jx.y + jy.y * jy.y);
  // footprint extent (largest axis), radians
  float tr = Sfp.x + Sfp.z;
  float dt = Sfp.x * Sfp.z - Sfp.y * Sfp.y;
  float ext = sqrt(max(0.0, 0.5 * tr + sqrt(max(0.0, 0.25 * tr * tr - dt))));
  vec3 s = starLayer(d, t1, t2, Sfp, ext, 48.0, 0.55, 1.4e-7, 11u);
  s += starLayer(d, t1, t2, Sfp, ext, 140.0, 0.5, 4.0e-8, 23u);
  s += starLayer(d, t1, t2, Sfp, ext, 380.0, 0.45, 1.2e-8, 37u);
  return base + s * uStarGain;
}

float angDiff(float a) { return a - TAU * floor(a / TAU + 0.5); }

// the accretion disk at radius r, azimuth psi: emission (rgb, premultiplied) and opacity
vec4 diskAt(float r, float psi, float g, float mu, vec2 dr, vec2 dpsi) {
  // co-rotating angle: the gas orbits at Omega = sqrt(0.5 / r^3) (Kepler, r_s = 1)
  float om = sqrt(0.5 / (r * r * r));
  float pc = psi + om * uDiskT;
  float lr = log(r);
  // footprints in texture space, for filtering
  vec2 gx = vec2(dpsi.x / TAU, dr.x / r);
  vec2 gy = vec2(dpsi.y / TAU, dr.y / r);
  // concentric striations (radial frequency high, a slow wobble in angle), clumps and streaks
  vec2 q1 = vec2(pc / TAU * 2.0, lr * 2.2 - uFlow * 0.02);
  vec2 q2 = vec2(pc / TAU * 3.0, lr * 9.0 - uFlow * 0.05);
  vec2 q3 = vec2(pc / TAU * 7.0, lr * 26.0 - uFlow * 0.11);
  vec4 n1 = textureGrad(uNoise, q1, gx * vec2(2.0, 2.2), gy * vec2(2.0, 2.2));
  vec4 n2 = textureGrad(uNoise, q2 + (n1.gr - 0.5) * 0.06, gx * vec2(3.0, 9.0), gy * vec2(3.0, 9.0));
  vec4 n3 = textureGrad(uNoise, q3 + (n2.gr - 0.5) * 0.04, gx * vec2(7.0, 26.0), gy * vec2(7.0, 26.0));
  // bright bands with dark lanes between them, fine striations, slow clumps
  float bands = pow(clamp(n2.g * 1.3 - 0.1, 0.0, 1.3), 1.8);
  float lanes = 1.0 - 0.45 * smoothstep(0.52, 0.8, n2.b) - 0.2 * smoothstep(0.58, 0.85, n3.b);
  float rings = (0.55 + 0.9 * bands) * lanes * (0.85 + 0.35 * (n3.r - 0.5) * 2.0);
  float clump = smoothstep(0.25, 0.75, n1.g);
  float dens = rings * (0.7 + 0.55 * clump);
  // edges: emission dies at the innermost stable orbit; thins out far away
  float inner = smoothstep(RIN * 0.985, RIN * 1.18, r);
  float outer = 1.0 - smoothstep(ROUT * 0.55, ROUT, r);
  // Shakura-Sunyaev temperature, peak 1 at r = 4.08 r_s
  float x = r / RIN;
  float T = pow(x, -0.75) * pow(max(0.0, 1.0 - inversesqrt(x)), 0.25) / 0.488;
  float Tv = max(T, 0.42) * inner;
  // opacity from the smooth structure only: what's behind a translucent part of the disk (the lensed far
  // side, far brighter) is multiplied by 1 - alpha, and any fine noise in alpha would show up as a weave
  float cover = 0.75 + 0.5 * clump;
  float alpha = clamp(cover * (0.5 + 0.9 * T) * outer * smoothstep(RIN * 0.985, RIN * 1.06, r) * 1.5, 0.0, 1.0);
  // observed: a blackbody at g T (peak ~6000 K), brightness ~ (g T)^3
  float Tobs = 4500.0 * Tv * g;
  vec3 col = blackbody(Tobs);
  float b = pow(clamp(g, 0.0, 1e4) * Tv, 3.0);
  b = b / (1.0 + b / (0.4 * uShiftMax));
  // limb darkening: the disk's surface is dimmer seen edge-on
  float limb = 0.62 + 0.38 * mu;
  vec3 em = col * b * (0.2 + 1.0 * dens) * limb * uDiskGain * outer * inner;
  // the plunging gas inside the innermost orbit: a faint hot haze spiralling in
  float plunge = smoothstep(1.6, 2.9, r) * (1.0 - smoothstep(2.95, 3.1, r));
  em += blackbody(5200.0 * g) * plunge * 0.35 * min(g * g * g, 30.0) * uDiskGain * (0.5 + n2.g);
  alpha = max(alpha, plunge * 0.25);
  return vec4(em * alpha, alpha);
}

// Inside the horizon, looking down: the gas that fell in before you is still below you (falling too),
// stretched by the tides into long glowing streams that spiral in towards the centre, its light reddened
// as you chase it. A tunnel: angle round the way down and log of the angle from it.
vec3 interior(vec3 n, vec3 down, float k) {
  vec3 a1 = normalize(cross(down, abs(down.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 a2 = cross(down, a1);
  float c = dot(n, down);
  float th = acos(clamp(c, -1.0, 1.0));
  float az = atan(dot(n, a2), dot(n, a1));
  float dep = -log(max(th, 2e-3));
  float d2 = uDebris * uDebris;
  // the streams twist round (the gas still has its orbital spin) and rush in towards the centre
  float spin = uTime * (0.05 + 0.25 * d2);
  float flow = uTime * (0.25 + 1.6 * d2);
  float tw = dep * 0.18;
  vec2 q = vec2(az / TAU * 9.0 + tw + spin, dep * 0.16 + flow * 0.22);
  vec2 q2 = vec2(az / TAU * 23.0 + tw * 1.5 + spin * 1.3, dep * 0.3 + flow * 0.4);
  // filter over the pixel's footprint (seam-safe in angle)
  float dax = angDiff(dFdx(az)) / TAU;
  float day = angDiff(dFdy(az)) / TAU;
  vec2 gx = vec2(dax * 9.0 + dFdx(dep) * 0.18, dFdx(dep) * 0.16);
  vec2 gy = vec2(day * 9.0 + dFdy(dep) * 0.18, dFdy(dep) * 0.16);
  vec4 n1 = textureGrad(uNoise, q, gx, gy);
  vec4 n2 = textureGrad(uNoise, q2, gx * 2.6, gy * 2.6);
  // thin bright filaments on a dark ground, in clumps
  float fil = smoothstep(0.62, 0.86, n1.b) * smoothstep(0.35, 0.75, n1.g);
  float fil2 = smoothstep(0.66, 0.9, n2.b) * smoothstep(0.4, 0.8, n2.g) * 0.7;
  float streams = fil + fil2;
  // brightest partway out from the vanishing point, fading towards the edges of view
  float ring = smoothstep(0.03, 0.3, th) * (1.0 - smoothstep(0.55, 1.2, th));
  float core = exp(-th * th / 0.012) * 0.5 + exp(-th * th / 0.08) * 0.12;
  vec3 hot = mix(vec3(1.0, 0.2, 0.07), vec3(1.0, 0.5, 0.24), n2.g);
  hot = mix(hot, vec3(0.8, 0.85, 1.0), smoothstep(0.7, 1.0, uDebris) * n1.r);
  float glow = 0.04 * ring * n1.g;
  return (hot * (streams * ring * 1.5 + glow) + vec3(1.0, 0.32, 0.15) * core) * k * (0.3 + 1.1 * d2);
}

void main() {
  vec4 v4 = uInvProj * vec4(vNdc, -1.0, 1.0);
  vec3 nO = normalize(mat3(uCamWorld) * normalize(v4.xyz / v4.w));

  // ---- aberration into the frame of an observer hovering here
  float b2 = dot(uBeta, uBeta);
  vec3 nS = nO;
  float dop = 1.0;
  if (b2 > 1e-10) {
    float bm = sqrt(b2);
    vec3 bh = uBeta / bm;
    float gm = inversesqrt(1.0 - b2);
    float bn = dot(uBeta, nO);
    nS = normalize((nO + (gm - 1.0) * dot(nO, bh) * bh - gm * uBeta) / (gm * (1.0 - bn)));
    dop = 1.0 / (gm * (1.0 - bn));
  }
  float lapse = sqrt(uEps / (1.0 + uEps));
  float gObs = dop / lapse;

  // ---- the ray's plane: radial er, tangential et
  vec3 er = normalize(uPos);
  float ca = dot(nS, er);
  vec3 et = nS - ca * er;
  float sa = length(et);
  et = sa > 1e-7 ? et / sa : normalize(cross(er, abs(er.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  sa = max(sa, 1e-7);

  float u = 1.0 / (1.0 + uEps);
  float up = -u * lapse * ca / sa;
  float phi = 0.0;
  // where the ray's plane meets the disk's: y(phi) = r (cos phi er.y + sin phi et.y) = 0
  float del = atan(et.y, er.y);
  float nextX = mod(del + 0.5 * PI, PI);
  if (nextX < 1e-6) nextX += PI;
  // the ray's first three crossings of the disk's plane, in fixed slots: (r, phi, du/dphi), and whether
  // each lands on the disk. Slots never shift, so a neighbouring pixel's slot k is the same crossing and
  // the derivatives of r across it stay smooth (also where it runs off the disk's edge)
  vec3 hit0 = vec3(60.0, 0.0, 0.0);
  vec3 hit1 = hit0;
  vec3 hit2 = hit0;
  vec3 onDisk = vec3(0.0);
  int nX = 0;
  float fate = 0.0;   // 1 escaped, 0 captured
  float phiEnd = 0.0;
  for (int i = 0; i < MAXSTEP; i++) {
    float h = mix(0.045, 0.2, smoothstep(0.42, 0.08, u));
    float k1u = up, k1v = accel(u);
    float k2u = up + 0.5 * h * k1v, k2v = accel(u + 0.5 * h * k1u);
    float k3u = up + 0.5 * h * k2v, k3v = accel(u + 0.5 * h * k2u);
    float k4u = up + h * k3v, k4v = accel(u + h * k3u);
    float un = u + h / 6.0 * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
    float upn = up + h / 6.0 * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);
    // disk crossings in this step
    for (int k = 0; k < 2; k++) {
      if (nextX > phi + h) break;
      float s = (nextX - phi) / h;
      vec2 hv = herm(u, up * h, un, upn * h, s);
      vec3 rec = vec3(1.0 / clamp(hv.x, 1.0 / 60.0, 1.2), nextX, hv.y / h);
      float ok = (hv.x > 1.0 / ROUT && hv.x < 1.0 / 1.6) ? 1.0 : 0.0;
      if (nX == 0) { hit0 = rec; onDisk.x = ok; }
      else if (nX == 1) { hit1 = rec; onDisk.y = ok; }
      else if (nX == 2) { hit2 = rec; onDisk.z = ok; }
      nX++;
      nextX += PI;
    }
    if (un <= 0.0) {
      // escaped: where u reaches 0 on this step (two Newton steps on the Hermite cubic)
      float s = u / (u - un);
      for (int k = 0; k < 2; k++) {
        vec2 hv = herm(u, up * h, un, upn * h, s);
        s = clamp(s - hv.x / (abs(hv.y) > 1e-6 ? hv.y : -1e-6), 0.0, 1.0);
      }
      phiEnd = phi + s * h;
      fate = 1.0;
      break;
    }
    if (un >= 1.0) { phiEnd = phi + h; break; }
    u = un;
    up = upn;
    phi += h;
    if (phi > PHIMAX) { phiEnd = phi; break; }
  }

  // ---- shading (outside the loop: derivatives are defined)
  vec3 dEsc = cos(phiEnd) * er + sin(phiEnd) * et;
  vec3 ddx = dFdx(dEsc);
  vec3 ddy = dFdy(dEsc);
  // near the shadow lensing squeezes a whole hemisphere of sky into a few pixels: the footprint really is
  // that big, and filtering over it gives the smooth glow of the ring (only cap the absurd)
  float dl = max(length(ddx), length(ddy));
  float cap = min(1.0, 3.0 / max(dl, 1e-9));
  ddx *= cap;
  ddy *= cap;
  vec3 col = vec3(0.0);
  if (fate > 0.5) col = shifted(skyAt(dEsc, ddx, ddy), gObs);

  // disk hits, back to front
  for (int k = 2; k >= 0; k--) {
    vec3 hk = k == 0 ? hit0 : (k == 1 ? hit1 : hit2);
    bool has = (k == 0 ? onDisk.x : (k == 1 ? onDisk.y : onDisk.z)) > 0.5;
    float r = hk.x;
    float ph = hk.y;
    vec3 ep = cos(ph) * er + sin(ph) * et;
    vec3 xh = r * ep;
    float psi = atan(xh.z, xh.x);
    // the lensed images are squeezed thin: filter them a little wider
    float wide = k == 0 ? 1.0 : 1.8;
    vec2 drr = vec2(dFdx(r), dFdy(r)) * wide;
    vec2 dps = vec2(angDiff(dFdx(psi)), angDiff(dFdy(psi))) * wide;
    // at the shadow's edge the neighbour's ray fell in first: keep the footprint sane
    drr = clamp(drr, vec2(-0.6), vec2(0.6));
    dps = clamp(dps, vec2(-0.5), vec2(0.5));
    if (!has) continue;
    // the ray's direction at the disk, in the frame of a static observer there
    vec3 eq = -sin(ph) * er + cos(ph) * et;
    float uu = 1.0 / r;
    float drdphi = -hk.z / (uu * uu);
    vec3 ne = normalize(drdphi / sqrt(1.0 - uu) * ep + r * eq);
    // the gas orbits (prograde, round +y) at beta = sqrt(0.5 / (r - 1))
    vec3 sdir = normalize(vec3(xh.z, 0.0, -xh.x));
    float be = sqrt(0.5 / (r - 1.0));
    float ge = inversesqrt(1.0 - be * be);
    float g = sqrt(1.0 - uu) / lapse * dop / (ge * (1.0 + be * dot(sdir, ne)));
    vec4 dk = diskAt(r, psi, g, abs(ne.y), drr, dps);
    col = dk.rgb + (1.0 - dk.a) * col;
  }

  if (uInside > 0.0) col += interior(nO, -er, uInside);
  gl_FragColor = vec4(col, 1.0);
}
`;
