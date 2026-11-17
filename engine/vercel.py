"""Glue between Vercel's Python runtime (BaseHTTPRequestHandler) and engine.handlers."""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler

MAX_BODY = 16 * 1024 * 1024


def deps_from_env() -> dict:
    from engine.auth import require_role
    from engine.jobs import run
    from engine.mailer import Mailer
    from engine.supa import Supa

    # Falls back to the site's own (public) Supabase settings, so only secrets must be added.
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")
    anon = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")
    return {
        "secret": os.environ.get("DELIVERY_SECRET", ""),
        "supa": Supa(url, os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")),
        "mailer": Mailer(os.environ.get("RESEND_API_KEY", ""), os.environ.get("MAIL_FROM", "")),
        "event_slug": os.environ.get("EVENT_SLUG", "alfarabi-conf-2026"),
        "auth": lambda token, allowed: require_role(token, allowed, url=url, anon_key=anon),
        "run": run,
    }


def make_handler(fn):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802 — required name
            length = int(self.headers.get("content-length") or 0)
            if length > MAX_BODY:
                return self._send(413, {"Content-Type": "application/json"}, b'{"error":"too large"}')
            raw = self.rfile.read(length) if length else b""
            headers = {k.lower(): v for k, v in self.headers.items()}
            try:
                status, out_headers, body = fn(headers, raw, deps_from_env())
            except Exception:  # noqa: BLE001 — never leak internals to the caller
                status, out_headers, body = 500, {"Content-Type": "application/json"}, json.dumps(
                    {"error": "server error"}).encode()
            self._send(status, out_headers, body)

        def _send(self, status, headers, body):
            self.send_response(status)
            for k, v in headers.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

    return Handler
