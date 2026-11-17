"""Runs a real HTTP server around the Vercel handler class to check the plumbing."""
import threading
from http.server import ThreadingHTTPServer

import requests

from engine.handlers import handle_deliver
from engine.vercel import make_handler


def _serve():
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(handle_deliver))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def test_handler_class_returns_401_without_secret(monkeypatch):
    monkeypatch.setenv("DELIVERY_SECRET", "real-secret")
    server, url = _serve()
    try:
        res = requests.post(url, headers={"Authorization": "Bearer wrong"}, timeout=5)
        assert res.status_code == 401 and res.json() == {"error": "unauthorized"}
    finally:
        server.shutdown()


def test_handler_class_hides_internal_errors(monkeypatch):
    monkeypatch.setenv("DELIVERY_SECRET", "real-secret")
    monkeypatch.setenv("SUPABASE_URL", "http://127.0.0.1:9")  # nothing listens here
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("MAIL_FROM", "Conf <a@b.org>")
    server, url = _serve()
    try:
        res = requests.post(url, headers={"Authorization": "Bearer real-secret"}, timeout=40)
        assert res.status_code == 500 and res.json() == {"error": "server error"}
    finally:
        server.shutdown()


def test_deps_reuse_the_site_supabase_settings(monkeypatch):
    from engine.vercel import deps_from_env
    for name in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SITE_URL"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("VITE_SUPABASE_URL", "https://x.supabase.co")
    d = deps_from_env()
    assert d["supa"].url == "https://x.supabase.co"


def test_site_url_defaults_to_live_site(monkeypatch):
    from engine.jobs import _site_url
    monkeypatch.delenv("SITE_URL", raising=False)
    assert _site_url() == "https://al-farabi-gilt.vercel.app"
