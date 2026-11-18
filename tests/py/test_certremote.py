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


def test_make_asks_the_site_function_and_returns_the_path():
    http = Http(Res(200, {"path": "e/certificate/d1.pdf", "serial": "ALF26-AAAA-BBBB-CCCC"}))
    certs = RemoteCertificates("https://site.example/", "test-service-key", http=http)
    assert certs.make("d1") == "e/certificate/d1.pdf"
    url, kw = http.calls[0]
    assert url == "https://site.example/api/certificate"
    assert kw["json"] == {"delivery_id": "d1"}
    assert kw["headers"]["X-Render-Token"] == TOKEN
    assert "test-service-key" not in str(kw)  # the key itself never travels


def test_errors_become_exceptions_with_the_reason():
    certs = RemoteCertificates("https://s", "k", http=Http(Res(422, {"error": "missing name"})))
    with pytest.raises(RuntimeError, match="missing name"):
        certs.make("d1")


def test_not_ready_without_a_key():
    assert RemoteCertificates("https://s", "").ready is False
