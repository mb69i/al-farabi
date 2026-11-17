"""Processes queued card/certificate deliveries: render, store, email, mark done.

One bad row never stops the batch: any exception becomes fail_delivery(), which
applies the database's backoff (1, 2, 5, 15, 60 minutes, then 'failed').
"""
from __future__ import annotations

import io
import os
import time

from PIL import Image

from engine.emails import build
from engine.render import render, to_pdf, to_png


def _site_url() -> str:
    return os.environ.get("SITE_URL") or "https://al-farabi-gilt.vercel.app"


def _send_premade(supa, mailer, row: dict, ctx: dict, path: str) -> None:
    """A certificate already drawn by the Chromium engine (certs/) and stored in 'outputs': email it as is."""
    if not path.endswith(".pdf") or ".." in path:
        raise RuntimeError("pre-made certificate must be a PDF in outputs")
    pdf = supa.download("outputs", path)
    if not pdf.startswith(b"%PDF-"):
        raise RuntimeError("pre-made certificate is not a PDF")
    subject, html, text = build(ctx["kind"], ctx["lang"], ctx["values"], _site_url())
    provider_id = mailer.send(ctx["to_email"], subject, html, text,
                              [("al-farabi-certificate.pdf", pdf, "application/pdf")],
                              idempotency_key=f"delivery-{row['id']}-{row.get('resend_count', 0)}")
    supa.rpc("complete_delivery", {"p_id": row["id"], "p_provider_id": provider_id, "p_file_path": path})


def _make_one(supa, mailer, row: dict, formas: dict) -> None:
    ctx = supa.rpc("delivery_context", {"p_id": row["id"]})
    if ctx and ctx.get("kind") == "certificate" and ctx.get("prerendered"):
        return _send_premade(supa, mailer, row, ctx, ctx["prerendered"])
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
                              idempotency_key=f"delivery-{row['id']}-{row.get('resend_count', 0)}")
    file_path = base + (".pdf" if kind == "certificate" else ".png")
    supa.rpc("complete_delivery", {"p_id": row["id"], "p_provider_id": provider_id, "p_file_path": file_path})


def process_batch(supa, mailer, limit: int = 10, before_send=None, formas: dict | None = None) -> dict:
    rows = supa.rpc("claim_deliveries", {"p_limit": limit}) or []
    summary = {"claimed": len(rows), "sent": 0, "failed": 0}
    formas = {} if formas is None else formas
    for row in rows:
        if before_send:
            before_send()
        try:
            _make_one(supa, mailer, row, formas)
            summary["sent"] += 1
        except Exception as exc:  # noqa: BLE001 — every failure must reach fail_delivery
            summary["failed"] += 1
            supa.rpc("fail_delivery", {"p_id": row["id"], "p_error": str(exc)[:500]})
    return summary


def run(supa, mailer, *, clock=time.monotonic, sleep=time.sleep,
        budget: float = 45.0, interval: float = 0.55, batch: int = 5) -> dict:
    """Single runner: drains the queue at <= 1/interval sends per second within budget.

    Another invocation holding the lease means this one exits at once; the
    holder keeps claiming until the queue is empty, so new rows are not missed.
    """
    if not mailer.ready:
        # Leave the queue untouched so no retries are used up before email is set up.
        return {"skipped": "email not configured"}
    if not supa.rpc("acquire_runner", {"p_ttl_seconds": int(budget) + 30}):
        return {"skipped": True}
    total = {"claimed": 0, "sent": 0, "failed": 0}
    start = clock()
    last = [None]
    formas: dict = {}

    def pace():
        if last[0] is not None:
            wait = interval - (clock() - last[0])
            if wait > 0:
                sleep(wait)
        last[0] = clock()

    try:
        while clock() - start < budget:
            remaining = int((budget - (clock() - start)) / interval)
            if remaining < 1:
                break
            out = process_batch(supa, mailer, limit=min(batch, remaining), before_send=pace, formas=formas)
            for k in total:
                total[k] += out[k]
            if out["claimed"] == 0:
                break
    finally:
        supa.rpc("release_runner", {})
    return total
