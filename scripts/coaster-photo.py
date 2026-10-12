#!/usr/bin/env python3
"""
The ride photo for the Coaster ending: takes the CoasterPhoto still (rendered at scale 2, 3840x2160),
puts the ride's badge in the corner the way the booth prints it on every photo, and writes the JPEG the
booth screen shows.

    npx remotion still CoasterPhoto out/coaster/photo.png --scale=2 --gl=angle
    python3 scripts/coaster-photo.py out/coaster/photo.png   # writes public/coaster/photo.jpg
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "coaster", "photo.jpg")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def main(src: str) -> None:
    im = Image.open(src).convert("RGB")
    W, H = im.size
    k = W / 3840
    d = ImageDraw.Draw(im, "RGBA")
    font = ImageFont.truetype(FONT, round(118 * k))
    txt = "THE DROP"
    bb = d.textbbox((0, 0), txt, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    pad = round(40 * k)
    x0, y0 = round(90 * k), H - round(300 * k)
    # a dark tab, the name in white, the track's orange underneath
    d.rounded_rectangle((x0, y0, x0 + tw + pad * 2, y0 + th + pad * 2), radius=round(34 * k), fill=(20, 20, 24, 215))
    d.rectangle((x0 + pad, y0 + th + pad + round(22 * k), x0 + pad + tw, y0 + th + pad + round(32 * k)), fill=(229, 83, 31, 255))
    d.text((x0 + pad - bb[0], y0 + pad - bb[1] - round(6 * k)), txt, font=font, fill=(255, 255, 255, 255))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    im.save(OUT, quality=92)
    print("wrote", os.path.normpath(OUT), im.size)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out/coaster/photo.png")
