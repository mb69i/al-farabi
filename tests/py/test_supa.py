from engine.supa import Supa


def test_new_secret_keys_go_only_in_the_apikey_header():
    h = Supa("https://x.supabase.co", "sb_secret_abc_123")._headers()
    assert h == {"apikey": "sb_secret_abc_123"}


def test_legacy_service_role_jwt_still_sent_as_bearer_too():
    h = Supa("https://x.supabase.co", "eyJhbGciOi.legacy.jwt")._headers()
    assert h["apikey"] == "eyJhbGciOi.legacy.jwt"
    assert h["Authorization"] == "Bearer eyJhbGciOi.legacy.jwt"


class _Res:
    def __init__(self, status):
        self.status_code, self.text = status, ""


class _Http:
    def __init__(self, status=200):
        self.status, self.calls = status, []

    def delete(self, url, headers=None, timeout=None):
        self.calls.append((url, headers))
        return _Res(self.status)


def test_delete_removes_one_stored_file():
    http = _Http()
    Supa("https://x.supabase.co", "sb_secret_k", http=http).delete("outputs", "e/certificate/d1.pdf")
    url, headers = http.calls[0]
    assert url == "https://x.supabase.co/storage/v1/object/outputs/e/certificate/d1.pdf"
    assert headers == {"apikey": "sb_secret_k"}


def test_delete_failure_is_reported():
    import pytest

    from engine.supa import SupaError
    with pytest.raises(SupaError):
        Supa("https://x", "k", http=_Http(500)).delete("outputs", "a.pdf")
