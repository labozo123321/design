"""
The layout of THE DROP, a dive coaster (see coaster_track.py for how pieces are built).

  station (east) -> left turn -> 50 deg chain lift to 57 m -> a slow right-hand turnaround at the top ->
  the holding brake: the front row hangs over a vertical drop -> 61 m straight down into a tunnel under the
  plaza -> Immelmann -> diving right turn -> splashdown on the lake -> zero-g roll -> overbanked turn ->
  airtime hill -> helix -> brake run -> back into the station.

Coordinates: metres, y up, x east, z south. The heartline is the line through the riders' chests (front
row centre); the rails run 1.25 m below it.
"""

import math

import numpy as np

from coaster_track import G, Track

HEART_STATION = 1.9  # heartline over the station floor (the platform is at 1.0)
LIFT_STRAIGHT = 52.0
TURN_L = 26.0
VERT_L = 14.0
TUNNEL_L = 26.0
DIVE_L = 84.0
DIVE_CLIMB = -39.166
ZR_CLIMB = 30.0
ZR_L = 46.0
SWOOP_L = 89.44
SWOOP_CLIMB = 0.0
HOP_PITCH = 22.0


def smooth(a, b, x):
    k = min(1.0, max(0.0, (x - a) / (b - a)))
    return k * k * (3 - 2 * k)


def build(verbose=True):
    B = Track(P=(-46.0, HEART_STATION, 0.0), T=(1, 0, 0), U=(0, 1, 0), v=0.0)
    # ---------------------------------------------------------------- station, straight into the lift
    B.hold(2.4)
    B.mark("station0")
    B.straight(40.0)
    B.mark("station1")
    B.note("station end")
    B.straight(3.0)
    # ---------------------------------------------------------------- the chain lift (east)
    B.mark("lift0")
    B.hold(5.4)
    B.pitch(50.0, 20.0)
    B.mark("liftUp")
    B.straight(LIFT_STRAIGHT)
    B.mark("liftTop0")
    B.pitch(-50.0, 18.0)
    B.mark("lift1")
    B.note("lift top")
    # ---------------------------------------------------------------- the turnaround and the holding brake
    B.hold(3.6)
    B.straight(1.0)
    B.mark("turn0")
    B.yaw(-180.0, TURN_L, bank=8.0)
    B.mark("turn1")
    B.straight(3.0)
    B.mark("hold")
    B.note("holding brake")
    B.hold(None)
    B.v = 1.2
    B.pitch(-90.0, 20.0)
    B.note("vertical")
    B.mark("vertical")
    B.straight(VERT_L)
    # ---------------------------------------------------------------- pull out into the tunnel
    B.mark("pull0")
    B.fvd(
        80.0,
        gn=lambda u, t: min(3.9, 0.15 + (t.s - t.marks["pull0"]) / 14.0 * 3.75)
        if t.T[1] < -0.34
        else 1.0 + 2.9 * smooth(0.0, 0.34, -t.T[1]),
        until=lambda t: t.T[1] >= 0.0,
    )
    B.note("tunnel")
    B.mark("tunnel0")
    B.straight(TUNNEL_L)
    B.mark("tunnel1")
    B.note("tunnel end")
    # ---------------------------------------------------------------- Immelmann
    B.mark("imm0")
    B.fvd(
        200.0,
        gn=lambda u, t: 1.0 + 2.9 * smooth(0.0, 14.0, t.s - t.marks["imm0"]) - 1.6 * smooth(0.2, 1.0, -t.U[1]),
        until=lambda t: t.U[1] < -0.985 and t.T[1] < 0.02,
    )
    B.note("imm top")
    B.mark("immTop")
    B.climbroll(180.0, 24.0, climb=-0.6)
    B.note("imm out")
    B.mark("imm1")
    B.straight(2.0)
    # ---------------------------------------------------------------- diving right turn down to the lake
    B.mark("dive0")
    B.turn(-180.0, DIVE_L, climb=DIVE_CLIMB, kind="trap0.3")
    B.mark("dive1")
    B.note("dive turn")
    # ---------------------------------------------------------------- splashdown
    B.mark("splash0")
    B.straight(26.0)
    B.mark("splash1")
    B.note("splash out")
    # ---------------------------------------------------------------- zero-g roll
    B.mark("zr0")
    B.fvd(60.0, gn=lambda u, t: 1.0 + 1.4 * smooth(0.0, 8.0, t.s - t.marks["zr0"]), until=lambda t: t.T[1] >= math.sin(math.radians(ZR_CLIMB)))
    B.note("zr climb")
    B.mark("zrRoll")
    B.fvd(ZR_L, gn=lambda u, t: 0.0, roll=lambda u, t: 360.0 / ZR_L * 2 * math.sin(math.pi * u) ** 2)
    B.note("zr roll")
    B.mark("zr1")
    B.fvd(60.0, gn=lambda u, t: 1.0 + 2.2 * smooth(0.0, 8.0, t.s - t.marks["zr1"]), until=lambda t: t.T[1] >= -0.001)
    B.note("zr out")
    # ---------------------------------------------------------------- the swoop: a banked turn back east
    B.straight(3.0)
    B.mark("swoop0")
    B.turn(-180.0, SWOOP_L, climb=SWOOP_CLIMB, kind="trap0.25", bankmax=75.0)
    B.mark("swoop1")
    B.note("swoop")
    # ---------------------------------------------------------------- airtime hop
    B.straight(4.0)
    B.mark("hop0")
    B.fvd(60.0, gn=lambda u, t: 1.0 + 1.4 * smooth(0.0, 6.0, t.s - t.marks["hop0"]), until=lambda t: t.T[1] >= math.sin(math.radians(HOP_PITCH)))
    B.mark("hopTop")
    B.fvd(80.0, gn=lambda u, t: -0.25, until=lambda t: t.T[1] <= -math.sin(math.radians(HOP_PITCH)))
    B.mark("hop1")
    B.fvd(60.0, gn=lambda u, t: 1.0 + 1.6 * smooth(0.0, 8.0, t.s - t.marks["hop1"]), until=lambda t: t.T[1] >= -0.001)
    B.note("hop out")
    # ---------------------------------------------------------------- brakes and home
    B.straight(3.0)
    B.mark("brake0")
    B.straight(30.0)
    B.mark("brake1")
    B.note("brakes end")
    B.hold(4.0)
    B.connect(np.array([-46.0, HEART_STATION, 0.0]), 90.0)
    B.mark("home")
    B.note("home")
    return B


if __name__ == "__main__":
    B = build()
    print("\n".join(B.log))
    P, T, U, v, gn, gl = B.arrays()
    print("len", B.s, "gn", gn.min(), gn.max(), "gl", gl.min(), gl.max())
