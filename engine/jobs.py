"""Processes queued card/certificate deliveries: render, store, email, mark done.

One bad row never stops the batch: any exception becomes fail_delivery(), which
applies the database's backoff (1, 2, 5, 15, 60 minutes, then 'failed').
"""
from __future__ import annotations

import io
import os
import time
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

from engine.emails import build
from engine.render import render, to_pdf, to_png


def _site_url() -> str:
    return os.environ.get("SITE_URL") or "https://al-farabi-gilt.vercel.app"


def _send_pdf(supa, mailer, row: dict, ctx: dict, pdf: bytes, file_path: str | None) -> None:
    if not pdf.startswith(b"%PDF-"):
        raise RuntimeError("certificate is not a PDF")
    subject, html, text = build(ctx["kind"], ctx["lang"], ctx["values"], _site_url())
    provider_id = mailer.send(ctx["to_email"], subject, html, text,
                              [("al-farabi-certificate.pdf", pdf, "application/pdf")],
                              idempotency_key=f"delivery-{row['id']}-{row.get('resend_count', 0)}")
    supa.rpc("complete_delivery", {"p_id": row["id"], "p_provider_id": provider_id, "p_file_path": file_path})


def _send_premade(supa, mailer, row: dict, ctx: dict, path: str) -> None:
    """A certificate made by hand on the laptop (certs/render-one.ts) and put in 'outputs': email it as is."""
    if not path.endswith(".pdf") or ".." in path:
        raise RuntimeError("pre-made certificate must be a PDF in outputs")
    _send_pdf(supa, mailer, row, ctx, supa.download("outputs", path), path)


def _is_researcher_card(ctx) -> bool:
    return bool(ctx) and ctx.get("kind") == "card" and ctx.get("role") == "researcher"


def _needs_drawing(ctx) -> bool:
    return bool(ctx) and (_is_researcher_card(ctx) or (ctx.get("kind") == "certificate" and not ctx.get("prerendered")))


def _draw_all(certs, rows: list, contexts: dict) -> dict:
    """Draws every new certificate of the batch at the same time (each is its own serverless call).
    Returns {delivery_id: PDF bytes or the exception}."""
    ids = [r["id"] for r in rows if _needs_drawing(contexts.get(r["id"]))]
    if not ids or certs is None or not getattr(certs, "ready", False):
        return {}

    def draw(delivery_id):
        try:
            if _is_researcher_card(contexts.get(delivery_id)):
                return certs.make_card(delivery_id)
            return certs.make(delivery_id)
        except Exception as exc:  # noqa: BLE001 — reported for that row only
            return exc

    with ThreadPoolExecutor(max_workers=len(ids)) as pool:  # the whole batch at once
        return dict(zip(ids, pool.map(draw, ids)))


def _make_one(supa, mailer, row: dict, formas: dict, certs=None, ctx=None, drawn=None) -> None:
    if ctx is None:
        ctx = supa.rpc("delivery_context", {"p_id": row["id"]})
    if _is_researcher_card(ctx):
        # Researcher attendance card (owner, 20 Nov): drawn by the site function when the doctor signs, emailed
        # as a PNG, never stored. Guests' cards (if ever switched on) still use the Pillow design below.
        if drawn is None:
            if certs is None or not getattr(certs, "ready", False):
                raise RuntimeError("certificate renderer not configured")
            drawn = certs.make_card(row["id"])
        if isinstance(drawn, Exception):
            raise drawn
        if not drawn.startswith(b"\x89PNG"):
            raise RuntimeError("researcher card is not a PNG")
        subject, html, text = build("researcher_card", ctx["lang"], ctx["values"], _site_url())
        provider_id = mailer.send(ctx["to_email"], subject, html, text,
                                  [("al-farabi-attendance-card.png", drawn, "image/png")],
                                  idempotency_key=f"delivery-{row['id']}-{row.get('resend_count', 0)}")
        supa.rpc("complete_delivery", {"p_id": row["id"], "p_provider_id": provider_id, "p_file_path": None})
        return
    if ctx and ctx.get("kind") == "certificate":
        # Certificates are drawn on the owner's forma by the site's Chromium function (api/certificate.mjs),
        # unless one was already made (prerendered).
        path = ctx.get("prerendered")
        if path:
            return _send_premade(supa, mailer, row, ctx, path)
        if drawn is None:
            if certs is None or not getattr(certs, "ready", False):
                raise RuntimeError("certificate renderer not configured")
            drawn = certs.make(row["id"])
        if isinstance(drawn, Exception):
            raise drawn
        # drawn by the site function and emailed straight away: never stored in Supabase (owner, 18 Nov)
        return _send_pdf(supa, mailer, row, ctx, drawn, None)
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


def process_batch(supa, mailer, limit: int = 10, before_send=None, formas: dict | None = None, certs=None) -> dict:
    rows = supa.rpc("claim_deliveries", {"p_limit": limit}) or []
    summary = {"claimed": len(rows), "sent": 0, "failed": 0}
    formas = {} if formas is None else formas
    contexts = {}
    for row in rows:
        try:
            contexts[row["id"]] = supa.rpc("delivery_context", {"p_id": row["id"]})
        except Exception:  # noqa: BLE001 — _make_one asks again and reports the failure
            pass
    drawn = _draw_all(certs, rows, contexts)  # all new certificates of the batch in parallel
    for row in rows:
        if before_send:
            before_send()
        try:
            _make_one(supa, mailer, row, formas, certs, ctx=contexts.get(row["id"]), drawn=drawn.get(row["id"]))
            summary["sent"] += 1
        except Exception as exc:  # noqa: BLE001 — every failure must reach fail_delivery
            summary["failed"] += 1
            supa.rpc("fail_delivery", {"p_id": row["id"], "p_error": str(exc)[:500]})
    return summary


SLOTS = 6  # senders allowed at once; must match public.acquire_runner_slot's table (runner_slots)


def run(supa, mailer, *, certs=None, clock=time.monotonic, sleep=time.sleep,
        budget: float = 20.0, interval: float = 1.0, batch: int = 6) -> dict:
    """One of up to SLOTS senders: drains the queue at <= 1/interval sends per second within budget.

    500 guests registering at once (load test, 20 Nov): one sender drawing 3 at a time managed only
    3-7 certificates a minute. Now each invocation takes a free slot (none free: it exits at once),
    six rows per claim are all drawn at the same time, and up to SLOTS senders run side by side.
    Limits: 6 senders x 1 send/s stays under Resend's 10/s; a round (drawing <= 25 s, then 6 sends)
    started before the 20 s budget ends inside the function's 60 s limit.
    """
    if not mailer.ready:
        # Leave the queue untouched so no retries are used up before email is set up.
        return {"skipped": "email not configured"}
    slot = supa.rpc("acquire_runner_slot", {"p_ttl_seconds": int(budget) + 25 + int(batch * interval) + 20,
                                            "p_slots": SLOTS})
    if not slot:
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
            out = process_batch(supa, mailer, limit=min(batch, remaining), before_send=pace, formas=formas, certs=certs)
            for k in total:
                total[k] += out[k]
            if out["claimed"] == 0:
                break
    finally:
        supa.rpc("release_runner_slot", {"p_slot": slot})
    return total
