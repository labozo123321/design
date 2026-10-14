#!/usr/bin/env python3
"""
Timeline for the Looks composition ("POV: you're the school photographer in the looksmaxing era"): writes
src/looks/timeline.json with every cue (in video seconds and in world seconds), and per frame the world
time, how far into a "sigma edit" the picture is (slow motion, the grade), and the photo holds.

Video time runs at 30 fps. World time is what the people and the camera move in: it slows to EDIT_SPEED in
each edit (a short speed ramp in and out) and stops dead while a photo is held after the flash.

  0.0   the camera's on: the line of kids waiting along the gym wall, the teacher, the stool; the title;
        the photographer pans from the line to the stool and zooms in to a portrait
  each kid: walks in, sits; the focus locks (beep); the photographer's hand; the kid starts "the face":
        the edit (phonk, slow motion, dark grade, letterbox) until the FLASH; the photo held; up and off
  the one normal kid: no edit, a real smile, a perfect photo
  the photographer: lifts the camera off the tripod, turns it round, checks nobody's looking... the edit
  the yearbook page: all of them

    python3 scripts/generate-looks-timeline.py
"""

import json
import os

FPS = 30
EDIT_SPEED = 0.38
BPM = 128  # the phonk in each edit: its beat grid starts on the edit's drop
RAMP = 0.14  # seconds of speed ramp into and out of an edit
HOLD = 1.3  # the photo held after the flash

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------------------------- the blocks
# each kid's beats relative to his block's start (video seconds)
KID_BEATS = {
    "in": 0.0,  # walks in from the left
    "sit": 1.0,
    "focus": 1.35,  # the focus box locks on (beep)
    "gesture": 1.55,  # the photographer's hand
    "pose": 2.3,  # starts the face
    "edit0": 2.5,  # the edit begins
    "flash": 5.4,
}

BLOCKS = []


def kid(name, start, flash=None, edit0=None, extra=None):
    b = {k: start + v for k, v in KID_BEATS.items()}
    if flash is not None:
        b["flash"] = start + flash
    if edit0 is not None:
        b["edit0"] = start + edit0
    b["photoEnd"] = b["flash"] + HOLD
    b["up"] = b["photoEnd"] + 0.12
    b["out"] = b["up"] + 0.3
    if extra:
        for k, v in extra.items():
            b[k] = start + v
    b["name"] = name
    BLOCKS.append(b)
    return b


INTRO_END = 3.2
k1 = kid("mewer", 3.2)
k2 = kid("hunter", 10.2)
k3 = kid("gum", 17.2)
k4 = kid("glass", 24.2)
# the one normal kid: no edit at all; a smile, the flash
k7 = kid("normal", 31.2, flash=3.1, edit0=None, extra={"smile": 2.2})
k7["edit0"] = None
k5 = kid("height", 36.0, flash=5.7, extra={"stand": 2.5, "wobble": 5.2})
k5["fall"] = k5["photoEnd"] + 0.15
k5["popUp"] = k5["photoEnd"] + 1.0
# the mogger: the edit starts as he walks in (slow motion, the friend's leaf blower on his hair)
k6 = kid("mogger", 44.2, flash=6.6, edit0=0.25, extra={"sit": 2.2, "focus": 2.5, "pose": 2.6, "glasses": 3.4, "flip": 5.9})
P0 = 52.4
PHOTOG = {
    "lift": P0 + 0.0,  # the camera comes off the tripod
    "turn0": P0 + 0.5,
    "turn1": P0 + 1.3,  # turned round: his face
    "look": P0 + 1.7,  # checks nobody's watching
    "throat": P0 + 2.9,
    "pose": P0 + 3.4,
    "edit0": P0 + 3.6,
    "blow": P0 + 4.6,  # the leaf blower finds his comb-over
    "flash": P0 + 6.9,
}
PHOTOG["photoEnd"] = PHOTOG["flash"] + HOLD + 0.2
YEARBOOK = PHOTOG["photoEnd"] + 0.15
END = 70.0
NF = int(round(END * FPS))

# ------------------------------------------------------------------------------------- the speed of time
edits = [(b["edit0"], b["flash"]) for b in BLOCKS if b["edit0"] is not None] + [(PHOTOG["edit0"], PHOTOG["flash"])]
holds = [(b["flash"], b["photoEnd"]) for b in BLOCKS] + [(PHOTOG["flash"], PHOTOG["photoEnd"])]


def smooth(a, b, x):
    k = min(1.0, max(0.0, (x - a) / (b - a)))
    return k * k * (3 - 2 * k)


def edit_amount(v):
    """0 outside an edit, 1 in it (ramped in at the start; it ends dead on the flash)."""
    for a, b in edits:
        if a - RAMP <= v < b:
            return smooth(a - RAMP, a + RAMP, v)
    return 0.0


def speed(v):
    for a, b in holds:
        if a <= v < b:
            return 0.0
    if v >= YEARBOOK:
        return 1.0
    e = edit_amount(v)
    return 1.0 + (EDIT_SPEED - 1.0) * e


# integrate on a fine grid
SUB = 20
dt = 1.0 / (FPS * SUB)
w = 0.0
W = []
for f in range(NF + 1):
    W.append(w)
    for s in range(SUB):
        w += speed(f / FPS + (s + 0.5) * dt) * dt


def w_of_v(v):
    f = v * FPS
    i = min(int(f), NF - 1)
    a = f - i
    return W[i] + (W[i + 1] - W[i]) * a


frames = []
for f in range(NF):
    v = f / FPS
    hold = None
    for i, (a, b) in enumerate(holds):
        if a <= v < b:
            hold = {"photo": i, "t": round(v - a, 4)}
    frames.append({"w": round(W[f], 5), "edit": round(edit_amount(v), 4), "hold": hold})

cues = {"introEnd": INTRO_END, "yearbook": YEARBOOK, "end": END}
for b in BLOCKS:
    for k, v in b.items():
        if k == "name" or v is None:
            continue
        cues[f"{b['name']}.{k}"] = round(v, 4)
for k, v in PHOTOG.items():
    cues[f"photog.{k}"] = round(v, 4)
cues_w = {k: round(w_of_v(v), 5) for k, v in cues.items()}

out = {
    "fps": FPS,
    "frames": frames,
    "cues": cues,
    "cuesW": cues_w,
    "kids": [b["name"] for b in BLOCKS],
    "edits": edits,
    "bpm": BPM,
    "holds": holds,
    "editSpeed": EDIT_SPEED,
}
path = os.path.join(ROOT, "src", "looks", "timeline.json")
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as fh:
    json.dump(out, fh, separators=(",", ":"))
print(f"wrote {path}: {NF} frames, {END} s; world end {W[NF]:.3f} s")
for b in BLOCKS:
    print(f"  {b['name']:7s} in {b['in']:5.1f}  flash {b['flash']:5.1f}  photo to {b['photoEnd']:5.1f}")
print(f"  photog  lift {PHOTOG['lift']:5.1f}  flash {PHOTOG['flash']:5.1f}  yearbook {YEARBOOK:5.1f}")
