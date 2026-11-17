"""Request handlers for the Vercel functions, kept free of HTTP plumbing for tests.

Each handler takes (headers, body_bytes, deps) and returns (status, headers, body_bytes).
deps: secret, supa, mailer, event_slug, auth(token, allowed) -> who, run(supa, mailer) -> summary
"""
from __future__ import annotations

import hmac
import io
import json

from PIL import Image

from engine.auth import AuthError, bearer
from engine.render import forma_from_upload, render, to_png

JSON = {"Content-Type": "application/json", "Cache-Control": "no-store"}
KINDS = {"card", "certificate"}
STAFF_ROLES = {"admin", "doctor"}
MAX_UPLOAD = 15 * 1024 * 1024


def _json(status: int, data) -> tuple:
    return status, JSON, json.dumps(data, ensure_ascii=False).encode()


def _body(raw: bytes) -> dict:
    data = json.loads(raw or b"{}")
    if not isinstance(data, dict):
        raise ValueError("body must be an object")
    return data


def _guard(headers, deps, allowed):
    try:
        return deps["auth"](bearer(headers), allowed), None
    except AuthError as e:
        return None, _json(e.status, {"error": str(e)})


def handle_deliver(headers, raw, deps):
    secret = deps.get("secret") or ""
    given = bearer(headers)
    if secret:
        ok = hmac.compare_digest(given.encode(), secret.encode())
    else:
        # No secret in the Vercel settings: the database keeps it (vault) and checks it.
        ok = bool(given) and deps["supa"].rpc("delivery_secret_ok", {"p_given": given}) is True
    if not ok:
        return _json(401, {"error": "unauthorized"})
    return _json(200, deps["run"](deps["supa"], deps["mailer"]))


def handle_preview(headers, raw, deps):
    who, denied = _guard(headers, deps, {"admin", "owner"})
    if denied:
        return denied
    try:
        body = _body(raw)
        layout, path = body["layout"], str(body["forma_path"])
        values = {str(k): str(v) for k, v in (body.get("sample_values") or {}).items()}
    except (ValueError, KeyError, TypeError):
        return _json(400, {"error": "bad request"})
    forma = Image.open(io.BytesIO(deps["supa"].download("templates", path))).convert("RGB")
    return 200, {"Content-Type": "image/png", "Cache-Control": "no-store"}, to_png(render(forma, layout, values))


def handle_template(headers, raw, deps):
    who, denied = _guard(headers, deps, {"admin", "owner"})
    if denied:
        return denied
    try:
        body = _body(raw)
        kind, path, ctype = body["kind"], str(body["upload_path"]), str(body["content_type"])
    except (ValueError, KeyError, TypeError):
        return _json(400, {"error": "bad request"})
    if kind not in KINDS or not path.startswith("uploads/") or ".." in path:
        return _json(400, {"error": "bad request"})
    data = deps["supa"].download("templates", path)
    if len(data) > MAX_UPLOAD:
        return _json(413, {"error": "file too large"})
    try:
        img = forma_from_upload(data, ctype)
    except ValueError:
        return _json(400, {"error": "unsupported file type"})
    forma_path = f"{deps['event_slug']}/{kind}/forma.png"
    deps["supa"].upload("templates", forma_path, to_png(img), "image/png")
    return _json(200, {"forma_path": forma_path, "width": img.width, "height": img.height})


def handle_staff(headers, raw, deps):
    who, denied = _guard(headers, deps, {"owner"})
    if denied:
        return denied
    try:
        body = _body(raw)
        email = str(body["email"]).strip().lower()
        role = str(body["role"])
        name = str(body.get("display_name") or "").strip()[:120]
    except (ValueError, KeyError, TypeError):
        return _json(400, {"error": "bad request"})
    if role not in STAFF_ROLES or "@" not in email or len(email) > 254:
        return _json(400, {"error": "bad request"})
    user_id = deps["supa"].invite_user(email)
    deps["supa"].rpc("service_add_staff", {
        "p_user_id": user_id, "p_email": email, "p_role": role,
        "p_display_name": name, "p_created_by": who["user_id"]})
    return _json(200, {"user_id": user_id, "email": email, "role": role})
