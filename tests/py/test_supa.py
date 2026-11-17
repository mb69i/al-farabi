from engine.supa import Supa


def test_new_secret_keys_go_only_in_the_apikey_header():
    h = Supa("https://x.supabase.co", "sb_secret_abc_123")._headers()
    assert h == {"apikey": "sb_secret_abc_123"}


def test_legacy_service_role_jwt_still_sent_as_bearer_too():
    h = Supa("https://x.supabase.co", "eyJhbGciOi.legacy.jwt")._headers()
    assert h["apikey"] == "eyJhbGciOi.legacy.jwt"
    assert h["Authorization"] == "Bearer eyJhbGciOi.legacy.jwt"
