"""
Track builder for the Coaster piece: a dive coaster laid out along its heartline (the line through the
riders' chests), the way coaster designers do it.

The track is integrated as a moving frame: position P, forward T, the riders' up U, right R = T x U. Each
element turns that frame with an angular rate vector (radians per metre of track):

  - geometric pieces turn it about the world vertical (heading), about the horizontal (pitch) or about T
    (roll), each with a smooth rate profile so the curvature never jumps;
  - force pieces (force-vector design) take the g-forces the riders should feel, normal and lateral, and the
    roll rate, and work out the curvature from the speed: ku = g (Gn - U.y) / v^2, kr = g (Gl - R.y) / v^2.

The design speed comes from energy along the way (friction and air drag included); the train itself is
simulated afterwards, on the finished track, in generate-coaster-path.py.
"""

import math

import numpy as np

G = 9.81
MU = 0.012  # rolling resistance, per unit of normal force
DRAG = 5.5e-4  # air drag, (1/m): a = DRAG * v^2
Y = np.array([0.0, 1.0, 0.0])


def unit(v):
    return v / np.linalg.norm(v)


def rot(v, axis, ang):
    """Rodrigues: v turned by ang about the unit axis."""
    c, s = math.cos(ang), math.sin(ang)
    return v * c + np.cross(axis, v) * s + axis * np.dot(axis, v) * (1 - c)


def shape(u, kind):
    """Rate profiles over u in [0, 1], each with mean 1."""
    if kind == "sin2":
        return 2.0 * math.sin(math.pi * u) ** 2
    if kind.startswith("trap"):
        # ramps over a fraction a at both ends (smoothstep), flat in between
        a = float(kind[4:] or 0.25)
        if u < a:
            k = u / a
        elif u > 1 - a:
            k = (1 - u) / a
        else:
            k = 1.0
        k = k * k * (3 - 2 * k)
        return k / (1 - a)
    return 1.0


class Track:
    def __init__(self, P, T, U, v=0.0, ds=0.1):
        self.P = np.array(P, float)
        self.T = unit(np.array(T, float))
        self.U = unit(np.array(U, float))
        self.v = v
        self.ds = ds
        self.fixed = None  # a speed the train is held to (tires, chain), or None
        self.s = 0.0
        self.pts, self.Ts, self.Us, self.vs, self.gn, self.gl = [], [], [], [], [], []
        self.marks = {}
        self.log = []
        self._push(1.0, 0.0)

    # ------------------------------------------------------------------ state
    @property
    def R(self):
        return np.cross(self.T, self.U)

    def heading(self):
        return math.degrees(math.atan2(self.T[0], -self.T[2]))

    def pitch_deg(self):
        return math.degrees(math.asin(max(-1.0, min(1.0, self.T[1]))))

    def bank_deg(self):
        return math.degrees(math.atan2(-self.R[1], self.U[1]))

    def _push(self, gn, gl):
        self.pts.append(self.P.copy())
        self.Ts.append(self.T.copy())
        self.Us.append(self.U.copy())
        self.vs.append(self.v)
        self.gn.append(gn)
        self.gl.append(gl)

    def mark(self, name):
        self.marks[name] = self.s

    def hold(self, v):
        """Hold the train to speed v (tires, the chain), or let it roll (None)."""
        self.fixed = v
        if v is not None:
            self.v = v

    # ------------------------------------------------------------------ stepping
    def step(self, omega):
        ds = self.ds
        w = np.linalg.norm(omega)
        T0 = self.T
        if w > 1e-12:
            ax = omega / w
            self.T = unit(rot(self.T, ax, w * ds))
            self.U = rot(self.U, ax, w * ds)
            self.U = unit(self.U - np.dot(self.U, self.T) * self.T)
        self.P = self.P + 0.5 * (T0 + self.T) * ds
        # what the riders feel: the curvature (dT/ds = omega x T) at the speed, plus the ground's push
        v = max(self.v, 0.05)
        kap = np.cross(omega, self.T)
        f = v * v * kap + G * Y
        gn = np.dot(f, self.U) / G
        gl = np.dot(f, self.R) / G
        if self.fixed is not None:
            self.v = self.fixed
        else:
            dv2 = 2 * (-G * self.T[1] - MU * G * math.hypot(gn, gl) - DRAG * self.v * self.v) * ds
            self.v = math.sqrt(max(0.04, self.v * self.v + dv2))
        self.s += ds
        self._push(gn, gl)

    def _n(self, L):
        return max(1, int(round(L / self.ds)))

    # ------------------------------------------------------------------ geometric pieces
    def straight(self, L):
        for _ in range(self._n(L)):
            self.step(np.zeros(3))
        return self

    def yaw(self, ang, L, bank=0.0, kind="sin2", climb=0.0):
        """Turn the heading by ang (deg, + = left) over L metres; bank (deg, + = right side down) peaks
        mid-turn and comes back out; climb (deg) pitches the track up (+) or down over the first half and
        back over the second."""
        n = self._n(L)
        a = math.radians(ang)
        b = math.radians(bank)
        c = math.radians(climb)
        for i in range(n):
            u = (i + 0.5) / n
            yr = a / L * shape(u, kind)
            # bank(u) = b sin^2(pi u): its rate
            br = b * math.pi / L * math.sin(2 * math.pi * u)
            cr = c * math.pi / L * math.sin(2 * math.pi * u)
            H = np.cross(self.T, Y)
            hn = np.linalg.norm(H)
            om = yr * Y + br * self.T
            if hn > 1e-6:
                om = om + cr * H / hn
            self.step(om)
        return self

    def pitch(self, ang, L, kind="sin2"):
        """Pitch the track up (+) or down by ang (deg) in its own plane (about R) over L metres."""
        n = self._n(L)
        a = math.radians(ang)
        for i in range(n):
            u = (i + 0.5) / n
            self.step(a / L * shape(u, kind) * self.R)
        return self

    def roll(self, ang, L, kind="sin2", pitch=0.0):
        """Roll about T by ang (deg, + = right side down) over L metres, optionally pitching (deg) too."""
        n = self._n(L)
        a = math.radians(ang)
        p = math.radians(pitch)
        for i in range(n):
            u = (i + 0.5) / n
            self.step(a / L * shape(u, kind) * self.T + p / L * shape(u, kind) * self.R)
        return self


    # ------------------------------------------------------------------ auto-banked turns
    def turn(self, ang, L, climb=0.0, kind="sin2", bankmax=88.0, follow=1.2, lean=1.0):
        """Turn the heading by ang (deg, + = left) over L metres, pitching up (+) or down by climb (deg) over
        the first half and back over the second. The bank follows what cancels the sideways g at the
        current speed (times lean), slewed so it never snaps."""
        n = self._n(L)
        a = math.radians(ang)
        c = math.radians(climb)
        for i in range(n):
            u = (i + 0.5) / n
            yr = a / L * shape(u, kind)
            cr = c * math.pi / L * math.sin(2 * math.pi * u)
            H = np.cross(self.T, Y)
            hn = np.linalg.norm(H)
            H = H / hn if hn > 1e-6 else self.R
            v2 = max(self.v, 0.5) ** 2
            # horizontal curvature (to the left), and the bank that cancels it (+ = right side down)
            kh = yr * math.sqrt(max(0.0, 1 - self.T[1] ** 2))
            want = -math.degrees(math.atan2(v2 * kh * lean, G + v2 * cr))
            want = max(-bankmax, min(bankmax, want))
            br = math.radians(want - self.bank_deg()) / follow
            self.step(yr * Y + cr * H + br * self.T)
        return self.level()

    def level(self, L=3.0):
        """Roll whatever bank is left back to zero over L metres."""
        b = self.bank_deg()
        if abs(b) > 0.05 and abs(b) < 120:
            self.roll(-b, L)
        return self

    def climbroll(self, ang, L, climb=0.0, kind="sin2"):
        """Roll by ang (deg) over L metres while the track's world pitch changes by climb (deg)."""
        n = self._n(L)
        a = math.radians(ang)
        c = math.radians(climb)
        for i in range(n):
            u = (i + 0.5) / n
            H = np.cross(self.T, Y)
            hn = np.linalg.norm(H)
            H = H / hn if hn > 1e-6 else self.R
            self.step(a / L * shape(u, kind) * self.T + c / L * shape(u, kind) * H)
        return self


    def connect(self, P1, heading1, L=None):
        """Close the circuit: a level-ish planar cubic to P1 arriving on heading1 (deg), height eased to
        P1's. The residual drift is spread back along the piece so the end lands exactly on P1."""
        P0 = self.P.copy()
        h0 = math.radians(self.heading())
        h1 = math.radians(heading1)
        d0 = np.array([math.sin(h0), 0.0, -math.cos(h0)])
        d1 = np.array([math.sin(h1), 0.0, -math.cos(h1)])
        chord = np.linalg.norm((P1 - P0)[[0, 2]])
        k = 0.42 * chord
        c0, c1, c2, c3 = P0, P0 + d0 * k, np.array(P1, float) - d1 * k, np.array(P1, float)
        def bez(u):
            return (1 - u) ** 3 * c0 + 3 * (1 - u) ** 2 * u * c1 + 3 * (1 - u) * u * u * c2 + u ** 3 * c3
        us = np.linspace(0, 1, 4001)
        pts = np.array([bez(u) for u in us])
        seg = np.linalg.norm(np.diff(pts[:, [0, 2]], axis=0), axis=1)
        sacc = np.concatenate([[0], np.cumsum(seg)])
        Ltot = sacc[-1]
        n = self._n(Ltot)
        hdg = np.unwrap(np.arctan2(np.gradient(pts[:, 0]), -np.gradient(pts[:, 2])))
        i0 = len(self.pts)
        y0 = P0[1]
        y1 = P1[1]
        for i in range(n):
            sm = (i + 0.5) / n * Ltot
            u = np.interp(sm, sacc, us)
            # heading rate (deg/m -> rad/m), + = left: heading measured clockwise, so negate
            dh = np.interp(sm + 0.05, sacc, hdg) - np.interp(sm - 0.05, sacc, hdg)
            yr = -dh / 0.1
            # height: smoothstep from y0 to y1 -> the pitch it needs
            uu = sm / Ltot
            want = math.atan2((y1 - y0) * 6 * uu * (1 - uu) / Ltot, 1.0)
            cr = (want - math.asin(max(-1, min(1, self.T[1])))) / 2.0
            H = np.cross(self.T, Y)
            H = H / max(1e-9, np.linalg.norm(H))
            v2 = max(self.v, 0.5) ** 2
            bank_want = -math.degrees(math.atan2(v2 * yr, G))
            br = math.radians(bank_want - self.bank_deg()) / 4.0
            self.step(yr * Y + cr * H + br * self.T)
        # spread the residual so the piece ends exactly on P1, level and upright on heading1
        err = np.array(P1, float) - self.P
        m = len(self.pts) - i0
        for j in range(m):
            w = (j / max(1, m - 1))
            w = w * w * (3 - 2 * w)
            self.pts[i0 + j] = self.pts[i0 + j] + err * w
        self.P = np.array(P1, float)
        # the frames along the piece follow the corrected positions, and it arrives level on heading1
        for j in range(m):
            a = self.pts[max(i0, i0 + j - 1)]
            b = self.pts[min(i0 + m - 1, i0 + j + 1)]
            t = unit(b - a)
            u = self.Us[i0 + j]
            u = unit(u - np.dot(u, t) * t)
            self.Ts[i0 + j] = t
            self.Us[i0 + j] = u
        self.T = d1.copy()
        self.U = Y.copy()
        self.Ts[-1] = self.T.copy()
        self.Us[-1] = self.U.copy()
        return self

    # ------------------------------------------------------------------ force pieces
    def fvd(self, L, gn, gl=lambda u, t: 0.0, roll=lambda u, t: 0.0, until=None):
        """Force-vector piece: gn(u, track) and gl(u, track) are the g's the riders feel (u in [0, 1] over L),
        roll(u, track) the roll rate (deg per metre). Stops early when until(track) turns true."""
        n = self._n(L)
        for i in range(n):
            u = (i + 0.5) / n
            v2 = max(self.v, 0.5) ** 2
            ku = G * (gn(u, self) - self.U[1]) / v2
            kr = G * (gl(u, self) - self.R[1]) / v2
            w = math.radians(roll(u, self))
            self.step(ku * self.R - kr * self.U + w * self.T)
            if until is not None and until(self):
                break
        return self

    def note(self, name):
        self.log.append(
            f"{name:<22} s={self.s:7.1f}  P=({self.P[0]:7.1f},{self.P[1]:6.1f},{self.P[2]:7.1f})"
            f"  hdg={self.heading():7.1f} pitch={self.pitch_deg():6.1f} bank={self.bank_deg():7.1f}"
            f"  v={self.v:5.1f}"
        )

    # ------------------------------------------------------------------ output
    def arrays(self):
        return (
            np.array(self.pts),
            np.array(self.Ts),
            np.array(self.Us),
            np.array(self.vs),
            np.array(self.gn),
            np.array(self.gl),
        )
