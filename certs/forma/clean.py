"""Makes the certificate background from the owner's forma (forma.pdf, one 3509 x 2481 px image, 300 dpi).

The forma has sample text baked in (name, organisation, the paragraph with the date, and a sample
QR with its number). This erases exactly those areas and fills them from the surrounding paper,
so the engine can print the real values. Everything else (logos, banner, title, gold rule,
signature) stays as the designer made it.

Usage: .venv/Scripts/python.exe -I certs/forma/clean.py
Writes certs/forma/background.jpg
"""
from __future__ import annotations

import sys
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image

HERE = Path(__file__).resolve().parent

# (x0, y0, x1, y1) in forma pixels, measured from the ink on the forma.
ERASE = {
    "name": (1300, 1145, 2215, 1313),        # above the gold rule (rule is y 1318-1321)
    "org": (1530, 1350, 1980, 1450),
    "paragraph": (800, 1495, 2710, 1895),    # three lines; the date sits in line two
    "qr": (235, 2055, 815, 2262),            # sample QR, "Certificate No.", sample number
    "name_tail": (1960, 1323, 2025, 1345),   # a descender of the sample name that crosses below the rule
}
# Where that descender sits on the gold rule itself: copy a clean slice of rule from just beside it.
CLONE = [((1980, 1306, 1998, 1332), -24)]  # (box, dx of the source)
# The QR's sharp edges leave JPEG halos: catch fainter ink and grow the mask further there.
TUNING = {"qr": (238, 6)}


def is_ink(p: tuple[int, int, int], dark: int = 230) -> bool:
    # paper is ~ (255,254,249); the faint crest watermark ~ (242,241,237); text is far darker or coloured
    return min(p) < dark or max(p) - min(p) > 16


def erase(img: Image.Image, box: tuple[int, int, int, int], dark: int = 230, grow: int = 3) -> None:
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    px = img.load()
    ink = [[is_ink(px[x0 + x, y0 + y], dark) for x in range(w)] for y in range(h)]
    # grow the mask to take the anti-aliased edges too
    mask = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if ink[y][x]:
                for yy in range(max(0, y - grow), min(h, y + grow + 1)):
                    row = mask[yy]
                    for xx in range(max(0, x - grow), min(w, x + grow + 1)):
                        row[xx] = True
    src = [[px[x0 + x, y0 + y] for x in range(w)] for y in range(h)]

    def runs(line: list[bool]):
        i = 0
        while i < len(line):
            if line[i]:
                j = i
                while j < len(line) and line[j]:
                    j += 1
                yield i, j
                i = j
            else:
                i += 1

    acc = [[None] * w for _ in range(h)]  # (r, g, b, weight) sums

    def add(y: int, x: int, c, wt: float):
        a = acc[y][x]
        acc[y][x] = (c[0] * wt, c[1] * wt, c[2] * wt, wt) if a is None else (
            a[0] + c[0] * wt, a[1] + c[1] * wt, a[2] + c[2] * wt, a[3] + wt)

    # horizontal and vertical linear fills, the shorter span weighted more
    for y in range(h):
        for i, j in runs(mask[y]):
            left = src[y][i - 1] if i > 0 else None
            right = src[y][j] if j < w else None
            span = j - i + 1
            for x in range(i, j):
                t = (x - i + 1) / span
                if left and right:
                    c = tuple(left[k] * (1 - t) + right[k] * t for k in range(3))
                else:
                    c = left or right
                if c:
                    add(y, x, c, 1.0 / span)
    for x in range(w):
        col = [mask[y][x] for y in range(h)]
        for i, j in runs(col):
            up = src[i - 1][x] if i > 0 else None
            down = src[j][x] if j < h else None
            span = j - i + 1
            for y in range(i, j):
                t = (y - i + 1) / span
                if up and down:
                    c = tuple(up[k] * (1 - t) + down[k] * t for k in range(3))
                else:
                    c = up or down
                if c:
                    add(y, x, c, 1.0 / span)
    for y in range(h):
        for x in range(w):
            a = acc[y][x]
            if mask[y][x] and a:
                px[x0 + x, y0 + y] = (round(a[0] / a[3]), round(a[1] / a[3]), round(a[2] / a[3]))


def main() -> int:
    pdf = pdfium.PdfDocument(str(HERE / "forma.pdf"))
    try:
        obj = next(o for o in pdf[0].get_objects() if o.type == pdfium.raw.FPDF_PAGEOBJ_IMAGE)
        img = obj.get_bitmap(render=False).to_pil().convert("RGB")
    finally:
        pdf.close()
    if img.size != (3509, 2481):
        print(f"unexpected forma size {img.size}", file=sys.stderr)
        return 1
    for key, box in ERASE.items():
        dark, grow = TUNING.get(key, (230, 3))
        erase(img, box, dark, grow)
    for (x0, y0, x1, y1), dx in CLONE:
        img.paste(img.crop((x0 + dx, y0, x1 + dx, y1)), (x0, y0))
    img.save(HERE / "background.jpg", quality=95, subsampling=0, dpi=(300, 300))
    print("wrote", HERE / "background.jpg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
