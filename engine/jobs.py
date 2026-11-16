"""Processes queued card/certificate deliveries: render, store, email, mark done.

One bad row never stops the batch: any exception becomes fail_delivery(), which
applies the database's backoff (1, 2, 5, 15, 60 minutes, then 'failed').
"""
from __future__ import annotations

import io
import os

from PIL import Image

from engine.emails import build
from engine.render import render, to_pdf, to_png


def _site_url() -> str:
    return os.environ.get("SITE_URL", "")


def _make_one(supa, mailer, row: dict, formas: dict) -> None:
    ctx = supa.rpc("delivery_context", {"p_id": row["id"]})
    tpl = (ctx or {}).get("template")
    if not tpl or not tpl.get("forma_path"):
        raise RuntimeError("template missing")

    path = tpl["forma_path"]
    if path not in formas:
        formas[path] = Image.open(io.BytesIO(supa.download("templates", path))).convert("RGB")
    img = render(formas[path], tpl["layout"], ctx["values"])

    kind = ctx["kind"]
    base = f"{row['event_id']}/{kind}/{row['id']}"
    png = to_png(img)
    attachments = []
    if kind == "certificate":
        pdf = to_pdf(img)
        supa.upload("outputs", base + ".pdf", pdf, "application/pdf")
        attachments.append(("al-farabi-certificate.pdf", pdf, "application/pdf"))
    supa.upload("outputs", base + ".png", png, "image/png")
    attachments.append((f"al-farabi-{kind}.png", png, "image/png"))

    subject, html, text = build(kind, ctx["lang"], ctx["values"], _site_url())
    provider_id = mailer.send(ctx["to_email"], subject, html, text, attachments,
                              idempotency_key=f"delivery-{row['id']}")
    file_path = base + (".pdf" if kind == "certificate" else ".png")
    supa.rpc("complete_delivery", {"p_id": row["id"], "p_provider_id": provider_id, "p_file_path": file_path})


def process_batch(supa, mailer, limit: int = 10) -> dict:
    rows = supa.rpc("claim_deliveries", {"p_limit": limit}) or []
    summary = {"claimed": len(rows), "sent": 0, "failed": 0}
    formas: dict = {}
    for row in rows:
        try:
            _make_one(supa, mailer, row, formas)
            summary["sent"] += 1
        except Exception as exc:  # noqa: BLE001 — every failure must reach fail_delivery
            summary["failed"] += 1
            supa.rpc("fail_delivery", {"p_id": row["id"], "p_error": str(exc)[:500]})
    return summary
