import pytest

from engine.emails import build


def test_build_escapes_html_in_name():
    _, html, _ = build("card", "en", {"full_name": "<script>x</script>", "serial": "S"}, "https://s")
    assert "<script>" not in html and "&lt;script&gt;" in html


def test_build_ar_is_rtl():
    _, html, _ = build("card", "ar", {"full_name": "علي", "serial": "S"}, "https://s")
    assert 'dir="rtl"' in html


def test_build_en_is_ltr():
    _, html, _ = build("certificate", "en", {"full_name": "Ali", "research_title": "T"}, "https://s")
    assert 'dir="ltr"' in html


@pytest.mark.parametrize("kind,lang,subject", [
    ("card", "ar", "بطاقة حضورك — مؤتمر الفارابي"),
    ("card", "en", "Your attendee card — Al-Farabi Conference"),
    ("certificate", "ar", "شهادة المشاركة — مؤتمر الفارابي"),
    ("certificate", "en", "Your participation certificate — Al-Farabi Conference"),
])
def test_subjects(kind, lang, subject):
    assert build(kind, lang, {"full_name": "A"}, "https://s")[0] == subject


def test_certificate_mentions_research_title_and_text_part():
    _, html, text = build("certificate", "en", {"full_name": "Ali", "research_title": "Smart Grids"}, "https://s")
    assert "Smart Grids" in html and "Smart Grids" in text


def test_logos_use_absolute_site_urls():
    _, html, _ = build("card", "en", {"full_name": "A", "serial": "S"}, "https://conf.example")
    assert 'src="https://conf.example/brand/' in html


def test_unknown_lang_falls_back_to_arabic():
    assert build("card", "fr", {"full_name": "A"}, "https://s")[0].startswith("بطاقة")


@pytest.mark.parametrize("lang", ["ar", "en"])
def test_attendee_certificate_does_not_talk_about_research(lang):
    _, html, text = build("certificate", lang, {"full_name": "Ali"}, "https://s")
    assert "«" not in text and "“" not in text and "بحثكم" not in text and "research:" not in text
    assert "Ali" in text and "PDF" in text
