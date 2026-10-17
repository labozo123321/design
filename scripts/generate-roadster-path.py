#!/usr/bin/env python3
"""
The new Roadster's demo ("POV: you're driving the new Tesla Roadster at its demo"): the car's path through
the night at the test site, sampled in world time, and the video's timeline (slow motion, the replay, the
bullet time), written to src/roadster/path.json and src/roadster/timeline.json.

World (metres): x east, y up, z south (north is -z). Lane A (x = 0) runs north from the start line (z = 0)
to the inverted ramp (entry z = -72): a quarter circle up to vertical, a short vertical, a quarter circle
over the top that ends upside down 18.5 m up. Lane B (x = -14) runs north from z = +5 over the lineup of
Teslas parked side by side across it (the Semi in the middle, z = -45). The crowd is behind the barrier at
x = -28.

Run 1 (world 0..30): the canopy comes down, the screens wake, the coffee goes in the cupholder, Track Mode
(it squats, the wings come out), the starter's count; 0-60 mph in 0.81 s on the rear cold-gas thrusters;
off the power to 45 mph; up the ramp (the fans suck it on), vertical, over the top upside down; let go; a
half roll in free fall on the side thrusters (the coffee floats up out of its cup); the thrusters brake the
fall into a cloud of their own vapour (the coffee drops back in); it rolls out.

Run 2 (world 40..): a hand over the cup this time; the launch; the thrusters lift it over the lineup with a
barrel roll at the top (over the Semi); down on the far side; a sideways slide to a stop facing the crowd;
the canopy up; then the yoke turns by itself (the car was never his to drive).

Car frame (three.js): x right, y up, z back (forward is -z); the origin on the ground under the car's
middle. Per sample: position, orientation, speed, the specific force and angular velocity in the car frame,
the wheels' spin and steer, the suspension, the wings, the canopy, the fans, the ten thrusters, the brake
lights, the driver's head (pushed about by the g's, and where he looks), the coffee, the altitude.

    python3 scripts/generate-roadster-path.py
"""

import json
import math
import os

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = 9.81
RATE = 60  # samples per world second in the JSON
SUB = 20  # integration steps per sample
DT = 1.0 / (RATE * SUB)
T_END = 76.0

# ------------------------------------------------------------------------------------------------ the site
LANE_A_X = 0.0
LANE_B_X = -14.0
START_B_Z = 5.0
RAMP_ENTRY_Z = -72.0
R1, LV, R2 = 11.5, 0.0, 6.0  # (no straight between: the curvature only grows, so the coffee stays pressed in)
RAMP_TOP = R1 + LV + R2  # the track surface at the top
H_CM = 0.48  # centre of mass above the contact point
WHEEL_R = 0.36
WHEELBASE = 2.65

# the lineup across lane B, from the near side (south): (name, width, height, length)
LINEUP = [
    ("modelY", 1.92, 1.62, 4.75),
    ("model3", 1.85, 1.44, 4.72),
    ("semi", 2.60, 3.95, 6.90),
    ("cybertruck", 2.03, 1.79, 5.68),
    ("cybercab", 1.95, 1.40, 4.10),
]
GAP = 0.7
SEMI_Z = -45.0


def lineup_positions():
    widths = [w for _, w, _, _ in LINEUP]
    zs = [0.0] * len(LINEUP)
    i = 2
    zs[i] = SEMI_Z
    for j in range(i + 1, len(LINEUP)):  # north of the Semi (smaller z)
        zs[j] = zs[j - 1] - (widths[j - 1] / 2 + GAP + widths[j] / 2)
    for j in range(i - 1, -1, -1):  # south of it
        zs[j] = zs[j + 1] + (widths[j + 1] / 2 + GAP + widths[j] / 2)
    return [{"name": n, "z": round(z, 4), "w": w, "h": h, "l": l} for (n, w, h, l), z in zip(LINEUP, zs)]


LINEUP_AT = lineup_positions()

# ------------------------------------------------------------------------------------------------ helpers


def smooth(a, b, x):
    k = min(1.0, max(0.0, (x - a) / (b - a)))
    return k * k * (3 - 2 * k)


def smoother(x):
    x = min(1.0, max(0.0, x))
    return x * x * x * (x * (x * 6 - 15) + 10)


def norm(v):
    return v / np.linalg.norm(v)


def quat_from_matrix(m):
    t = m[0, 0] + m[1, 1] + m[2, 2]
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        w = 0.25 * s
        x = (m[2, 1] - m[1, 2]) / s
        y = (m[0, 2] - m[2, 0]) / s
        z = (m[1, 0] - m[0, 1]) / s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        w = (m[2, 1] - m[1, 2]) / s
        x = 0.25 * s
        y = (m[0, 1] + m[1, 0]) / s
        z = (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        w = (m[0, 2] - m[2, 0]) / s
        x = (m[0, 1] + m[1, 0]) / s
        y = 0.25 * s
        z = (m[1, 2] + m[2, 1]) / s
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        w = (m[1, 0] - m[0, 1]) / s
        x = (m[0, 2] + m[2, 0]) / s
        y = (m[1, 2] + m[2, 1]) / s
        z = 0.25 * s
    q = np.array([x, y, z, w])
    return q / np.linalg.norm(q)


def frame_quat(forward, up):
    """The car's orientation from its forward and up directions (x right, y up, z back)."""
    f = norm(np.asarray(forward, float))
    u = np.asarray(up, float)
    u = norm(u - f * np.dot(u, f))
    back = -f
    right = np.cross(u, back)
    return quat_from_matrix(np.array([right, u, back]).T)


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ])


def qconj(q):
    return np.array([-q[0], -q[1], -q[2], q[3]])


def qrot(q, v):
    p = np.array([v[0], v[1], v[2], 0.0])
    r = qmul(qmul(q, p), qconj(q))
    return r[:3]


def qaxis(axis, ang):
    a = norm(np.asarray(axis, float))
    s = math.sin(ang / 2)
    return np.array([a[0] * s, a[1] * s, a[2] * s, math.cos(ang / 2)])


# ------------------------------------------------------------------------------------------- the samples
N = int(T_END * RATE) + 1
TS = np.arange(N) / RATE
S = {
    k: np.zeros(N)
    for k in [
        "px", "py", "pz", "qx", "qy", "qz", "qw", "speed", "steer", "susp", "wing", "canopy", "fan", "brake",
        "ground", "alt", "fwd", "creep",
    ]
}
THR = np.zeros((N, 10))  # the ten thrusters, 0..1 (see THRUSTERS)
# the thrusters (car frame): four rear (pointing back), four corners and two sides (pointing down)
THRUSTERS = [
    {"at": [-0.42, 0.56, 2.17], "dir": [0, 0.08, 1]},
    {"at": [-0.14, 0.56, 2.18], "dir": [0, 0.08, 1]},
    {"at": [0.14, 0.56, 2.18], "dir": [0, 0.08, 1]},
    {"at": [0.42, 0.56, 2.17], "dir": [0, 0.08, 1]},
    {"at": [-0.72, 0.2, -1.98], "dir": [-0.15, -1, 0]},
    {"at": [0.72, 0.2, -1.98], "dir": [0.15, -1, 0]},
    {"at": [-0.74, 0.21, 1.98], "dir": [-0.15, -1, 0]},
    {"at": [0.74, 0.21, 1.98], "dir": [0.15, -1, 0]},
    {"at": [-0.84, 0.15, 0.05], "dir": [-0.3, -1, 0]},
    {"at": [0.84, 0.15, 0.05], "dir": [0.3, -1, 0]},
]
REAR = [0, 1, 2, 3]
DOWN = [4, 5, 6, 7, 8, 9]
CUES = {}  # world seconds


def put(i, pos, q, speed):
    S["px"][i], S["py"][i], S["pz"][i] = pos
    S["qx"][i], S["qy"][i], S["qz"][i], S["qw"][i] = q
    S["speed"][i] = speed


def idx(t):
    return int(round(t * RATE))


# ------------------------------------------------------------------------------------------------- run 1
T_WALK1 = 3.2  # walking up to the car (canopy up, under the lights); then climbing in
T_SEATED = 4.4
T_CANOPY0, T_CANOPY1 = 4.5, 5.6
T_BOOT = 5.7
T_CUP0, T_CUP1 = 6.0, 7.3  # the coffee goes in the cupholder
T_TRACK = 7.5  # Track Mode: it squats, the wings come out
T_COUNT = [8.7, 9.45, 10.2]  # the starter's three, two, one
T_GO = 10.95  # her arm comes down
T_L1 = 11.1  # launch
LAUNCH_V = 26.82  # 60 mph
LAUNCH_T = 0.81
RAMP_V = 20.0  # 45 mph at the ramp
CUES.update({"walk1": T_WALK1, "seated": T_SEATED, "canopy0": T_CANOPY0, "canopy1": T_CANOPY1, "boot": T_BOOT, "cup0": T_CUP0, "cup1": T_CUP1, "track": T_TRACK, "count3": T_COUNT[0], "count2": T_COUNT[1], "count1": T_COUNT[2], "go": T_GO, "launch1": T_L1})

# the launch: thrust and motors together; A such that v(0.81 s) = 60 mph
TAU_A = 0.03
A_LAUNCH = LAUNCH_V / (LAUNCH_T - TAU_A * (1 - math.exp(-LAUNCH_T / TAU_A)))


def ramp_geom(s):
    """Lane A from the start line by arc length: contact point, forward, up (the track's inward normal)."""
    if s <= -RAMP_ENTRY_Z:
        return np.array([LANE_A_X, 0.0, -s]), np.array([0, 0, -1.0]), np.array([0, 1.0, 0])
    s1 = s - (-RAMP_ENTRY_Z)
    a1 = R1 * math.pi / 2
    if s1 <= a1:
        th = s1 / R1
        p = np.array([LANE_A_X, R1 - R1 * math.cos(th), RAMP_ENTRY_Z - R1 * math.sin(th)])
        return p, np.array([0, math.sin(th), -math.cos(th)]), np.array([0, math.cos(th), math.sin(th)])
    s2 = s1 - a1
    if s2 <= LV:
        p = np.array([LANE_A_X, R1 + s2, RAMP_ENTRY_Z - R1])
        return p, np.array([0, 1.0, 0]), np.array([0, 0, 1.0])
    s3 = s2 - LV
    ph = s3 / R2
    c2 = np.array([LANE_A_X, R1 + LV, RAMP_ENTRY_Z - R1 + R2])
    p = c2 + R2 * np.array([0, math.sin(ph), -math.cos(ph)])
    return p, np.array([0, math.cos(ph), math.sin(ph)]), np.array([0, -math.sin(ph), math.cos(ph)])


S_ENTRY = -RAMP_ENTRY_Z
S_TOP = S_ENTRY + R1 * math.pi / 2 + LV + R2 * math.pi / 2
RAMP_MOTOR = 0.65  # m/s^2 of push on the climb (the fans hold it on, so the tyres can push)


def run1():
    i0 = 0
    # parked at the start
    q0 = frame_quat([0, 0, -1], [0, 1, 0])
    s, v, a_prev = 0.0, 0.0, 0.0
    phase = "launch"
    t = 0.0
    i = 0
    while True:
        # write the sample
        if i < N and abs(t - TS[i]) < DT / 2:
            p, f, u = ramp_geom(s)
            put(i, p, frame_quat(f, u), v)
            S["fwd"][i] = s
            i += 1
        if s >= S_TOP:
            break
        tau = t - T_L1
        if tau < 0:
            a = 0.0
        elif phase == "launch":
            if tau < LAUNCH_T:
                a = A_LAUNCH * (1 - math.exp(-tau / TAU_A))
            else:
                phase = "lift"
                t_lift = t
                a = A_LAUNCH
        if phase == "lift":
            # off the power: the thrust dies, regen down toward 45 mph
            k = smooth(0.0, 0.16, t - t_lift)
            a = A_LAUNCH * (1 - k) + (-5.2) * k
            if v <= RAMP_V + 0.3 and t - t_lift > 0.16:
                phase = "hold"
                t_hold = t
                a_hold0 = a
        if phase == "hold":
            a = a_hold0 * (1 - smooth(0.0, 0.25, t - t_hold))
            if s >= S_ENTRY:
                phase = "ramp"
                CUES["rampIn"] = t
        if phase == "ramp":
            _, f, _ = ramp_geom(s)
            a = RAMP_MOTOR - G * f[1]
        v = max(0.0, v + a * DT)
        s += v * DT
        t += DT
    CUES["0to60"] = T_L1 + LAUNCH_T
    CUES["top"] = t
    # the release: off the top, upside down, heading south
    p, f, u = ramp_geom(S_TOP)
    v_top = v
    com = p + u * H_CM
    vel = f * v_top * (R2 - H_CM) / R2  # (the centre of mass runs on a tighter circle than the wheels)
    t_rel = t
    CUES["release"] = t_rel
    ROLL0, ROLL1 = 0.10, 1.0
    BRAKE_AT = 1.08
    VY_TOUCH = -1.6
    q_inv = frame_quat(f, u)
    fwd_axis = f.copy()
    braking = False
    thrust = 0.0
    tb = None
    while True:
        tau = t - t_rel
        # roll: a half turn about the direction of travel
        phi = math.pi * smoother((tau - ROLL0) / (ROLL1 - ROLL0))
        q = qmul(qaxis(fwd_axis, phi), q_inv)
        up = qrot(q, [0, 1, 0])
        # side thrusters: a push to start the roll and one to stop it
        roll_rate = math.pi / (ROLL1 - ROLL0) * 30 * ((tau - ROLL0) / (ROLL1 - ROLL0)) ** 2 * (1 - (tau - ROLL0) / (ROLL1 - ROLL0)) ** 2 if ROLL0 < tau < ROLL1 else 0.0
        if tau >= BRAKE_AT:
            if not braking:
                braking = True
                tb = t
                CUES["brake1"] = t
            # feedback: the deceleration that lands at VY_TOUCH, ramped in
            h = com[1] - H_CM
            need = (vel[1] ** 2 - VY_TOUCH**2) / (2 * max(h, 0.05))
            thrust = (G + need) * smooth(0.0, 0.12, t - tb)
        acc = np.array([0.0, -G, 0.0]) + up * thrust
        if i < N and abs(t - TS[i]) < DT / 2:
            put(i, com - up * H_CM, q, float(np.linalg.norm(vel)))
            if braking:
                THR[i, DOWN] = min(1.0, thrust / 16.0)
            if ROLL0 - 0.04 < tau < ROLL0 + 0.22:
                # starting the roll: the left pair push down, the right pair up (shown as the near side's puffs)
                THR[i, [4, 6, 8]] = max(THR[i, 4], 0.9 * smooth(ROLL0 - 0.04, ROLL0, tau) * (1 - smooth(ROLL0 + 0.12, ROLL0 + 0.22, tau)))
            if ROLL1 - 0.26 < tau < ROLL1:
                THR[i, [5, 7, 9]] = max(THR[i, 5], 0.9 * smooth(ROLL1 - 0.26, ROLL1 - 0.2, tau) * (1 - smooth(ROLL1 - 0.06, ROLL1, tau)))
            S["fwd"][i] = 0
            i += 1
        vel = vel + acc * DT
        com = com + vel * DT
        t += DT
        if com[1] <= H_CM and tau > 0.5:
            break
    CUES["touch1"] = t
    CUES["roll1a"] = t_rel + ROLL0
    CUES["roll1b"] = t_rel + ROLL1
    # down: roll out, braking
    pz, vz = com[2], vel[2]
    t_touch = t
    q_end = frame_quat([0, 0, 1], [0, 1, 0])
    while i < N and TS[i] < 40.0 - 1e-6:
        while t < TS[i] - DT / 2:
            dec = 5.0 * smooth(0.0, 0.3, t - t_touch)
            vz = max(0.0, vz - dec * DT)
            pz += vz * DT
            t += DT
        put(i, np.array([LANE_A_X, 0.0, pz]), q_end, vz)
        S["brake"][i] = 1.0 if vz > 0.05 else 0.0
        i += 1
    CUES["stop1"] = t_touch + vel[2] / 5.0
    return v_top


# ------------------------------------------------------------------------------------------------- run 2
T_R2 = 40.0
T_COVER = 42.2  # the right hand over the cup
T_L2 = 43.7
CUES.update({"run2": T_R2, "cover": T_COVER, "launch2": T_L2})
JUMP_V = 20.0
LIFT_T = 0.76
LIFT_NET = 11.8  # m/s^2 up while lifting
ROLL2_0, ROLL2_1 = 0.84, 2.16  # the barrel roll (from lift-off)
VY_TOUCH2 = -2.0


def jump_profile():
    """The jump from lift-off (z = 0, heading -z, speed JUMP_V): returns samples (tau, com_y, vy, thrust, phi)
    at the integration step, so the lift-off point can be placed with the apex over the Semi."""
    y, vy = H_CM, 0.0
    tau = 0.0
    out = []
    braking = False
    tb = 0.0
    while True:
        phi = 2 * math.pi * smoother((tau - ROLL2_0) / (ROLL2_1 - ROLL2_0))
        if tau < LIFT_T:
            k = smooth(0.0, 0.06, tau) * (1 - smooth(LIFT_T - 0.06, LIFT_T, tau))
            thrust = (G + LIFT_NET) * k
        elif tau > ROLL2_1 + 0.04:
            if not braking:
                braking = True
                tb = tau
            h = y - H_CM
            need = (vy**2 - VY_TOUCH2**2) / (2 * max(h, 0.05))
            thrust = (G + max(need, 0.0)) * smooth(0.0, 0.1, tau - tb)
        else:
            thrust = 0.0
        out.append((tau, y, vy, thrust, phi))
        # thrust acts along the car's up (rolled): its vertical share is cos(phi)
        ay = -G + thrust * math.cos(phi)
        vy += ay * DT
        y += vy * DT
        tau += DT
        if y <= H_CM and tau > 0.3:
            out.append((tau, H_CM, vy, thrust, phi))
            break
    return out


def run2():
    prof = jump_profile()
    apex = max(prof, key=lambda r: r[1])
    apex_d = apex[0] * JUMP_V
    z_lift = SEMI_Z + apex_d
    # the ground run from the start: launch at ~1 g to JUMP_V
    z, v = START_B_Z, 0.0
    t = T_R2
    i = idx(T_R2)
    q_n = frame_quat([0, 0, -1], [0, 1, 0])
    while z > z_lift:
        if abs(t - TS[i]) < DT / 2:
            put(i, np.array([LANE_B_X, 0.0, z]), q_n, v)
            S["fwd"][i] = START_B_Z - z
            i += 1
        tau = t - T_L2
        if tau < 0:
            a = 0.0
        else:
            a = 10.5 * (1 - math.exp(-tau / 0.08))
            if v >= JUMP_V - 0.5:
                a *= max(0.0, (JUMP_V - v) / 0.5)
        v = min(JUMP_V, v + a * DT)
        z -= v * DT
        t += DT
    t_lift = t
    CUES["lift2"] = t_lift
    CUES["apex2"] = t_lift + apex[0]
    CUES["roll2a"] = t_lift + ROLL2_0
    CUES["roll2b"] = t_lift + ROLL2_1
    # the flight
    k = 0
    for (tau, y, vy, thrust, phi) in prof:
        tt = t_lift + tau
        if i < N and abs(tt - TS[i]) < DT / 2:
            pitch = math.radians(5.0) * smooth(0.0, 0.25, tau) * (1 - smooth(LIFT_T, LIFT_T + 0.5, tau)) - math.radians(3.0) * smooth(ROLL2_1, ROLL2_1 + 0.4, tau)
            q = frame_quat([0, 0, -1], [0, 1, 0])
            q = qmul(qaxis([1, 0, 0], pitch), q)
            q = qmul(qaxis([0, 0, -1], -phi), q)
            up = qrot(q, [0, 1, 0])
            com = np.array([LANE_B_X, y, z_lift - tau * JUMP_V])
            put(i, com - up * H_CM, q, math.hypot(JUMP_V, vy))
            S["alt"][i] = max(0.0, y - H_CM)
            if thrust > 0.01:
                THR[i, DOWN] = min(1.0, thrust / 22.0)
            # roll thrusters: kick on, kick off
            if ROLL2_0 - 0.04 < tau < ROLL2_0 + 0.24:
                THR[i, [5, 7, 9]] = 0.95 * smooth(ROLL2_0 - 0.04, ROLL2_0, tau) * (1 - smooth(ROLL2_0 + 0.14, ROLL2_0 + 0.24, tau))
            if ROLL2_1 - 0.28 < tau < ROLL2_1:
                THR[i, [4, 6, 8]] = 0.95 * smooth(ROLL2_1 - 0.28, ROLL2_1 - 0.22, tau) * (1 - smooth(ROLL2_1 - 0.06, ROLL2_1, tau))
            S["fwd"][i] = 0
            i += 1
        k += 1
    t = t_lift + prof[-1][0]
    CUES["touch2"] = t
    z = z_lift - prof[-1][0] * JUMP_V
    # the slide: braking hard, the tail coming round until it faces the crowd (west)
    vz = JUMP_V
    yaw = 0.0
    x = LANE_B_X
    vx = 0.0
    t_touch = t
    SLIDE = 1.35
    while i < N:
        tt = TS[i]
        while t < tt - DT / 2:
            tau = t - t_touch
            dec = 8.6 * smooth(0.0, 0.25, tau)
            sp = math.hypot(vx, vz)
            if sp > 1e-4:
                nsp = max(0.0, sp - dec * DT)
                vx, vz = vx * nsp / sp, vz * nsp / sp
            # the velocity bends a little left as it slides
            if sp > 0.5 and 0.15 < tau < SLIDE:
                ang = -0.22 * DT
                c, s_ = math.cos(ang), math.sin(ang)
                vx, vz = vx * c - vz * s_, vx * s_ + vz * c
            yaw = (math.pi / 2) * smoother((tau - 0.15) / SLIDE)
            x -= vx * DT
            z -= vz * DT
            t += DT
        heading = np.array([-math.sin(yaw), 0, -math.cos(yaw)])
        put(i, np.array([x, 0.0, z]), frame_quat(heading, [0, 1, 0]), math.hypot(vx, vz))
        S["brake"][i] = 1.0 if math.hypot(vx, vz) > 0.05 else 0.0
        S["steer"][i] = 0.35 * smooth(0.1, 0.35, tt - t_touch) * (1 - smooth(1.1, 1.6, tt - t_touch))
        i += 1
    CUES["stop2"] = t_touch + JUMP_V / 8.6 + 0.2
    return x, z


v_top = run1()
x_stop, z_stop = run2()

# --------------------------------------------------------------------------- run 2's ending: the creep
# (the stop's own pose, then the operator's nudge: forward 0.8 m, a few degrees right; the yoke turns)
T_STOP2 = CUES["stop2"]
T_CANOPY_UP = T_STOP2 + 1.0
T_CREEP0, T_CREEP1 = T_STOP2 + 5.6, T_STOP2 + 7.3
CUES.update({"canopyUp": T_CANOPY_UP, "creep0": T_CREEP0, "creep1": T_CREEP1})
i_stop = idx(T_STOP2)
base_p = np.array([S["px"][i_stop], 0.0, S["pz"][i_stop]])
base_q = np.array([S["qx"][i_stop], S["qy"][i_stop], S["qz"][i_stop], S["qw"][i_stop]])
for i in range(i_stop, N):
    k = smoother((TS[i] - T_CREEP0) / (T_CREEP1 - T_CREEP0))
    yaw = -math.radians(7.0) * k
    q = qmul(qaxis([0, 1, 0], yaw), base_q)
    fwd = qrot(base_q, [0, 0, -1])
    p = base_p + fwd * 0.85 * k
    put(i, p, q, 0.6 * math.sin(math.pi * k) if 0 < k < 1 else 0.0)
    S["steer"][i] = -0.45 * math.sin(math.pi * min(1, max(0, (TS[i] - T_CREEP0 + 0.3) / (T_CREEP1 - T_CREEP0 + 0.3))))
    S["creep"][i] = k

# ---------------------------------------------------------------------------------- the car's own systems
for i, t in enumerate(TS):
    # the canopy: up at the start, down for run 1, (down through the replay gap and run 2), up at the end
    c = 1 - smooth(T_CANOPY0, T_CANOPY1, t)
    if t >= T_R2:
        c = smooth(T_CANOPY_UP, T_CANOPY_UP + 1.6, t)
    S["canopy"][i] = c
    # Track Mode: down 45 mm, the wings out
    S["wing"][i] = smooth(T_TRACK + 0.3, T_TRACK + 1.3, t) if t < T_R2 else 1.0 - smooth(T_STOP2 + 2.0, T_STOP2 + 3.2, t)
    S["susp"][i] = -0.045 * smooth(T_TRACK, T_TRACK + 0.6, t) if t < T_R2 else -0.045 * (1 - smooth(T_STOP2 + 2.0, T_STOP2 + 3.2, t))
    # the fans: idling in Track Mode, flat out on the ramp, off at the release
    fan = 0.25 * smooth(T_TRACK, T_TRACK + 0.8, t)
    if CUES["rampIn"] - 0.5 <= t < CUES["release"] + 0.1:
        fan = max(fan, smooth(CUES["rampIn"] - 0.5, CUES["rampIn"], t) * (1 - smooth(CUES["release"], CUES["release"] + 0.1, t)))
    if CUES["release"] + 0.1 <= t < T_R2:
        fan = 0.25 * smooth(CUES["touch1"], CUES["touch1"] + 1.5, t)
    if t >= T_R2:
        fan = 0.25 * (1 - smooth(T_STOP2 + 2.0, T_STOP2 + 3.0, t))
    S["fan"][i] = fan
    # the rear thrusters on the 0-60
    if T_L1 - 0.02 <= t < T_L1 + LAUNCH_T + 0.06:
        THR[i, REAR] = smooth(T_L1 - 0.02, T_L1 + 0.03, t) * (1 - smooth(T_L1 + LAUNCH_T - 0.04, T_L1 + LAUNCH_T + 0.06, t))
    # brake lights
    if t < T_L1 or (T_L1 + LAUNCH_T + 0.1 < t < CUES["rampIn"] - 0.4):
        S["brake"][i] = max(S["brake"][i], 1.0 if t < T_L1 else 0.6)

# altitude (for the screen): the contact point's height off the ground (in the air only)
for i in range(N):
    if S["alt"][i] == 0:
        S["alt"][i] = max(0.0, S["py"][i])
    S["ground"][i] = 1.0 if S["py"][i] < 0.02 and abs(S["qy"][i]) < 0.9 else 0.0

# --------------------------------------------------------------------- velocity, specific force, spin
P = np.stack([S["px"], S["py"], S["pz"]], 1)
Q = np.stack([S["qx"], S["qy"], S["qz"], S["qw"]], 1)
for i in range(1, N):  # keep the quaternions on one hemisphere for slerp
    if np.dot(Q[i], Q[i - 1]) < 0:
        Q[i] = -Q[i]
# (the forces felt are the centre of mass's: the contact point swings round it in a roll)
COM = np.array([P[i] + qrot(Q[i], [0, H_CM, 0]) for i in range(N)])
VEL = np.gradient(COM, 1.0 / RATE, axis=0)
ACC = np.gradient(VEL, 1.0 / RATE, axis=0)
# (teleports between runs: no spikes)
for t0 in [30.0, T_R2]:
    j = idx(t0)
    ACC[max(0, j - 3): j + 3] = 0
    VEL[max(0, j - 3): j + 3] = 0
F = np.zeros((N, 3))
W = np.zeros((N, 3))
for i in range(N):
    q = Q[i]
    f_world = ACC[i] - np.array([0, -G, 0])
    if S["ground"][i] > 0 and S["speed"][i] < 0.01 and np.linalg.norm(ACC[i]) < 0.2:
        f_world = np.array([0, G, 0])
    F[i] = qrot(qconj(q), f_world)
    if 0 < i < N - 1:
        dq = qmul(qconj(Q[i - 1]), Q[i + 1])
        if dq[3] < 0:
            dq = -dq
        ang = 2 * math.acos(min(1.0, dq[3]))
        axis = dq[:3] / max(1e-9, np.linalg.norm(dq[:3]))
        W[i] = axis * ang / (2.0 / RATE)
# smooth the specific force a touch (it drives the head and the coffee)
k = np.array([1, 2, 3, 2, 1], float)
k /= k.sum()
F = np.stack([np.convolve(F[:, j], k, mode="same") for j in range(3)], 1)

# the wheels: spin from the speed on the ground; in the air they keep turning and slow down
spin = np.zeros(N)
omega = 0.0
for i in range(1, N):
    if S["ground"][i] > 0 or S["fwd"][i] > 0:
        omega = S["speed"][i] / WHEEL_R
    else:
        omega *= math.exp(-0.25 / RATE)
    spin[i] = spin[i - 1] + omega / RATE
# (run 1's roll-out heads south; spin sign follows the car's own forward)

# ----------------------------------------------------------------------------------- the driver's head
# a spring in the car frame pushed by the g's (what's felt: the specific force less the 1 g of sitting still)
HEAD = np.zeros((N, 3))
d = np.zeros(3)
dv = np.zeros(3)
w0 = 2 * math.pi * 1.6
zeta = 0.55
gain = w0 * w0 * 0.022 / G  # 1 g pushes the head 22 mm
for i in range(N):
    push = -(F[i] - np.array([0, G, 0]))
    if i > 0 and abs(TS[i] - T_R2) < 0.05:
        d[:] = 0
        dv[:] = 0
    for _ in range(SUB):
        acc = -w0 * w0 * d - 2 * zeta * w0 * dv + gain * push
        dv += acc * DT
        d += dv * DT
        # the headrest behind, the harness in front, the seat below
        if d[2] > 0.028:
            d[2] = 0.028
            dv[2] = min(dv[2], 0)
        if d[2] < -0.07:
            d[2] = -0.07
            dv[2] = max(dv[2], 0)
        d[1] = min(max(d[1], -0.035), 0.05)
        d[0] = min(max(d[0], -0.06), 0.06)
    HEAD[i] = d

# where he looks (degrees: yaw left +, pitch up +), keyed in world time
LOOK = [
    # seated: up at the open canopy, round at the crowd, then down as the canopy comes over
    (T_SEATED, 10, 8), (T_CANOPY0, 14, 6), (T_CANOPY1, 2, -4),
    # the coffee into the cupholder, the screen as Track Mode comes on
    (T_CUP0 - 0.3, -26, -30), (T_CUP1 - 0.1, -26, -30), (T_TRACK + 0.2, -14, -20), (T_TRACK + 1.2, -12, -18),
    # the starter's count
    (T_COUNT[0] - 0.5, 9, -2), (T_GO - 0.2, 7, -2), (T_GO + 0.1, 0, -3),
    (CUES["rampIn"] - 0.1, 0, -1), (CUES["rampIn"] + 0.5, 0, 6),
    # over the top: up through the canopy at the ground; then down at the coffee floating out of its cup
    (CUES["release"] - 0.25, 0, 14), (CUES["release"] + 0.05, 0, 22),
    (CUES["release"] + 0.3, -18, -14), (CUES["release"] + 0.55, -30, -31), (CUES["roll1b"] + 0.05, -31, -33),
    (CUES["roll1b"] + 0.5, -4, -12), (CUES["touch1"], 0, -6), (CUES["touch1"] + 1.5, 0, -4),
    (30.0, 0, -4),
    # run 2: the crowd, the hand over the cup, eyes front
    (T_R2, 52, 2), (T_COVER - 0.35, 46, 1), (T_COVER - 0.05, -12, -16), (T_COVER + 0.6, -12, -16), (T_COVER + 1.0, 0, -3),
    (T_L2 + 1.0, 0, -2), (CUES["lift2"], 0, 0),
    # upside down over the Semi: up through the canopy at it
    (CUES["roll2a"], 0, 4), (CUES["apex2"] - 0.2, 6, 30), (CUES["apex2"] + 0.3, 6, 30), (CUES["roll2b"], 0, 0),
    (CUES["touch2"], 0, -6), (CUES["touch2"] + 0.5, 18, -2), (T_STOP2, 6, 0),
    # the crowd, the crew at the door; then the yoke turning by itself, and the man with the controller
    (T_STOP2 + 1.4, 0, 2), (T_STOP2 + 2.6, 22, 0), (T_STOP2 + 3.4, 4, 2),
    (T_CREEP0 - 0.1, 0, 0), (T_CREEP0 + 0.5, 2, -40), (T_CREEP0 + 1.4, 2, -42),
    (T_CREEP0 + 2.0, 31, 0), (T_CREEP0 + 4.4, 32, 1), (T_CREEP0 + 5.4, 8, 2), (T_END, 6, 2),
]
LOOK.sort(key=lambda r: r[0])


def look_at(t):
    if t <= LOOK[0][0]:
        return LOOK[0][1], LOOK[0][2]
    for (ta, ya, pa), (tb, yb, pb) in zip(LOOK, LOOK[1:]):
        if ta <= t <= tb:
            k = smooth(ta, tb, t)
            return ya + (yb - ya) * k, pa + (pb - pa) * k
    return LOOK[-1][1], LOOK[-1][2]


# ------------------------------------------------------------------------------------------- the coffee
# the liquid's surface leans to the felt gravity (sloshing a little behind it); in free fall it rises out
# of the cup as a blob and floats; when the thrusters brake the fall it drops back in
TILT = np.zeros((N, 2))
FLOAT = np.zeros(N)
SPLASH = []
tilt = np.zeros(2)
tilt_v = np.zeros(2)
h, hv = 0.0, 0.0
pressed_t = -9.0
kicked_t = -9.0
for i in range(N):
    f = F[i]
    target = np.array([math.atan2(-f[0], max(f[1], 0.5)), math.atan2(-f[2], max(f[1], 0.5))])
    target = np.clip(target, -0.7, 0.7)
    if np.linalg.norm(f) < 3.0:
        target = target * 0
    for _ in range(SUB):
        wl = 2 * math.pi * 2.6
        a = -wl * wl * (tilt - target) - 2 * 0.12 * wl * tilt_v
        tilt_v += a * DT
        tilt += tilt_v * DT
    TILT[i] = tilt
    # the blob, along the cup's axis
    fy = f[1]
    if fy > 1.5:
        pressed_t = TS[i]
    if TS[i] - pressed_t < 0.25 and abs(fy) < 0.4 and h == 0 and TS[i] - kicked_t > 1.0:
        hv = 0.105  # the squashed liquid springs back up when the weight goes
        kicked_t = TS[i]
    for _ in range(SUB):
        hv += -fy * DT if (h > 0 or -fy > 0 or hv > 0) else 0.0
        h += hv * DT
        if TS[i] >= T_COVER - 0.1 and h > 0.004:  # (his palm over the cup)
            h, hv = 0.004, min(hv, 0.0)
        if h <= 0:
            if hv < -0.25:
                SPLASH.append(round(float(TS[i]), 4))
            h, hv = 0.0, 0.0
    FLOAT[i] = h

# (keep one splash per landing)
splashes = []
for s_ in SPLASH:
    if not splashes or s_ - splashes[-1] > 0.5:
        splashes.append(s_)
CUES["splashes"] = splashes

# ------------------------------------------------------------------------------------------- the timeline
FPS = 30
# video segments: (name, kind)
#   pov1: the intro and run 1 from the driver's seat
#   replay: a phone in the crowd, run 1 again (slow motion on the flip)
#   pov2: run 2 from the driver's seat, with the bullet time at the apex (world stopped, the camera outside)
#   (then on to the end at 1x)


def speed_pov1(w):
    """World seconds per video second on run 1: real time, slowing through the climb into the top, crawling
    through the roll and the floating coffee, back up to speed as the thrusters brake the fall."""
    if w < CUES["rampIn"] - 0.2:
        return 1.0
    if w < CUES["release"]:
        return 1.0 - 0.78 * smooth(CUES["rampIn"] - 0.2, CUES["release"] - 0.1, w)
    if w < CUES["roll1b"] + 0.1:
        return 0.22 - 0.04 * smooth(CUES["release"], CUES["release"] + 0.3, w) * (1 - smooth(CUES["roll1b"] - 0.2, CUES["roll1b"] + 0.1, w))
    return 0.22 + 0.78 * smooth(CUES["roll1b"] + 0.1, CUES["brake1"] + 0.75, w)


def speed_replay(w):
    if w < CUES["release"] - 0.35:
        return 1.0
    if w < CUES["roll1b"]:
        return 1.0 - 0.65 * smooth(CUES["release"] - 0.35, CUES["release"], w)
    return 0.35 + 0.65 * smooth(CUES["roll1b"], CUES["brake1"] + 0.6, w)


BULLET_V = 3.2  # video seconds of bullet time at run 2's apex


def speed_pov2(w):
    if w < CUES["lift2"]:
        return 1.0
    if w < CUES["apex2"]:
        return 1.0 - 0.75 * smooth(CUES["lift2"], CUES["apex2"] - 0.25, w)
    if w < CUES["touch2"]:
        return 0.25 + 0.75 * smooth(CUES["roll2b"] - 0.1, CUES["touch2"] - 0.1, w)
    return 1.0


SEGS = []
v = 0.0


def run_seg(name, w0, w1, sp, extra=None):
    """Video frames for a world-time span at speed sp(w); returns the frames (each with the world time)."""
    global v
    out = []
    w = w0
    v0 = v
    while w < w1:
        out.append((name, w))
        # advance one video frame: integrate dw = sp(w) dv
        for _ in range(SUB):
            w += sp(w) / (FPS * SUB)
        v += 1.0 / FPS
    SEGS.append({"name": name, "v0": round(v0, 4), "v1": round(v, 4), "w0": round(w0, 4), "w1": round(w, 4)})
    return out


frames = []
frames += run_seg("pov1", 0.0, CUES["touch1"] + 1.3, speed_pov1)
REPLAY_W0 = CUES["release"] - 1.0
frames += run_seg("replay", REPLAY_W0, CUES["touch1"] + 1.4, speed_replay)
POV2_W0 = 40.0
frames += run_seg("pov2", POV2_W0, CUES["apex2"], speed_pov2)
# the bullet time: the world stopped at the apex
v_b0 = v
for k in range(int(round(BULLET_V * FPS))):
    frames.append(("bullet", CUES["apex2"]))
    v += 1.0 / FPS
SEGS.append({"name": "bullet", "v0": round(v_b0, 4), "v1": round(v, 4), "w0": CUES["apex2"], "w1": CUES["apex2"]})
END_W = T_CREEP0 + 6.6
frames += run_seg("pov2b", CUES["apex2"], END_W, speed_pov2)

NF = len(frames)
VIDEO_END = NF / FPS

# video-time cues
def v_of(seg, w):
    for k, (name, ww) in enumerate(frames):
        if name == seg and ww >= w:
            return round(k / FPS, 4)
    return None


VCUES = {
    "launch1": v_of("pov1", T_L1),
    "rampIn": v_of("pov1", CUES["rampIn"]),
    "release": v_of("pov1", CUES["release"]),
    "roll1b": v_of("pov1", CUES["roll1b"]),
    "brake1": v_of("pov1", CUES["brake1"]),
    "touch1": v_of("pov1", CUES["touch1"]),
    "replay": SEGS[1]["v0"],
    "replayRelease": v_of("replay", CUES["release"]),
    "replayTouch": v_of("replay", CUES["touch1"]),
    "pov2": SEGS[2]["v0"],
    "launch2": v_of("pov2", T_L2),
    "lift2": v_of("pov2", CUES["lift2"]),
    "bullet0": SEGS[3]["v0"],
    "bullet1": SEGS[3]["v1"],
    "touch2": v_of("pov2b", CUES["touch2"]),
    "stop2": v_of("pov2b", T_STOP2),
    "canopyUp": v_of("pov2b", T_CANOPY_UP),
    "creep0": v_of("pov2b", T_CREEP0),
    "end": round(VIDEO_END, 4),
}
for k, wv in [("count3", T_COUNT[0]), ("count2", T_COUNT[1]), ("count1", T_COUNT[2]), ("go", T_GO), ("canopy0", T_CANOPY0), ("boot", T_BOOT), ("track", T_TRACK), ("cup0", T_CUP0)]:
    VCUES[k] = v_of("pov1", wv)
for k, sp in enumerate(splashes):
    seg = "pov1" if sp < 30 else "pov2b"
    VCUES[f"splash{k}"] = v_of(seg, sp)

# ----------------------------------------------------------------------------------------------- write
def r(a, n=4):
    return [round(float(x), n) for x in a]


path = {
    "rate": RATE,
    "n": N,
    "cues": {k: (round(v_, 5) if not isinstance(v_, list) else v_) for k, v_ in CUES.items()},
    "lineup": LINEUP_AT,
    "ramp": {"entryZ": RAMP_ENTRY_Z, "r1": R1, "lv": LV, "r2": R2, "top": RAMP_TOP, "x": LANE_A_X},
    "lanes": {"a": LANE_A_X, "b": LANE_B_X, "startB": START_B_Z},
    "thrusters": THRUSTERS,
    "hcm": H_CM,
    "p": r(P.flatten(), 4),
    "q": r(Q.flatten(), 5),
    "speed": r(S["speed"], 3),
    "f": r(F.flatten(), 3),
    "w": r(W.flatten(), 3),
    "spin": r(spin, 3),
    "steer": r(S["steer"], 3),
    "susp": r(S["susp"], 4),
    "wing": r(S["wing"], 3),
    "canopy": r(S["canopy"], 3),
    "fan": r(S["fan"], 3),
    "brake": r(S["brake"], 2),
    "thr": r(THR.flatten(), 3),
    "alt": r(S["alt"], 3),
    "head": r(HEAD.flatten(), 4),
    "look": [[round(a, 3), b, c] for a, b, c in LOOK],
    "tilt": r(TILT.flatten(), 4),
    "float": r(FLOAT, 4),
    "creep": r(S["creep"], 4),
}
timeline = {
    "fps": FPS,
    "frames": [[{"pov1": 0, "replay": 1, "pov2": 2, "bullet": 3, "pov2b": 2}[n], round(w, 5)] for n, w in frames],
    "segs": SEGS,
    "cues": VCUES,
    "cuesW": {k: (round(v_, 5) if not isinstance(v_, list) else v_) for k, v_ in CUES.items()},
}
os.makedirs(os.path.join(ROOT, "src", "roadster"), exist_ok=True)
with open(os.path.join(ROOT, "src", "roadster", "path.json"), "w") as fh:
    json.dump(path, fh, separators=(",", ":"))
with open(os.path.join(ROOT, "src", "roadster", "timeline.json"), "w") as fh:
    json.dump(timeline, fh, separators=(",", ":"))

print(f"path: {N} samples ({T_END} s at {RATE} Hz); top speed {v_top:.2f} m/s at the top of the ramp")
print(f"video: {NF} frames = {VIDEO_END:.2f} s")
for sg in SEGS:
    print(f"  {sg['name']:7s} video {sg['v0']:6.2f}-{sg['v1']:6.2f}  world {sg['w0']:6.2f}-{sg['w1']:6.2f}")
for k in ["launch1", "0to60", "rampIn", "top", "release", "roll1a", "roll1b", "brake1", "touch1", "stop1", "lift2", "roll2a", "apex2", "roll2b", "touch2", "stop2", "creep0"]:
    print(f"  world {k:8s} {CUES[k]:7.3f}   video {VCUES.get(k, '')}")
# clearance over the lineup: the car's lowest point (wheels and body corners, rolled) over each vehicle
corners = [np.array([sx * 1.0, y, z]) for sx in (-1, 1) for y in (0.0, 0.62, 1.1) for z in (-2.1, 0.0, 2.1)]
for veh in LINEUP_AT:
    lo = 1e9
    for i in range(idx(CUES["lift2"]), idx(CUES["touch2"])):
        pz = S["pz"][i]
        q = Q[i]
        for c in corners:
            wpt = P[i] + qrot(q, c)
            if abs(wpt[2] - veh["z"]) < veh["w"] / 2 + 0.05:
                lo = min(lo, wpt[1] - veh["h"])
    print(f"  clearance over {veh['name']:10s} {lo:6.2f} m")
print("  splashes", splashes, "lineup", [(l["name"], l["z"]) for l in LINEUP_AT])
print("  stop2 at", round(x_stop, 2), round(z_stop, 2))
