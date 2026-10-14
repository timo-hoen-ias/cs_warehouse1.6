#!/usr/bin/env python3
"""Kontaktbogen: setzt die PNGs <ordner>/<prefix>-<waffe>.png (aus weapon-sheet.mjs) zu einem Raster zusammen.

Aufruf: python3 scripts/weapon-contact.py <ordner> <prefix> <ausgabe.png> [x0,y0,x1,y1] [spalten] [skalierung]
Beispiel (First Person, rechte untere Bildhälfte): python3 scripts/weapon-contact.py out fp out/fp-sheet.png 400,250,1280,800 4 0.55
"""
import glob
import os
import sys

from PIL import Image, ImageDraw


def main() -> None:
    folder, prefix, out = sys.argv[1:4]
    crop = tuple(int(v) for v in sys.argv[4].split(",")) if len(sys.argv) > 4 and sys.argv[4] else None
    cols = int(sys.argv[5]) if len(sys.argv) > 5 else 4
    scale = float(sys.argv[6]) if len(sys.argv) > 6 else 0.5
    files = sorted(glob.glob(os.path.join(folder, f"{prefix}-*.png")))
    files = [f for f in files if not f.endswith("-meta.json")]
    if not files:
        sys.exit("keine Bilder gefunden")
    tiles = []
    for f in files:
        im = Image.open(f).convert("RGB")
        if crop:
            im = im.crop(crop)
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        name = os.path.basename(f)[len(prefix) + 1 : -4]
        ImageDraw.Draw(im).text((6, 4), name, fill=(255, 255, 255))
        tiles.append(im)
    w, h = tiles[0].size
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * h), (30, 34, 38))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * w, (i // cols) * h))
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
