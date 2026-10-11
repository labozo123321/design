"""
2D physics for a pinball on a standard playfield (used by generate-pinball-path.py).

Table coordinates in metres: x across (0 at the left wall), y up the table (0 at the front). The playfield
is tilted 6.5 degrees, so a rolling ball accelerates down it at 5/7 g sin(6.5) = 0.79 m/s^2. The ball is a
standard pinball: 1 1/16 inch (27 mm) of chrome steel, 80 g.

Walls are segments and an arc; pop bumpers and slingshots kick; flippers are capsules swung by a script
(the player). Plain floats in the inner loop (tiny numpy arrays are slower than arithmetic). Deterministic.
"""

import math

W = 0.514  # playfield width (20.25 in)
L = 1.067  # playfield length (42 in)
R = 0.0135  # ball radius
A_ROLL = 5 / 7 * 9.81 * math.sin(math.radians(6.5))
XC = 0.2375  # centre line of the playing area (the plunger lane takes the right 39 mm)
LANE_X = 0.475  # plunger lane's inner wall

# flippers: pivot, length, rest and raised angles (deg from +x)
FLIP_LEN = 0.075
FLIP_R0 = 0.0115  # radius at the pivot
FLIP_R1 = 0.0065  # radius at the tip
FLIPPERS = {
    "L": {"pivot": (XC - 0.089, 0.118), "rest": -30.0, "up": 28.0},
    "R": {"pivot": (XC + 0.089, 0.118), "rest": 210.0, "up": 152.0},
}
BUMPERS = [(0.200, 0.770), (0.320, 0.790), (0.262, 0.680)]
BUMPER_R = 0.038
# the monster: a big toy head up in the top-left corner, outside the arch (it doesn't block the ball); its
# tongue is a ramp running down onto the playfield, and its mouth is a scoop
MONSTER = (0.062, 0.990)
MONSTER_R = 0.068
ARCH_C = (W / 2, 0.78)
ARCH_R = W / 2  # wall radius
LANE_GUIDES = [0.200, 0.245, 0.290, 0.335]  # top rollover lane guides (x), y 0.885 to 0.945
LANE_Y = (0.885, 0.945)
DROP_TARGETS = [(0.198, 0.480), (0.240, 0.480), (0.282, 0.480)]  # centre bank, facing the flippers
DROP_W = 0.034
RIGHT_LANE = (0.432, 0.45, 0.74)  # guide x, bottom y, top y (the spinner lane, right side)
SPINNER = (0.4535, 0.56)
RAMP_ENTRY = (0.120, 0.600)  # the monster's tongue (a ramp): where it meets the playfield
MOUTH = (0.098, 0.935)  # where it goes into the mouth (a scoop), 5 cm up
SLINGS = {
    "L": [(0.072, 0.200), (0.072, 0.310), (0.125, 0.170)],
    "R": [(2 * XC - 0.072, 0.200), (2 * XC - 0.072, 0.310), (2 * XC - 0.125, 0.170)],
}
INLANE_GUIDES = {
    "L": [(XC - 0.1025, 0.130), (0.045, 0.215), (0.045, 0.33)],
    "R": [(XC + 0.1025, 0.130), (2 * XC - 0.045, 0.215), (2 * XC - 0.045, 0.33)],
}
APRON_Y = 0.065
GATE_Y = 0.745


def rot(deg):
    a = math.radians(deg)
    return math.cos(a), math.sin(a)


def flipper_segment(side, ang):
    px, py = FLIPPERS[side]["pivot"]
    c, s = rot(ang)
    return (px, py), (px + FLIP_LEN * c, py + FLIP_LEN * s)


def segments():
    """Static walls: (ax, ay, bx, by, restitution, kind)."""
    segs = []

    def add(a, b, e=0.45, kind="wall"):
        segs.append((a[0], a[1], b[0], b[1], e, kind))

    add((0.0, 0.0), (0.0, 0.78))  # left wall
    add((W, 0.0), (W, 0.78))  # right outer wall
    add((LANE_X, 0.06), (LANE_X, 0.74))  # plunger lane wall
    for side in ("L", "R"):
        g = INLANE_GUIDES[side]
        add(g[0], g[1], 0.35, "guide")
        add(g[1], g[2], 0.35, "guide")
        s = SLINGS[side]
        add(s[0], s[1], 0.5, "post")
        add(s[0], s[2], 0.5, "post")
        add(s[1], s[2], 0.6, "sling_" + side)
    for x in LANE_GUIDES:
        add((x, LANE_Y[0]), (x, LANE_Y[1]), 0.4, "laneguide")
    gx, gy0, gy1 = RIGHT_LANE
    add((gx, gy0), (gx, gy1), 0.45, "guide")
    # one-way gate at the top of the plunger lane: balls go out, nothing comes back in
    add((LANE_X, GATE_Y), (W, GATE_Y), 0.3, "gate")
    # the tongue's raised edges (where it's too high to roll over and too low to pass under)
    for side in (-1, 1):
        pts = [(0.121, 0.625), (0.1315, 0.680), (0.1335, 0.735), (0.129, 0.790)]
        off = [(x + side * 0.024, y) for x, y in pts]
        for i in range(len(off) - 1):
            add(off[i], off[i + 1], 0.35, "tongue")
    # the outlanes drain under the apron at the bottom corners
    add((0.0, APRON_Y), (XC - 0.105, APRON_Y), 0.2, "apron")
    add((XC + 0.105, APRON_Y), (LANE_X, APRON_Y), 0.2, "apron")
    return segs


SEGS = segments()
# precomputed for the inner loop: (ax, ay, dx, dy, len2, e, kind, xmin, xmax, ymin, ymax)
_SEGP = []
for _ax, _ay, _bx, _by, _e, _kind in SEGS:
    _pad = R + 0.004
    _SEGP.append((_ax, _ay, _bx - _ax, _by - _ay, (_bx - _ax) ** 2 + (_by - _ay) ** 2, _e, _kind,
                  min(_ax, _bx) - _pad, max(_ax, _bx) + _pad, min(_ay, _by) - _pad, max(_ay, _by) + _pad))


class Ball:
    def __init__(self, p, v, name="you"):
        self.px, self.py = float(p[0]), float(p[1])
        self.vx, self.vy = float(v[0]), float(v[1])
        self.name = name
        self.mode = "free"  # free | ramp | held | drained | lane

    @property
    def p(self):
        return (self.px, self.py)

    @property
    def v(self):
        return (self.vx, self.vy)


class Table:
    """The playfield's moving parts and their state over time."""

    def __init__(self):
        self.flip = {"L": FLIPPERS["L"]["rest"], "R": FLIPPERS["R"]["rest"]}
        self.flip_w = {"L": 0.0, "R": 0.0}  # angular velocity (deg/s)
        self.flip_hold = {"L": None, "R": None}  # time to release
        self.drops = [True, True, True]  # standing?
        self.dead = False  # tilted: flippers and kickers off
        self.you_tongue = False  # does your ball hit the tongue's sides yet
        self.events = []
        self.cool = {}  # per-ball, per-collider cooldown (no double hits)

    def press(self, side, t, hold=0.25):
        if self.dead:
            return
        self.flip_hold[side] = t + hold
        self.events.append((t, "flip_" + side, {}))

    def step_flippers(self, t, dt):
        for side in ("L", "R"):
            f = FLIPPERS[side]
            up = self.flip_hold[side] is not None and t < self.flip_hold[side] and not self.dead
            target = f["up"] if up else f["rest"]
            # solenoid: about 35 ms to swing up, 60 ms to fall back
            rate = 1700.0 if up else 900.0
            d = target - self.flip[side]
            step = math.copysign(min(abs(d), rate * dt), d)
            self.flip_w[side] = step / dt
            self.flip[side] += step


def hit(table, t, b, kind, info):
    key = (b.name, kind, info.get("k"))
    if t - table.cool.get(key, -1) < 0.04:
        return
    table.cool[key] = t
    info = dict(info)
    info["ball"] = b.name
    info.setdefault("x", b.px)
    info.setdefault("y", b.py)
    table.events.append((t, kind, info))


def collide(b, table, t):
    # top arch: a circular wall
    if b.py > ARCH_C[1]:
        dx, dy = b.px - ARCH_C[0], b.py - ARCH_C[1]
        r = math.hypot(dx, dy)
        lim = ARCH_R - R - 0.002
        if r > lim:
            nx, ny = -dx / r, -dy / r
            b.px, b.py = ARCH_C[0] + dx / r * lim, ARCH_C[1] + dy / r * lim
            vn = b.vx * nx + b.vy * ny
            if vn < 0:
                b.vx -= 1.15 * vn * nx
                b.vy -= 1.15 * vn * ny
    # walls
    for ax, ay, sx, sy, l2, e, kind, x0, x1, y0, y1 in _SEGP:
        if b.px < x0 or b.px > x1 or b.py < y0 or b.py > y1:
            continue
        if kind == "gate" and (b.vy > 0 or b.py < GATE_Y):
            continue
        # (your path before the monster spits you out never touches the tongue's sides: they're left out of
        # it, so the searched-for shots up to then stay as they were)
        if kind == "tongue" and b.name == "you" and not table.you_tongue:
            continue
        u = ((b.px - ax) * sx + (b.py - ay) * sy) / l2
        u = 0.0 if u < 0 else (1.0 if u > 1 else u)
        qx, qy = ax + u * sx, ay + u * sy
        dx, dy = b.px - qx, b.py - qy
        dist = math.hypot(dx, dy)
        lim = R + 0.003
        if 1e-9 < dist < lim:
            nx, ny = dx / dist, dy / dist
            b.px, b.py = qx + nx * lim, qy + ny * lim
            vn = b.vx * nx + b.vy * ny
            if vn < 0:
                if kind.startswith("sling") and not table.dead and -vn > 0.08:
                    b.vx += -vn * nx + nx * 1.35
                    b.vy += -vn * ny + ny * 1.35
                    hit(table, t, b, kind, {"x": qx, "y": qy})
                else:
                    b.vx -= (1 + e) * vn * nx
                    b.vy -= (1 + e) * vn * ny
                    if -vn > 0.25:
                        hit(table, t, b, "lane" if kind == "laneguide" else "clack", {"x": qx, "y": qy, "speed": -vn})
    # pop bumpers
    for k, (cx, cy) in enumerate(BUMPERS):
        dx, dy = b.px - cx, b.py - cy
        if abs(dx) > 0.06 or abs(dy) > 0.06:
            continue
        dist = math.hypot(dx, dy)
        lim = BUMPER_R + R
        if dist < lim:
            nx, ny = dx / dist, dy / dist
            b.px, b.py = cx + nx * lim, cy + ny * lim
            vn = b.vx * nx + b.vy * ny
            if vn < 0:
                kick = 1.25 if not table.dead else 0.25
                b.vx += -vn * nx + nx * kick
                b.vy += -vn * ny + ny * kick
                hit(table, t, b, "bumper", {"k": k})
    # drop targets (a bank across the middle, facing the flippers)
    for k, (x, y) in enumerate(DROP_TARGETS):
        if not table.drops[k]:
            continue
        if abs(b.px - x) > DROP_W / 2 + R + 0.005 or abs(b.py - y) > R + 0.005:
            continue
        qx = min(max(b.px, x - DROP_W / 2), x + DROP_W / 2)
        qy = y
        dx, dy = b.px - qx, b.py - qy
        dist = math.hypot(dx, dy)
        if 1e-9 < dist < R + 0.004:
            nx, ny = dx / dist, dy / dist
            b.px, b.py = qx + nx * (R + 0.004), qy + ny * (R + 0.004)
            vn = b.vx * nx + b.vy * ny
            if vn < 0:
                b.vx -= 1.3 * vn * nx
                b.vy -= 1.3 * vn * ny
                table.drops[k] = False
                hit(table, t, b, "drop", {"k": k})
    # flippers (capsules); a swinging flipper hands its surface speed to the ball
    for side in ("L", "R"):
        (ax, ay), (tx, ty) = flipper_segment(side, table.flip[side])
        if b.py > 0.2 or abs(b.px - (ax + tx) / 2) > 0.07:
            continue
        sx, sy = tx - ax, ty - ay
        u = ((b.px - ax) * sx + (b.py - ay) * sy) / (sx * sx + sy * sy)
        u = 0.0 if u < 0 else (1.0 if u > 1 else u)
        qx, qy = ax + u * sx, ay + u * sy
        rad = FLIP_R0 + (FLIP_R1 - FLIP_R0) * u
        dx, dy = b.px - qx, b.py - qy
        dist = math.hypot(dx, dy)
        lim = rad + R
        if 1e-9 < dist < lim:
            nx, ny = dx / dist, dy / dist
            b.px, b.py = qx + nx * lim, qy + ny * lim
            w = math.radians(table.flip_w[side])
            vsx, vsy = -w * (qy - ay), w * (qx - ax)
            rx, ry = b.vx - vsx, b.vy - vsy
            vn = rx * nx + ry * ny
            if vn < 0:
                rx -= 1.55 * vn * nx
                ry -= 1.55 * vn * ny
                b.vx, b.vy = rx + vsx, ry + vsy
                if abs(w) > 1.0:
                    hit(table, t, b, "flipper_" + side, {"s": u})
                elif -vn > 0.3:
                    hit(table, t, b, "clack", {"speed": -vn})


def simulate(balls, table, t0, t1, dt=0.0002, script=None, record=None, stop=None, rec_dt=1 / 600):
    """Advance all free balls from t0 to t1. script(t, table, balls) can press flippers or move balls;
    record(t) is called every rec_dt; stop(t, balls) can end early. Returns the end time."""
    t = t0
    next_rec = t0
    damp = 1 - 0.02 * dt
    while t < t1:
        if script:
            script(t, table, balls)
        table.step_flippers(t, dt)
        for b in balls:
            if b.mode != "free":
                continue
            b.vy -= A_ROLL * dt
            b.vx *= damp
            b.vy *= damp
            b.px += b.vx * dt
            b.py += b.vy * dt
            collide(b, table, t)
        # balls knock each other
        n = len(balls)
        for i in range(n):
            bi = balls[i]
            if bi.mode != "free":
                continue
            for j in range(i + 1, n):
                bj = balls[j]
                if bj.mode != "free":
                    continue
                dx, dy = bj.px - bi.px, bj.py - bi.py
                if abs(dx) > 2 * R or abs(dy) > 2 * R:
                    continue
                dist = math.hypot(dx, dy)
                if 1e-9 < dist < 2 * R:
                    nx, ny = dx / dist, dy / dist
                    rel = (bi.vx - bj.vx) * nx + (bi.vy - bj.vy) * ny
                    ov = (2 * R - dist) / 2
                    bi.px -= nx * ov
                    bi.py -= ny * ov
                    bj.px += nx * ov
                    bj.py += ny * ov
                    if rel > 0:
                        imp = rel * 0.95
                        bi.vx -= imp * nx
                        bi.vy -= imp * ny
                        bj.vx += imp * nx
                        bj.vy += imp * ny
                        key = ("ball", bi.name, bj.name)
                        if t - table.cool.get(key, -1) > 0.05:
                            table.events.append((t, "ballhit", {"a": bi.name, "b": bj.name, "speed": rel,
                                                                "x": (bi.px + bj.px) / 2, "y": (bi.py + bj.py) / 2}))
                        table.cool[key] = t
        t += dt
        if record and t >= next_rec:
            record(t)
            next_rec += rec_dt
        if stop and stop(t, balls):
            break
    return t
