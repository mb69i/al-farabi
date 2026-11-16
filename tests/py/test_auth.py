import pytest

from engine.auth import AuthError, require_role


class Res:
    def __init__(self, status, body=None):
        self.status_code, self._b = status, body

    def json(self):
        return self._b


class Http:
    def __init__(self, user_status=200, who=None):
        self.user_status, self.who, self.calls = user_status, who, []

    def get(self, url, headers=None, timeout=None):
        self.calls.append(("GET", url, headers))
        return Res(self.user_status, {"id": "u1"})

    def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append(("POST", url, headers))
        return Res(200, self.who)


def _call(http, token="tok", allowed=frozenset({"owner"})):
    return require_role(token, set(allowed), url="https://p.supabase.co", anon_key="anon", http=http)


def test_require_role_rejects_missing_token():
    with pytest.raises(AuthError) as e:
        _call(Http(), token="")
    assert e.value.status == 401


def test_require_role_rejects_invalid_session():
    with pytest.raises(AuthError) as e:
        _call(Http(user_status=401))
    assert e.value.status == 401


def test_require_role_rejects_doctor_for_owner_route():
    with pytest.raises(AuthError) as e:
        _call(Http(who={"role": "doctor", "aal": "aal1", "email": "d@x"}))
    assert e.value.status == 403


def test_require_role_rejects_owner_without_aal2():
    with pytest.raises(AuthError) as e:
        _call(Http(who={"role": "owner", "aal": "aal1", "email": "o@x"}))
    assert e.value.status == 403


def test_require_role_accepts_owner_with_aal2_and_uses_caller_token():
    http = Http(who={"role": "owner", "aal": "aal2", "email": "o@x"})
    who = _call(http)
    assert who["role"] == "owner" and who["user_id"] == "u1"
    assert all(h["Authorization"] == "Bearer tok" for _, _, h in http.calls)


def test_require_role_doctor_route_does_not_need_aal2():
    who = _call(Http(who={"role": "doctor", "aal": "aal1", "email": "d@x"}), allowed={"doctor"})
    assert who["role"] == "doctor"
