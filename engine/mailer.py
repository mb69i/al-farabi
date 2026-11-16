"""Resend email client. Idempotency keys stop a retried job from double-sending."""
from __future__ import annotations

import base64

import requests

RESEND_URL = "https://api.resend.com/emails"


class MailError(Exception):
    pass


class Mailer:
    def __init__(self, api_key: str, sender: str, http=requests):
        self.api_key = api_key
        self.sender = sender
        self.http = http

    def send(self, to: str, subject: str, html: str, text: str,
             attachments: list[tuple[str, bytes, str]], idempotency_key: str) -> str:
        payload = {
            "from": self.sender,
            "to": [to],
            "subject": subject,
            "html": html,
            "text": text,
            "attachments": [
                {"filename": name, "content": base64.b64encode(data).decode("ascii"), "content_type": ctype}
                for name, data, ctype in attachments
            ],
        }
        res = self.http.post(
            RESEND_URL,
            json=payload,
            headers={"Authorization": f"Bearer {self.api_key}", "Idempotency-Key": idempotency_key},
            timeout=30,
        )
        if not 200 <= res.status_code < 300:
            raise MailError(f"{res.status_code} {res.text[:300]}")
        return res.json().get("id", "")
