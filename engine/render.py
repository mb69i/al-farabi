"""Renders a card or certificate from a forma image and a layout.

Layout shape (same as alfarabi-cert-engine/config/layout.json, plus max_lines):
  {"reference_size": [w, h]?, "fields": {name: {text, x, y, anchor, font, font_ar,
    size, min_size, max_width, max_lines, color, line_gap}}}
Coordinates are in forma pixels, or in reference_size pixels when given.
"""
from __future__ import annotations

import io
import time

from PIL import Image, ImageDraw

from engine.text import fit_text, shape

MAX_FORMA_SIDE = 3000
PDF_DPI = 150


class _Blank(dict):
    def __missing__(self, key):
        return ""


def _has_arabic(s: str) -> bool:
    return any("؀" <= c <= "ۿ" for c in s)


def render(forma: Image.Image, layout: dict, values: dict[str, str]) -> Image.Image:
    img = forma.convert("RGB").copy()
    draw = ImageDraw.Draw(img)

    ref = layout.get("reference_size")
    k = img.width / float(ref[0]) if ref else 1.0
    safe_values = _Blank({key: str(v) for key, v in (values or {}).items() if v is not None})

    for field in (layout.get("fields") or {}).values():
        text = " ".join(str(field.get("text", "")).format_map(safe_values).split())
        if not text:
            continue
        font_name = field.get("font_ar") if _has_arabic(text) and field.get("font_ar") else field["font"]
        size = max(1, round(field.get("size", 40) * k))
        min_size = max(1, round(field.get("min_size", field.get("size", 40)) * k))
        max_width = field.get("max_width", img.width) * k
        font, lines = fit_text(draw, text, font_name, size, min_size, max_width, field.get("max_lines", 1))

        anchor = field.get("anchor", "ms")
        line_height = font.size * (1 + float(field.get("line_gap", 0.35)))
        x = field["x"] * k
        y = field["y"] * k - (len(lines) - 1) * line_height / 2
        for i, line in enumerate(lines):
            draw.text((x, y + i * line_height), shape(line), font=font,
                      fill=field.get("color", "#000000"), anchor=anchor)
    return img


def to_png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


# Fixed PDF dates so the same certificate always gives the same bytes: a retried send with the
# same email idempotency key is then recognised by Resend instead of rejected as a conflict.
PDF_DATE = time.gmtime(1795219200)  # 2026-11-21 00:00 UTC


def to_pdf(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "PDF", resolution=PDF_DPI, creationDate=PDF_DATE, modDate=PDF_DATE,
                            title="Al-Farabi Conference")
    return buf.getvalue()


def _cap(img: Image.Image) -> Image.Image:
    if max(img.size) > MAX_FORMA_SIDE:
        img = img.copy()
        img.thumbnail((MAX_FORMA_SIDE, MAX_FORMA_SIDE), Image.LANCZOS)
    return img.convert("RGB")


def forma_from_upload(data: bytes, content_type: str) -> Image.Image:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct == "application/pdf":
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(data)
        try:
            page = pdf[0]
            return _cap(page.render(scale=PDF_DPI / 72).to_pil())
        finally:
            pdf.close()
    if ct in ("image/png", "image/jpeg", "image/jpg", "image/webp"):
        return _cap(Image.open(io.BytesIO(data)))
    raise ValueError(f"Unsupported template type: {content_type}")
