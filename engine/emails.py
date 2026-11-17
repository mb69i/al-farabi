"""Bilingual email texts for cards and certificates. Every value is HTML-escaped."""
from __future__ import annotations

from html import escape

SUBJECTS = {
    ("card", "ar"): "بطاقة حضورك — مؤتمر الفارابي",
    ("card", "en"): "Your attendee card — Al-Farabi Conference",
    ("certificate", "ar"): "شهادة المشاركة — مؤتمر الفارابي",
    ("certificate", "en"): "Your participation certificate — Al-Farabi Conference",
}

BODIES = {
    ("card", "ar"): [
        "عزيزنا {full_name}،",
        "شكراً لحضورك مؤتمر الفارابي للبحوث التطبيقية في التحول الرقمي الشامل.",
        "تجد في المرفقات بطاقة حضورك الرسمية. الرقم المرجعي: {serial}",
    ],
    ("card", "en"): [
        "Dear {full_name},",
        "Thank you for attending the Al-Farabi Conference on Applied Research in Comprehensive Digital Transformation.",
        "Your official attendee card is attached. Reference: {serial}",
    ],
    ("certificate", "ar"): [
        "الباحث الكريم {full_name}،",
        "يسرّ جامعة الفارابي أن تقدّم لكم شهادة المشاركة في مؤتمر الفارابي للبحوث التطبيقية في التحول الرقمي الشامل",
        "عن بحثكم الموسوم: «{research_title}».",
        "تجدون الشهادة في المرفقات بصيغتي PDF وصورة.",
    ],
    ("certificate", "en"): [
        "Dear {full_name},",
        "Al-Farabi University is pleased to present your certificate of participation in the Al-Farabi Conference on Applied Research in Comprehensive Digital Transformation",
        "for your research: “{research_title}”.",
        "The certificate is attached as a PDF and an image.",
    ],
}

SIGN_OFF = {
    "ar": "اللجنة التنظيمية — جامعة الفارابي، بغداد",
    "en": "Organising Committee — Al-Farabi University, Baghdad",
}


class _Blank(dict):
    def __missing__(self, key):
        return ""


def build(kind: str, lang: str, values: dict, site_url: str) -> tuple[str, str, str]:
    lang = lang if lang in ("ar", "en") else "ar"
    direction = "rtl" if lang == "ar" else "ltr"
    align = "right" if lang == "ar" else "left"
    raw = _Blank({k: str(v) for k, v in (values or {}).items() if v is not None})
    safe = _Blank({k: escape(v) for k, v in raw.items()})
    lines = BODIES[(kind, lang)]
    site = escape(site_url.rstrip("/"))

    text = "\n\n".join(line.format_map(raw) for line in lines) + "\n\n" + SIGN_OFF[lang]
    paragraphs = "".join(
        f'<p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#14234B">{line.format_map(safe)}</p>'
        for line in lines
    )
    html = f"""<!doctype html>
<html lang="{lang}" dir="{direction}"><body style="margin:0;background:#F4F5F8;font-family:Tahoma,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F8;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" dir="{direction}" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden">
<tr><td style="background:#FFFFFF;padding:24px;text-align:center;border-bottom:1px solid #E3E1DA">
<img src="{site}/brand/crest.png" alt="Al-Farabi University" height="64" style="height:64px;margin:0 8px">
</td></tr>
<tr><td style="height:4px;background:#A3262B"></td></tr>
<tr><td style="padding:32px 28px;text-align:{align}">{paragraphs}
<p style="margin:24px 0 0;font-size:14px;color:#5A6378">{escape(SIGN_OFF[lang])}</p>
</td></tr>
</table></td></tr></table></body></html>"""
    return SUBJECTS[(kind, lang)], html, text
