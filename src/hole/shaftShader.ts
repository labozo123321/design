/**
 * Everything underground, ray-cast per pixel on one full-screen quad (no wall geometry: no cracks along
 * long thin triangles, no precision trouble kilometres down). Writes a log depth like three's materials,
 * so the set pieces (meshes) sort against it.
 *
 * The shaft is a cylinder of radius uR round a vertical axis. A pixel's ray hits its far wall at some w
 * (metres of visual scroll below the surface the shaft is measured from); through the depth knots that is
 * a real depth (km), so a rock and a temperature: soil and clay, sedimentary strata, granite, gneiss, olive
 * peridotite with diamonds, blue ringwoodite, the glowing lower mantle, then the outer core, where the
 * shaft becomes a ribbed glass tube through a cavern of liquid iron (another, much wider cylinder with a
 * ceiling and a floor), and the white-hot inner core. Lights: daylight (moonlight) through the opening,
 * service lamps spiralling down the crust (they die where the rock gets hot), and incandescence.
 *
 * The walls scroll past at up to 150 m/s, so anything that depends on w is averaged over the shutter.
 */
export const SHAFT_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SHAFT_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uLogFC;
uniform float uSurf;
uniform vec2 uAxis;
uniform float uR;
uniform float uRC;
uniform float uKW[24];
uniform float uKD[24];
uniform float uBlur;
uniform float uTime;
uniform float uSide;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform float uLampK;
uniform vec3 uLampCol;
uniform float uTrainW;
uniform float uTrainR;
uniform float uCaveW;
uniform float uMineW;
uniform float uDiaW;
uniform float uHot;
varying vec2 vNdc;

const float LAMP_DW = 9.0;
const float LAMP_W0 = 8.0;
const float GOLD = 2.39996323;
const float TAU = 6.28318531;

float hash1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

float depthKm(float w, out float slope) {
  slope = 0.0;
  if (w <= uKW[0]) return 0.0;
  for (int i = 0; i < 23; i++) {
    if (w < uKW[i + 1]) {
      float a = uKW[i];
      float b = uKW[i + 1];
      slope = (uKD[i + 1] - uKD[i]) / (b - a);
      return uKD[i] + (w - a) * slope;
    }
  }
  return 6371.0;
}

float tempC(float km) {
  if (km < 4.0) return mix(15.0, 60.0, km / 4.0);
  if (km < 12.3) return mix(60.0, 180.0, (km - 4.0) / 8.3);
  if (km < 35.0) return mix(180.0, 600.0, (km - 12.3) / 22.7);
  if (km < 100.0) return mix(600.0, 1300.0, (km - 35.0) / 65.0);
  if (km < 150.0) return mix(1300.0, 1400.0, (km - 100.0) / 50.0);
  if (km < 410.0) return mix(1400.0, 1500.0, (km - 150.0) / 260.0);
  if (km < 660.0) return mix(1500.0, 1900.0, (km - 410.0) / 250.0);
  if (km < 2890.0) return mix(1900.0, 3700.0, (km - 660.0) / 2230.0);
  if (km < 5150.0) return mix(4000.0, 5400.0, (km - 2890.0) / 2260.0);
  return mix(5400.0, 5500.0, clamp((km - 5150.0) / 1221.0, 0.0, 1.0));
}

/** Incandescence: dull red from ~500 C, through deep orange, to yellow and white near the centre. Kept
 *  saturated and under ~0.7: ACES bleaches anything much over 1 toward white, and the bloom does the rest. */
vec3 heat(float T) {
  vec3 c = mix(vec3(0.5, 0.02, 0.0), vec3(1.0, 0.1, 0.008), smoothstep(500.0, 900.0, T));
  c = mix(c, vec3(1.0, 0.22, 0.03), smoothstep(900.0, 1500.0, T));
  c = mix(c, vec3(1.0, 0.3, 0.05), smoothstep(1500.0, 2500.0, T));
  c = mix(c, vec3(1.0, 0.4, 0.09), smoothstep(2500.0, 3700.0, T));
  c = mix(c, vec3(1.0, 0.52, 0.16), smoothstep(3700.0, 5000.0, T));
  c = mix(c, vec3(1.0, 0.64, 0.28), smoothstep(5000.0, 5500.0, T));
  float I = smoothstep(420.0, 900.0, T) * (0.22 + 0.24 * smoothstep(1000.0, 3500.0, T)
    + 0.22 * smoothstep(4000.0, 5500.0, T));
  return c * I;
}

/** How much of a pixel (footprint fw, centred at x) the box [-h, h] covers: prefiltered, so tiny far-off
 *  lights fade to their average instead of twinkling. */
float boxCov(float x, float h, float fw) {
  float a = max(x - 0.5 * fw, -h);
  float b = min(x + 0.5 * fw, h);
  return max(0.0, b - a) / fw;
}

/** Far root of a ray against the vertical cylinder of radius r (from inside, or the far wall from outside). */
float farHit(vec3 ro, vec3 rd, float r) {
  vec2 oc = ro.xz - uAxis;
  vec2 dd = rd.xz;
  float a = dot(dd, dd);
  float b = dot(oc, dd);
  float c = dot(oc, oc) - r * r;
  float disc = b * b - a * c;
  if (a < 1e-12 || disc < 0.0) return -1.0;
  return (-b + sqrt(disc)) / a;
}

void main() {
  // unproject onto the near plane (the far plane's w cancels to zero in float32 with a 2e7 far)
  vec4 vp = uInvProj * vec4(vNdc, -1.0, 1.0);
  vec3 vdir = normalize(vp.xyz / vp.w);
  vec3 rd = normalize(mat3(uCamWorld) * vdir);
  vec3 ro = uCamPos;
  vec3 fwd = -normalize(vec3(uCamWorld[2].xyz));

  // ---- the shaft wall this pixel looks at
  float t = farHit(ro, rd, uR);
  bool miss = t <= 0.0;
  t = miss ? 1.0 : min(t, 5e6);
  vec3 hit = ro + t * rd;
  vec2 d = hit.xz - uAxis;
  float th = atan(d.x, d.y);              // 0 toward +z, +pi/2 toward +x
  float u = th / TAU + 0.5;
  float w = uSurf - hit.y;                // metres down the shaft
  float s = th * uR;                      // arc length round the wall

  // ---- the cavern (outer core), always computed so its derivatives are defined everywhere
  float kCMB = uKW[18];
  float kICB = uKW[21];
  float tc = farHit(ro, rd, uRC);
  tc = tc <= 0.0 ? 1.0 : min(tc, 5e6);
  float wc = uSurf - (ro.y + tc * rd.y);
  float tTop = (uSurf - kCMB - ro.y) / (abs(rd.y) > 1e-6 ? rd.y : 1e-6);
  float tBot = (uSurf - kICB - ro.y) / (abs(rd.y) > 1e-6 ? rd.y : 1e-6);
  float cavT = wc < kCMB ? tTop : (wc > kICB ? tBot : tc);
  vec3 ch = ro + cavT * rd;
  float cth = atan(ch.x - uAxis.x, ch.z - uAxis.y);
  float cw = uSurf - ch.y;

  // ---- texture gradients that don't jump at the u seam
  vec2 uvA = vec2(u * 2.0, w / 13.83);
  vec2 dA1 = vec2(dFdx(uvA.x), dFdy(uvA.x));
  vec2 uS = vec2(dFdx(fract(uvA.x + 0.5)), dFdy(fract(uvA.x + 0.5)));
  if (dot(uS, uS) < dot(dA1, dA1)) dA1 = uS;
  vec2 dAv = vec2(dFdx(uvA.y), dFdy(uvA.y));
  vec2 gx = vec2(dA1.x, dAv.x);
  vec2 gy = vec2(dA1.y, dAv.y);
  float fwS = length(dA1) * 13.83 + 1e-4;    // arc-length metres per pixel
  float fwW = length(dAv) * 13.83 + 1e-4;    // w metres per pixel
  // the cavern surface: wall (angle, depth) or ceiling/floor (x, z), in 60 m tiles
  vec2 cuv = wc >= kCMB && wc <= kICB ? vec2(cth / TAU * 16.0, cw / 62.8) : (ch.xz - uAxis) / 60.0;
  vec2 cd1 = vec2(dFdx(cuv.x), dFdy(cuv.x));
  vec2 cS = vec2(dFdx(fract(cuv.x + 0.5)), dFdy(fract(cuv.x + 0.5)));
  if (dot(cS, cS) < dot(cd1, cd1)) cd1 = cS;
  vec2 cgx = vec2(cd1.x, dFdx(cuv.y));
  vec2 cgy = vec2(cd1.y, dFdy(cuv.y));

  if (miss || w < 0.0) discard;

  // ---- openings cut by the set pieces (near side only)
  if (uSide < 0.5) {
    // the metro tunnel crossing east-west
    if (d.y * d.y + (w - uTrainW) * (w - uTrainW) < uTrainR * uTrainR) discard;
    // the crystal cave, on the +z side, ragged
    float ce = (s / 6.8) * (s / 6.8) + ((w - uCaveW) / 5.2) * ((w - uCaveW) / 5.2);
    if (ce < 1.0 + 0.35 * (textureGrad(uTex, vec2(u * 3.0, w / 9.0), gx * 1.5, gy * 1.5).g - 0.5)) discard;
    // the mine: five levels of galleries opening on the +x side
    float ms = (th - 1.5707963) * uR;
    if (abs(ms) < 1.9 && w > uMineW - 13.0 && w < uMineW + 13.0) {
      float lv = (w - uMineW) / 6.5;
      float f = lv - floor(lv + 0.5);
      if (abs(f * 6.5) < 1.55 && abs(lv) < 2.5) discard;
    }
  }

  float slope;
  float km0 = depthKm(w, slope);
  float kSoil = uKW[3];
  float kSed = uKW[7];
  float kGran = uKW[9];
  float kMoho = uKW[10];
  float kDia0 = uKW[12];
  float kDia1 = uKW[13];
  float k410 = uKW[14];
  float k660 = uKW[15];
  vec3 nrm = -vec3(d.x, 0.0, d.y) / uR;

  // pixel-stable jitter for the shutter samples
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  int n = uBlur > 0.08 ? 8 : 1;
  vec3 acc = vec3(0.0);
  bool glass = w > kCMB && w < kICB;
  float depthT = t;

  if (glass) {
    // ---- through the glass: the cavern of liquid iron
    float dist = cavT;
    depthT = cavT;
    float rib = 0.0;
    for (int k = 0; k < 8; k++) {
      if (k >= n) break;
      float off = n == 1 ? 0.0 : uBlur * ((float(k) + jit) / 8.0 - 0.5);
      vec3 col;
      if (wc >= kCMB && wc <= kICB) {
        // the wall far out: molten iron flowing in slow convection bands
        vec2 q = vec2(cuv.x * 0.3, (cw + off) / 200.0);
        vec4 a = textureGrad(uTex, q + vec2(uTime * 0.004, uTime * 0.01), cgx * 0.3, cgy * 0.32);
        vec4 b = textureGrad(uTex, q * vec2(1.5, 2.5) + vec2(uTime * 0.015, -uTime * 0.02) + (a.gr - 0.5) * 0.35,
          cgx * 0.45, cgy * 0.8);
        float flow = smoothstep(0.55, 0.92, b.b);
        col = mix(vec3(0.22, 0.035, 0.003), vec3(0.8, 0.24, 0.03), smoothstep(0.2, 0.8, a.g)) * (0.35 + 0.5 * a.r);
        col += vec3(1.0, 0.5, 0.12) * flow * (0.6 + 0.6 * a.r);
      } else if (wc < kCMB) {
        // the ceiling: the bottom of the mantle, cracked and glowing
        vec2 q = cuv + vec2(0.0, off / 60.0);
        vec4 a = textureGrad(uTex, q, cgx, cgy);
        col = vec3(0.2, 0.04, 0.008) * (0.4 + a.r) + vec3(1.0, 0.36, 0.06) * smoothstep(0.75, 0.92, a.b) * 1.2;
      } else {
        // the floor: the inner core, a field of white-hot crystals
        vec2 q = cuv * 3.0 + vec2(0.0, off / 20.0);
        vec4 a = textureGrad(uTex, q, cgx * 3.0, cgy * 3.0);
        col = vec3(1.0, 0.5, 0.15) * (0.12 + 0.6 * smoothstep(0.05, 0.6, a.a) * (0.5 + 0.5 * a.r));
      }
      // the glowing haze of the core thickens with distance
      float haze = (1.0 - exp(-dist / 700.0)) * 0.8;
      col = mix(col, vec3(0.4, 0.11, 0.015), haze);
      // the tube's ribs and struts, in front
      float ws = w + off;
      float rr = abs(fract(ws / 22.0) - 0.5) * 22.0;
      float ribC = boxCov(rr, 0.16, fwW);
      float sq = uR * 1.5707963;
      float sx = abs(fract(s / sq + 0.5) - 0.5) * sq;
      float strut = boxCov(sx, 0.045, fwS);
      float cov = max(ribC, strut * 0.8);
      col = mix(col * 0.93, vec3(0.3, 0.8, 1.0) * (2.6 * ribC + 0.7 * strut), cov);
      acc += col;
    }
  } else {
    for (int k = 0; k < 8; k++) {
      if (k >= n) break;
      float ws = n == 1 ? w : w + uBlur * ((float(k) + jit) / 8.0 - 0.5);
      float km = km0 + (ws - w) * slope;
      float T = tempC(km);
      vec4 tn = textureGrad(uTex, vec2(uvA.x, ws / 13.83), gx, gy);
      vec4 tm = textureGrad(uTex, vec2(uvA.x * 5.0 + 0.31, ws / 2.766 + 0.17), gx * 5.0, gy * 5.0);
      vec3 alb;
      vec3 emi = vec3(0.0);

      if (ws < 0.45) {
        // the collar: paving on top, then the concrete ring with a dashed band of warning lights
        if (ws < 0.11) alb = uSide < 0.5 ? vec3(0.62, 0.55, 0.46) : vec3(0.72, 0.68, 0.6);
        else alb = vec3(0.42, 0.41, 0.4) * (0.8 + 0.35 * tm.r);
        if (ws > 0.23 && ws < 0.29) {
          float dash = boxCov(abs(fract(s / 0.34) - 0.5) * 0.34, 0.09, fwS);
          vec3 led = uSide < 0.5 ? vec3(1.0, 0.5, 0.1) : vec3(0.35, 0.8, 1.0);
          emi += led * dash * 9.0;
          alb = vec3(0.05);
        }
      } else if (ws < 1.6) {
        // topsoil with roots
        alb = uSide < 0.5 ? vec3(0.19, 0.13, 0.085) : vec3(0.62, 0.55, 0.42);
        alb *= 0.7 + 0.6 * tn.r;
        float root = smoothstep(0.86, 0.93, tm.b);
        alb = mix(alb, vec3(0.08, 0.055, 0.04), root * 0.8);
      } else if (ws < kSoil) {
        // clay with gravel lenses (coral sand on the island)
        vec3 clay = uSide < 0.5 ? vec3(0.42, 0.26, 0.15) : vec3(0.76, 0.69, 0.55);
        alb = clay * (0.75 + 0.5 * tn.g) * (0.85 + 0.3 * tm.r);
        // small stones: the brighter cells of the fine cellular pattern, with dark rims
        float stone = smoothstep(0.84, 0.9, tm.g) * smoothstep(0.1, 0.3, tm.a);
        alb = mix(alb, vec3(0.44, 0.36, 0.29) * (0.75 + 0.4 * tm.r), stone * 0.7);
        alb *= 0.75 + 0.25 * smoothstep(0.0, 0.12, tm.a);
      } else if (ws < kSed) {
        // sedimentary strata: wavy bands of sandstone, shale, limestone, mudstone, the odd coal seam
        float bw = ws + (tn.g - 0.5) * 1.4;
        float bi = floor(bw / 1.7);
        float h = hash1(bi + uSide * 91.0);
        vec3 c;
        if (uSide < 0.5) {
          c = h < 0.25 ? vec3(0.62, 0.46, 0.3) : h < 0.45 ? vec3(0.3, 0.29, 0.28) : h < 0.65 ? vec3(0.68, 0.64, 0.55)
            : h < 0.85 ? vec3(0.45, 0.33, 0.26) : h < 0.94 ? vec3(0.52, 0.45, 0.37) : vec3(0.06, 0.055, 0.05);
        } else {
          // the island: layered lava flows and pale coral limestone
          c = h < 0.35 ? vec3(0.14, 0.13, 0.13) : h < 0.55 ? vec3(0.22, 0.18, 0.16) : h < 0.85 ? vec3(0.74, 0.7, 0.6)
            : vec3(0.33, 0.28, 0.25);
        }
        float lam = 0.9 + 0.1 * sin(bw * 23.0 + tn.r * 3.0);
        alb = c * lam * (0.75 + 0.5 * tm.r);
        alb *= 1.0 - 0.5 * smoothstep(0.88, 0.95, tn.b);
      } else if (ws < kGran) {
        // granite: grey-pink with black mica and white feldspar (pillow basalt on the far side)
        if (uSide < 0.5) {
          alb = mix(vec3(0.56, 0.5, 0.47), vec3(0.66, 0.5, 0.45), step(0.6, tn.g)) * (0.85 + 0.25 * tn.r);
          alb = mix(alb, vec3(0.08, 0.075, 0.07), smoothstep(0.3, 0.22, tm.r));
          alb = mix(alb, vec3(0.84, 0.81, 0.78), smoothstep(0.76, 0.84, tm.r));
        } else {
          float pil = smoothstep(0.05, 0.3, tn.a);
          alb = vec3(0.16, 0.16, 0.17) * (0.6 + 0.5 * pil) * (0.85 + 0.3 * tm.r);
        }
        alb *= 1.0 - 0.5 * smoothstep(0.9, 0.96, tn.b);
      } else if (ws < kMoho) {
        // gneiss: folded dark and light bands, darkening toward the Moho
        float f = sin((ws + 7.0 * (tn.g - 0.5) + 2.5 * (tn.r - 0.5)) * 2.6);
        alb = mix(vec3(0.22, 0.21, 0.21), vec3(0.56, 0.52, 0.48), smoothstep(-0.3, 0.3, f));
        alb *= (0.8 + 0.35 * tm.r) * mix(1.0, 0.55, smoothstep(kGran, kMoho, ws));
      } else if (ws < k410) {
        // upper mantle: olive peridotite (and kimberlite, with diamonds, around 150-220 km)
        alb = mix(vec3(0.24, 0.29, 0.12), vec3(0.36, 0.42, 0.19), tn.g) * (0.75 + 0.45 * tm.r);
        alb = mix(alb, vec3(0.05, 0.06, 0.045), smoothstep(0.3, 0.2, tm.r) * 0.8);
        float dia = smoothstep(uDiaW - 45.0, uDiaW - 30.0, ws) * (1.0 - smoothstep(uDiaW + 40.0, uDiaW + 60.0, ws));
        if (dia > 0.0) {
          // kimberlite: blue-grey, studded with diamonds that flash in the glow
          alb = mix(alb, vec3(0.18, 0.25, 0.25) * (0.8 + 0.4 * tm.g), dia * 0.7);
          vec2 cell = vec2(uvA.x * 24.0, ws / 13.83 * 24.0);
          float cellId = floor(cell.x) + 97.0 * floor(cell.y);
          float hasD = step(0.92, hash1(cellId));
          vec2 f = fract(cell) - 0.5;
          float core = smoothstep(0.1, 0.0, length(f));
          float tw = 0.55 + 0.45 * sin(uTime * 11.0 + cellId * 1.7);
          emi += vec3(0.8, 0.92, 1.0) * hasD * core * tw * 24.0 * dia;
        }
      } else if (ws < k660) {
        // transition zone: blue ringwoodite
        alb = mix(vec3(0.1, 0.14, 0.33), vec3(0.2, 0.28, 0.52), tn.g) * (0.75 + 0.45 * tm.r);
      } else if (ws < kCMB) {
        // lower mantle: dark bridgmanite
        alb = vec3(0.18, 0.11, 0.09) * (0.7 + 0.5 * tm.r);
      } else {
        // the inner core: white-hot iron crystals
        alb = vec3(0.5, 0.45, 0.4);
        float facet = smoothstep(0.05, 0.5, tn.a) * (0.5 + 0.5 * tm.r);
        float big = 0.55 + 0.55 * tn.g;
        emi += heat(T) * (0.08 + 1.05 * facet * big) + vec3(1.0, 0.8, 0.5) * smoothstep(0.85, 0.97, tm.b) * 0.5;
      }

      // incandescence: cool dark crusts, glowing cracks; molten seams running in the lower mantle
      if (ws >= kMoho && ws < kCMB) {
        float crack = smoothstep(0.7, 0.9, tn.b);
        float fine = smoothstep(0.82, 0.95, tm.b);
        float crust = 0.06 + 0.75 * smoothstep(0.25, 0.85, tn.r) * (0.6 + 0.4 * tm.g);
        emi += heat(T) * crust + heat(T + 600.0) * (crack * 2.2 + fine * 0.5);
        float flow = smoothstep(0.82, 0.95, textureGrad(uTex, vec2(uvA.x * 1.5 + uTime * 0.02, ws / 30.0 - uTime * 0.05), gx * 1.5, gy).b);
        emi += vec3(1.0, 0.38, 0.05) * flow * 1.3 * smoothstep(k660, k660 + 60.0, ws);
      }

      // ---- light on the rock
      vec3 light = vec3(0.01, 0.009, 0.01);
      float sky = 0.5 * (1.0 - ws / sqrt(ws * ws + 4.0 * uR * uR));
      light += uSkyCol * sky;
      if (uSunDir.y > 0.01) {
        vec2 q = d + (ws / uSunDir.y) * uSunDir.xz;
        light += uSunCol * step(length(q), uR) * max(0.0, dot(nrm, uSunDir));
      }
      // service lamps spiralling down the wall
      // the lamps hold out to just past the Moho, flickering as they go
      float lampLife = uLampK * (1.0 - smoothstep(520.0, 640.0, T));
      if (lampLife > 0.001 && ws > 1.5) {
        float k0 = floor((ws - LAMP_W0) / LAMP_DW);
        for (int j = -1; j <= 2; j++) {
          float kk = k0 + float(j);
          if (kk < 0.0) continue;
          float lw = LAMP_W0 + kk * LAMP_DW;
          float la = mod(kk * GOLD, TAU) - 3.14159265;
          float dth = mod(th - la + 3.14159265, TAU) - 3.14159265;
          float chord2 = 2.0 * uR * uR * (1.0 - cos(dth));
          float dw = ws - lw;
          float dd2 = chord2 + dw * dw + 0.25;
          float ir = 11.0 * chord2 * chord2 / (4.0 * uR * uR * dd2 * dd2);
          float ds = dth * uR;
          float pool = 1.1 * exp(-(ds * ds + dw * dw * 1.3) / 1.6);
          light += uLampCol * lampLife * (ir + pool);
          // the fixture: a dark housing and a bright strip (prefiltered)
          float hx = boxCov(ds, 0.26, fwS);
          float hy = boxCov(dw, 0.11, fwW);
          float cx = boxCov(ds, 0.19, fwS);
          float cy = boxCov(dw, 0.045, fwW);
          alb = mix(alb, vec3(0.04), hx * hy);
          emi += uLampCol * 30.0 * cx * cy * lampLife;
        }
      }
      acc += alb * light + emi;
    }
  }
  vec3 col = acc / float(n);
  col *= 1.0 + uHot;
  gl_FragColor = vec4(col, 1.0);
  float viewZ = max(0.05, depthT * dot(rd, fwd));
  gl_FragDepth = log2(1.0 + min(viewZ, 1e7)) * uLogFC * 0.5;
}
`;
