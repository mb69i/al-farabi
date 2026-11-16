"""Checks a staff member's Supabase session for a server function.

Admin and owner must have passed the authenticator step (aal2). The session is
checked with /auth/v1/user (rejects signed-out sessions) and the role comes
from the whoami() RPC called with the caller's own token.
"""
from __future__ import annotations

import requests

STRONG_ROLES = {"admin", "owner"}


class AuthError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def bearer(headers: dict) -> str:
    value = headers.get("authorization") or headers.get("Authorization") or ""
    return value[7:].strip() if value.lower().startswith("bearer ") else ""


def require_role(token: str, allowed: set[str], url: str, anon_key: str, http=requests) -> dict:
    if not token:
        raise AuthError(401, "not signed in")
    headers = {"apikey": anon_key, "Authorization": f"Bearer {token}"}
    base = url.rstrip("/")

    user = http.get(f"{base}/auth/v1/user", headers=headers, timeout=15)
    if user.status_code != 200:
        raise AuthError(401, "session expired")

    who = http.post(f"{base}/rest/v1/rpc/whoami", json={},
                    headers={**headers, "Content-Type": "application/json"}, timeout=15)
    info = who.json() if who.status_code == 200 else None
    role = (info or {}).get("role")
    if role not in allowed:
        raise AuthError(403, "not allowed")
    if role in STRONG_ROLES and info.get("aal") != "aal2":
        raise AuthError(403, "authenticator code required")
    return {**info, "user_id": user.json().get("id")}
