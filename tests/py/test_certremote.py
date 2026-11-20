import pytest

from engine.certremote import RemoteCertificates, render_token

TOKEN = "f2206785ce5cb9e4d3fc7033f96caf11712dd0f1141f34c53c2eb9120fef9a10"  # same vector as certs/server.test.ts


class Res:
    def __init__(self, status, data):
        self.status_code, self._data, self.text = status, data, str(data)

    def json(self):
        return self._data


class Http:
    def __init__(self, res):
        self.res, self.calls = res, []

    def post(self, url, **kw):
        self.calls.append((url, kw))
        return self.res


def test_token_matches_the_node_function():
    assert render_token("test-service-key") == TOKEN


def test_make_asks_the_site_function_and_returns_the_pdf_itself():
    import base64
    pdf = b"%PDF-1.4 certificate"
    http = Http(Res(200, {"serial": "ALF26-AAAA-BBBB-CCCC", "pdf": base64.b64encode(pdf).decode()}))
    certs = RemoteCertificates("https://site.example/", "test-service-key", http=http)
    assert certs.make("d1") == pdf  # straight back: nothing stored in Supabase
    url, kw = http.calls[0]
    assert url == "https://site.example/api/certificate"
    assert kw["json"] == {"delivery_id": "d1"}
    assert kw["headers"]["X-Render-Token"] == TOKEN
    assert "test-service-key" not in str(kw)  # the key itself never travels


def test_an_answer_without_a_pdf_is_an_error():
    certs = RemoteCertificates("https://s", "k", http=Http(Res(200, {"serial": "x", "pdf": "bm90IGEgcGRm"})))
    with pytest.raises(RuntimeError, match="PDF"):
        certs.make("d1")


def test_errors_become_exceptions_with_the_reason():
    certs = RemoteCertificates("https://s", "k", http=Http(Res(422, {"error": "missing name"})))
    with pytest.raises(RuntimeError, match="missing name"):
        certs.make("d1")


def test_not_ready_without_a_key():
    assert RemoteCertificates("https://s", "").ready is False


def test_make_card_asks_for_the_researcher_card_and_returns_the_png():
    import base64
    png = b"\x89PNG\r\n\x1a\n card"
    http = Http(Res(200, {"png": base64.b64encode(png).decode()}))
    certs = RemoteCertificates("https://site.example", "test-service-key", http=http)
    assert certs.make_card("d9") == png
    url, kw = http.calls[0]
    assert url == "https://site.example/api/certificate"
    assert kw["json"] == {"delivery_id": "d9", "kind": "card"}


def test_a_card_answer_that_is_not_a_png_is_an_error():
    certs = RemoteCertificates("https://s", "k", http=Http(Res(200, {"png": "bm90IGEgcG5n"})))
    with pytest.raises(RuntimeError, match="PNG"):
        certs.make_card("d1")
    certs = RemoteCertificates("https://s", "k", http=Http(Res(422, {"error": "missing research title"})))
    with pytest.raises(RuntimeError, match="missing research title"):
        certs.make_card("d1")
