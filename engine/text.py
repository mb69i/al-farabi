"""Arabic-safe text shaping and fitting (shrink first, then wrap, then ellipsis).

Ported from alfarabi-cert-engine/src/cert_generator.py (_shape_arabic), with
wrapping added. Lines are wrapped in *logical* order and each line is shaped on
its own: shaping a multi-line string with bidi would reorder the lines.
"""
from __future__ import annotations

import os
from functools import lru_cache

from PIL import ImageDraw, ImageFont, features

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
ELLIPSIS = "…"
_HAS_RAQM = features.check("raqm")


def font_path(name: str) -> str:
    """Bundled font file name (or an absolute path) -> absolute path."""
    if os.path.isabs(name):
        return name
    return os.path.join(FONT_DIR, os.path.basename(name))


@lru_cache(maxsize=256)
def load_font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(font_path(name), size)


def shape(text: str) -> str:
    """Joined Arabic letters in visual order; unchanged when Pillow has raqm."""
    if _HAS_RAQM or not any("؀" <= c <= "ۿ" for c in text):
        return text
    import arabic_reshaper
    from bidi.algorithm import get_display

    return get_display(arabic_reshaper.reshape(text))


def text_width(draw: ImageDraw.ImageDraw, line: str, font: ImageFont.FreeTypeFont) -> float:
    return draw.textlength(shape(line), font=font)


def _split_long_word(draw, word, font, max_width) -> list[str]:
    parts, cur = [], ""
    for ch in word:
        if cur and text_width(draw, cur + ch, font) > max_width:
            parts.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        parts.append(cur)
    return parts


def _wrap(draw, text, font, max_width) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        pieces = [word] if text_width(draw, word, font) <= max_width else _split_long_word(draw, word, font, max_width)
        for piece in pieces:
            candidate = f"{cur} {piece}" if cur else piece
            if text_width(draw, candidate, font) <= max_width:
                cur = candidate
            else:
                if cur:
                    lines.append(cur)
                cur = piece
    if cur:
        lines.append(cur)
    return lines


def _with_ellipsis(draw, line, font, max_width) -> str:
    words = line.split()
    while words:
        candidate = " ".join(words) + ELLIPSIS
        if text_width(draw, candidate, font) <= max_width:
            return candidate
        words.pop()
    return ELLIPSIS


def fit_text(draw, text, font_name, size, min_size, max_width, max_lines):
    """Returns (font, logical_lines) so every shaped line fits max_width."""
    text = " ".join((text or "").split())
    max_lines = max(1, int(max_lines or 1))
    min_size = max(1, min(int(min_size or size), int(size)))

    s = int(size)
    while True:
        font = load_font(font_name, s)
        if text_width(draw, text, font) <= max_width:
            return font, [text]
        if s <= min_size:
            break
        s = max(min_size, s - 2)

    font = load_font(font_name, min_size)
    lines = _wrap(draw, text, font, max_width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = _with_ellipsis(draw, lines[-1], font, max_width)
    return font, lines
