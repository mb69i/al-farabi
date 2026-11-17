import csv
import hashlib
import json

import pytest

from scripts.backup import BackupError, fetch_export, make_token, token_hash, write_backup

SAMPLE = {
    "exported_at": "2026-11-21T09:00:00+00:00",
    "event": {"slug": "alfarabi-conf-2026"},
    "guests": [
        {"serial": "ALF26-AAAA22", "full_name": "محمد علي", "phone": "+9647701234567", "email": "m@x.org",
         "gender": "male", "guest_type": "visitor", "workplace": "UoB", "created_at": "2026-11-21T08:00:00+00:00"},
    ],
    "checkins": [{"serial": "ALF26-AAAA22", "day": "2026-11-21", "at": "2026-11-21T08:00:00+00:00"}],
    "researchers": [{"name_ar": "أحمد", "email": "a@x.org", "research_title": "T"}],
    "signoffs": [],
    "deliveries": [],
}


def test_token_is_long_random_and_hash_is_sha256():
    a, b = make_token(), make_token()
    assert a != b and len(a) >= 40
    assert token_hash(a) == hashlib.sha256(a.encode()).hexdigest()


def test_write_backup_creates_json_latest_and_excel_friendly_csv(tmp_path):
    out = write_backup(SAMPLE, tmp_path, stamp="20261121-120000", keep=10)
    assert out.name == "backup-20261121-120000.json"
    assert json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))["guests"][0]["full_name"] == "محمد علي"
    raw = (tmp_path / "latest-guests.csv").read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf")  # BOM so Excel shows Arabic correctly
    rows = list(csv.DictReader(raw.decode("utf-8-sig").splitlines()))
    assert rows[0]["full_name"] == "محمد علي" and rows[0]["phone"] == "+9647701234567"
    assert (tmp_path / "latest-researchers.csv").exists()
    status = (tmp_path / "status.txt").read_text(encoding="utf-8")
    assert "guests: 1" in status and "researchers: 1" in status


def test_write_backup_keeps_only_the_newest(tmp_path):
    for i in range(5):
        write_backup(SAMPLE, tmp_path, stamp=f"20261121-12000{i}", keep=3)
    kept = sorted(p.name for p in tmp_path.glob("backup-*.json"))
    assert kept == ["backup-20261121-120002.json", "backup-20261121-120003.json", "backup-20261121-120004.json"]


def test_write_backup_refuses_an_empty_or_broken_export(tmp_path):
    write_backup(SAMPLE, tmp_path, stamp="20261121-120000", keep=10)
    with pytest.raises(BackupError):
        write_backup({"guests": None}, tmp_path, stamp="20261121-120500", keep=10)
    # the previous good copy is untouched
    assert json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))["guests"]


class Res:
    def __init__(self, status, body):
        self.status_code, self._body, self.text = status, body, json.dumps(body)

    def json(self):
        return self._body


class Http:
    def __init__(self, res):
        self.res, self.calls = res, []

    def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append((url, json, headers))
        return self.res


def test_fetch_export_calls_backup_rpc_with_token():
    http = Http(Res(200, SAMPLE))
    data = fetch_export("https://p.supabase.co", "pub-key", "tok", http=http)
    url, body, headers = http.calls[0]
    assert url == "https://p.supabase.co/rest/v1/rpc/backup_export"
    assert body == {"p_token": "tok"} and headers["apikey"] == "pub-key"
    assert data["guests"][0]["serial"] == "ALF26-AAAA22"


def test_fetch_export_raises_on_refusal():
    with pytest.raises(BackupError):
        fetch_export("https://p.supabase.co", "pub-key", "bad", http=Http(Res(403, {"message": "not allowed"})))
