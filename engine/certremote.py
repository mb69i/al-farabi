"""Asks the site's certificate function (api/certificate.mjs, Chromium) to draw one certificate.

It returns the stored PDF's path in the 'outputs' bucket; the sender then emails that file.
Authenticated with an HMAC of the service key (certs/server.mjs computes the same), so the key never travels.
"""
from __future__ import annotations

import hashlib
import hmac

import requests


def render_token(service_key: str) -> str:
    return hmac.new(service_key.encode(), b"certificate-render-v1", hashlib.sha256).hexdigest()


class RemoteCertificates:
    def __init__(self, site_url: str, service_key: str, http=requests, timeout: float = 25.0):
        self.url = site_url.rstrip("/") + "/api/certificate"
        self.key = service_key
        self.http = http
        self.timeout = timeout

    @property
    def ready(self) -> bool:
        return bool(self.key)

    def make(self, delivery_id: str) -> str:
        res = self.http.post(self.url, json={"delivery_id": delivery_id},
                             headers={"X-Render-Token": render_token(self.key)}, timeout=self.timeout)
        try:
            data = res.json()
        except ValueError:
            data = {}
        if res.status_code != 200 or not isinstance(data, dict) or not data.get("path"):
            reason = data.get("error") if isinstance(data, dict) else None
            raise RuntimeError(f"certificate function {res.status_code}: {reason or res.text[:200]}")
        return data["path"]
