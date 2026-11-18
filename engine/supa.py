"""Minimal Supabase client for the server side (service role). Never import in the browser."""
from __future__ import annotations

from urllib.parse import quote

import requests


class SupaError(Exception):
    pass


class Supa:
    def __init__(self, url: str, service_key: str, http=requests):
        self.url = url.rstrip("/")
        self.key = service_key
        self.http = http

    def _headers(self, extra: dict | None = None) -> dict:
        h = {"apikey": self.key}
        if not self.key.startswith("sb_"):
            # Legacy service_role JWT. New sb_secret_ keys are not JWTs and Supabase rejects them as Bearer.
            h["Authorization"] = f"Bearer {self.key}"
        h.update(extra or {})
        return h

    def rpc(self, name: str, args: dict | None = None):
        res = self.http.post(f"{self.url}/rest/v1/rpc/{name}", json=args or {},
                             headers=self._headers({"Content-Type": "application/json"}), timeout=30)
        if not 200 <= res.status_code < 300:
            raise SupaError(f"rpc {name}: {res.status_code} {res.text[:300]}")
        return res.json() if res.content else None

    def invite_user(self, email: str) -> str:
        """Sends a Supabase invite email and returns the new user's id."""
        res = self.http.post(f"{self.url}/auth/v1/invite", json={"email": email},
                             headers=self._headers({"Content-Type": "application/json"}), timeout=30)
        if not 200 <= res.status_code < 300:
            raise SupaError(f"invite: {res.status_code} {res.text[:200]}")
        return res.json()["id"]

    def download(self, bucket: str, path: str) -> bytes:
        res = self.http.get(f"{self.url}/storage/v1/object/{bucket}/{quote(path)}",
                            headers=self._headers(), timeout=60)
        if res.status_code != 200:
            raise SupaError(f"download {bucket}/{path}: {res.status_code}")
        return res.content

    def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        res = self.http.post(f"{self.url}/storage/v1/object/{bucket}/{quote(path)}", data=data,
                             headers=self._headers({"Content-Type": content_type, "x-upsert": "true"}),
                             timeout=60)
        if not 200 <= res.status_code < 300:
            raise SupaError(f"upload {bucket}/{path}: {res.status_code} {res.text[:200]}")

    def delete(self, bucket: str, path: str) -> None:
        res = self.http.delete(f"{self.url}/storage/v1/object/{bucket}/{quote(path)}", headers=self._headers(), timeout=30)
        if not 200 <= res.status_code < 300:
            raise SupaError(f"delete {bucket}/{path}: {res.status_code} {res.text[:200]}")
