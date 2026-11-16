import base64

import pytest

from engine.mailer import Mailer, MailError


class Res:
    def __init__(self, status, body=None):
        self.status_code, self._body, self.text = status, body or {}, "err"

    def json(self):
        return self._body


class Http:
    def __init__(self, res):
        self.res, self.calls = res, []

    def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append((url, json, headers))
        return self.res


def test_send_posts_resend_payload_with_idempotency_key():
    http = Http(Res(200, {"id": "re_1"}))
    out = Mailer("k", "Conf <e@x.org>", http).send("a@b.co", "S", "<p>h</p>", "t",
                                                   [("c.png", b"\x89PNG", "image/png")], "delivery-7")
    url, body, headers = http.calls[0]
    assert out == "re_1" and url == "https://api.resend.com/emails"
    assert headers["Idempotency-Key"] == "delivery-7" and headers["Authorization"] == "Bearer k"
    assert body["to"] == ["a@b.co"] and base64.b64decode(body["attachments"][0]["content"]) == b"\x89PNG"


def test_send_raises_on_provider_error():
    with pytest.raises(MailError):
        Mailer("k", "s", Http(Res(503))).send("a@b.co", "S", "h", "t", [], "delivery-1")
