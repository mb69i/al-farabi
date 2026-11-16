from PIL import Image, ImageDraw

from engine.render import forma_from_upload, render, to_pdf, to_png
from engine.text import fit_text, font_path, shape, text_width

ARABIC_FONT = "IBMPlexSansArabic-Bold.ttf"
FIXTURE_PDF = "tests/py/fixtures/test_template.pdf"


def _draw():
    return ImageDraw.Draw(Image.new("RGB", (10, 10)))


def test_shape_joins_arabic_letters():
    from PIL import features

    word = "محمد"
    assert features.check("raqm") or shape(word) != word


def test_fit_text_shrinks_before_wrapping():
    name = "Mohammed Albaqir Ali Hattab Al"  # 30 chars
    font, lines = fit_text(_draw(), name, ARABIC_FONT, 60, 20, 400, 3)
    assert len(lines) == 1
    assert font.size < 60
    assert text_width(_draw(), lines[0], font) <= 400


def test_fit_text_keeps_size_when_it_fits():
    font, lines = fit_text(_draw(), "Ali", ARABIC_FONT, 60, 20, 400, 3)
    assert font.size == 60 and lines == ["Ali"]


def test_fit_text_wraps_long_title_within_box():
    title = ("تطبيقات الذكاء الاصطناعي التوليدي في تحسين جودة التعليم العالي "
             "وأثرها على مخرجات التعلم في الجامعات العراقية دراسة تحليلية مقارنة "
             "بين الجامعات الحكومية والأهلية خلال الأعوام الدراسية الأخيرة")
    assert len(title) >= 180
    font, lines = fit_text(_draw(), title, ARABIC_FONT, 40, 28, 900, 3)
    assert 1 < len(lines) <= 3
    for line in lines:
        assert text_width(_draw(), line, font) <= 900
    assert " ".join(lines).replace("…", "").split()[0] == title.split()[0]


def test_fit_text_ellipsis_when_exceeding_max_lines():
    text = "كلمة " * 200
    font, lines = fit_text(_draw(), text, ARABIC_FONT, 40, 30, 500, 2)
    assert len(lines) == 2
    assert lines[-1].endswith("…")
    assert text_width(_draw(), lines[-1], font) <= 500


def test_fit_text_breaks_single_overlong_word():
    font, lines = fit_text(_draw(), "A" * 300, ARABIC_FONT, 40, 30, 300, 3)
    for line in lines:
        assert text_width(_draw(), line, font) <= 300


def _ink_bbox(img):
    return Image.eval(img.convert("L"), lambda p: 255 if p < 200 else 0).getbbox()


NAME_LAYOUT = {
    "fields": {
        "full_name": {
            "text": "{full_name}", "x": 800, "y": 550, "anchor": "ms",
            "font": ARABIC_FONT, "font_ar": ARABIC_FONT,
            "size": 64, "min_size": 28, "max_width": 1000, "max_lines": 2,
            "color": "#14234B",
        }
    }
}


def test_render_long_arabic_name_stays_in_bounds():
    forma = Image.new("RGB", (1600, 1100), "white")
    img = render(forma, NAME_LAYOUT, {"full_name": "عبد " * 30})
    left, top, right, bottom = _ink_bbox(img)
    assert left >= 800 - 500 - 2 and right <= 800 + 500 + 2
    assert top > 300 and bottom < 800


def test_render_mixed_script_name():
    forma = Image.new("RGB", (1600, 1100), "white")
    img = render(forma, NAME_LAYOUT, {"full_name": "محمد Ali الباقر"})
    assert _ink_bbox(img) is not None


def test_render_missing_value_leaves_forma_untouched():
    forma = Image.new("RGB", (400, 300), "white")
    img = render(forma, NAME_LAYOUT, {})
    assert _ink_bbox(img) is None


def test_render_scales_reference_size():
    layout = {"reference_size": [800, 550], **NAME_LAYOUT}
    layout["fields"] = {"n": {**NAME_LAYOUT["fields"]["full_name"], "text": "{n}",
                              "x": 400, "y": 275, "max_width": 500}}
    img = render(Image.new("RGB", (1600, 1100), "white"), layout, {"n": "Ali Hasan"})
    left, _, right, _ = _ink_bbox(img)
    assert (left + right) / 2 == pytest_approx(800, 12)


def pytest_approx(v, tol):
    import pytest
    return pytest.approx(v, abs=tol)


def test_forma_from_pdf_returns_image():
    with open(FIXTURE_PDF, "rb") as f:
        img = forma_from_upload(f.read(), "application/pdf")
    assert img.width > 100 and img.height > 100
    assert max(img.size) <= 3000


def test_forma_from_png_caps_longest_side():
    import io
    buf = io.BytesIO()
    Image.new("RGB", (6000, 3000), "white").save(buf, "PNG")
    img = forma_from_upload(buf.getvalue(), "image/png")
    assert max(img.size) == 3000


def test_forma_from_upload_rejects_unknown_type():
    import pytest
    with pytest.raises(ValueError):
        forma_from_upload(b"x", "text/html")


def test_outputs_are_png_and_pdf():
    img = Image.new("RGB", (100, 80), "white")
    assert to_png(img)[:8] == b"\x89PNG\r\n\x1a\n"
    assert to_pdf(img)[:5] == b"%PDF-"


def test_font_path_resolves_bundled_font():
    assert font_path(ARABIC_FONT).endswith(ARABIC_FONT)
