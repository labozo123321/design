import * as THREE from "three";

/**
 * A rubber-hose limb: a tube along a quadratic Bezier (start, bend, end), rebuilt in place each frame
 * (no new geometry, so nothing to leak), with rounded caps. Limbs that bend as a curve can't pop at a
 * joint.
 */
export class HoseGeometry extends THREE.BufferGeometry {
  rings: number;
  sides: number;
  private pos: Float32Array;
  private nrm: Float32Array;
  constructor(rings = 14, sides = 8) {
    super();
    this.rings = rings;
    this.sides = sides;
    const capRings = 3;
    const total = (rings + 2 * capRings) * (sides + 1) + 2;
    this.pos = new Float32Array(total * 3);
    this.nrm = new Float32Array(total * 3);
    const idx: number[] = [];
    const R = rings + 2 * capRings;
    for (let r = 0; r < R - 1; r++) {
      for (let s = 0; s < sides; s++) {
        const a = r * (sides + 1) + s;
        const b = a + sides + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const tipA = R * (sides + 1);
    const tipB = tipA + 1;
    for (let s = 0; s < sides; s++) {
      idx.push(tipA, s + 1, s);
      const last = (R - 1) * (sides + 1);
      idx.push(tipB, last + s, last + s + 1);
    }
    this.setIndex(idx);
    this.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.setAttribute("normal", new THREE.BufferAttribute(this.nrm, 3));
  }

  /** p0 -> p2 bending through control c; radius r0 at the start, r1 at the end. */
  update(p0: THREE.Vector3, c: THREE.Vector3, p2: THREE.Vector3, r0: number, r1 = r0) {
    const { rings, sides, pos, nrm } = this;
    const capRings = 3;
    const pt = (t: number, out: THREE.Vector3) =>
      out.set(
        (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x,
        (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y,
        (1 - t) * (1 - t) * p0.z + 2 * (1 - t) * t * c.z + t * t * p2.z,
      );
    const tan = (t: number, out: THREE.Vector3) =>
      out
        .set(
          2 * (1 - t) * (c.x - p0.x) + 2 * t * (p2.x - c.x),
          2 * (1 - t) * (c.y - p0.y) + 2 * t * (p2.y - c.y),
          2 * (1 - t) * (c.z - p0.z) + 2 * t * (p2.z - c.z),
        )
        .normalize();
    const P = new THREE.Vector3();
    const T = new THREE.Vector3();
    const N = new THREE.Vector3();
    const B = new THREE.Vector3();
    // the first frame: any normal to the start tangent, then parallel transport
    tan(0, T);
    N.set(0, 1, 0);
    if (Math.abs(T.dot(N)) > 0.9) N.set(1, 0, 0);
    N.sub(T.clone().multiplyScalar(T.dot(N))).normalize();
    B.crossVectors(T, N);
    let v = 0;
    const put = (center: THREE.Vector3, n: THREE.Vector3, b: THREE.Vector3, t: THREE.Vector3, radius: number, axial: number) => {
      // axial < 0: the normal leans back along -t (start cap), > 0 along +t (end cap)
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = n.x * ca + b.x * sa;
        const ny = n.y * ca + b.y * sa;
        const nz = n.z * ca + b.z * sa;
        pos[v * 3] = center.x + nx * radius;
        pos[v * 3 + 1] = center.y + ny * radius;
        pos[v * 3 + 2] = center.z + nz * radius;
        const ax = Math.sqrt(Math.max(0, 1 - axial * axial));
        const fx = nx * ax + t.x * axial;
        const fy = ny * ax + t.y * axial;
        const fz = nz * ax + t.z * axial;
        nrm[v * 3] = fx;
        nrm[v * 3 + 1] = fy;
        nrm[v * 3 + 2] = fz;
        v++;
      }
    };
    // start cap rings (a hemisphere behind p0)
    const T0 = T.clone();
    for (let k = capRings; k >= 1; k--) {
      const ang = (k / (capRings + 0.0001)) * (Math.PI / 2) * 0.92;
      const center = p0.clone().addScaledVector(T0, -Math.sin(ang) * r0);
      put(center, N, B, T0, Math.cos(ang) * r0, -Math.sin(ang));
    }
    const prevT = T.clone();
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1);
      pt(t, P);
      tan(t, T);
      // parallel transport the frame
      const axis = new THREE.Vector3().crossVectors(prevT, T);
      const sinA = axis.length();
      if (sinA > 1e-6) {
        axis.divideScalar(sinA);
        const ang = Math.asin(Math.min(1, sinA));
        N.applyAxisAngle(axis, ang);
      }
      N.sub(T.clone().multiplyScalar(T.dot(N))).normalize();
      B.crossVectors(T, N);
      prevT.copy(T);
      put(P, N, B, T, r0 + (r1 - r0) * t, 0);
    }
    const T1 = T.clone();
    for (let k = 1; k <= capRings; k++) {
      const ang = (k / (capRings + 0.0001)) * (Math.PI / 2) * 0.92;
      const center = p2.clone().addScaledVector(T1, Math.sin(ang) * r1);
      put(center, N, B, T1, Math.cos(ang) * r1, Math.sin(ang));
    }
    // the two tips
    const tipA = p0.clone().addScaledVector(T0, -r0);
    const tipB = p2.clone().addScaledVector(T1, r1);
    pos.set([tipA.x, tipA.y, tipA.z, tipB.x, tipB.y, tipB.z], v * 3);
    nrm.set([-T0.x, -T0.y, -T0.z, T1.x, T1.y, T1.z], v * 3);
    this.attributes.position.needsUpdate = true;
    this.attributes.normal.needsUpdate = true;
    this.computeBoundingSphere();
  }
}

/**
 * A flat band along a curve (the elevator's ribbon): f(s) gives the centre at s in [0, 1], `side` the
 * direction its width lies along there. Rebuilt in place.
 */
export class StripGeometry extends THREE.BufferGeometry {
  n: number;
  private pos: Float32Array;
  private nrm: Float32Array;
  constructor(n = 120) {
    super();
    this.n = n;
    this.pos = new Float32Array((n + 1) * 2 * 3);
    this.nrm = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      uv.set([0, i / n, 1, i / n], i * 4);
      if (i < n) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.setIndex(idx);
    this.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.setAttribute("normal", new THREE.BufferAttribute(this.nrm, 3));
    this.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
  update(f: (s: number) => THREE.Vector3, side: (s: number) => THREE.Vector3, width: (s: number) => number) {
    const { n, pos, nrm } = this;
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      p.copy(f(s));
      const sd = side(s).normalize();
      const w = width(s) / 2;
      pos.set([p.x - sd.x * w, p.y - sd.y * w, p.z - sd.z * w, p.x + sd.x * w, p.y + sd.y * w, p.z + sd.z * w], i * 6);
      q.copy(f(Math.min(1, s + 1 / n))).sub(f(Math.max(0, s - 1 / n))).normalize();
      const nn = new THREE.Vector3().crossVectors(sd, q).normalize();
      nrm.set([nn.x, nn.y, nn.z, nn.x, nn.y, nn.z], i * 6);
    }
    this.attributes.position.needsUpdate = true;
    this.attributes.normal.needsUpdate = true;
    this.computeBoundingSphere();
  }
}
