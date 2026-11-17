from scripts.restore_sql import build_restore_sql

DATA = {
    "event": {"slug": "alfarabi-conf-2026"},
    "guests": [{"id": "11111111-1111-1111-1111-111111111111", "serial": "ALF26-AAAA22", "full_name": "O'Brien محمد",
                "name_script": "mixed", "phone": "+9647701234567", "email": "m@x.org", "gender": "male",
                "guest_type": "visitor", "workplace": "UoB", "specialization": "CS", "lang": "ar",
                "is_vip": False, "created_at": "2026-11-21T08:00:00+00:00"}],
    "checkins": [{"serial": "ALF26-AAAA22", "day": "2026-11-21", "at": "2026-11-21T08:00:00+00:00"}],
    "researchers": [{"id": "22222222-2222-2222-2222-222222222222", "name_ar": "أحمد", "name_en": None, "email": "a@x.org",
                     "phone": None, "gender": None, "institution": None, "research_title": "T", "is_vip": False}],
    "signoffs": [{"researcher_id": "22222222-2222-2222-2222-222222222222", "day": "2026-11-21",
                  "signed_at": "2026-11-21T09:00:00+00:00", "signature_path": "signatures/e/r/1.png",
                  "strokes_path": "signatures/e/r/1.json", "sig_sha256": "a" * 64, "device": "iPad"}],
}


def test_restore_sql_inserts_every_table_in_one_transaction():
    sql = build_restore_sql(DATA)
    assert sql.startswith("begin;") and sql.rstrip().endswith("commit;")
    for table in ("public.guests", "public.guest_checkins", "public.researchers", "public.researcher_signoffs"):
        assert f"insert into {table}" in sql
    assert "on conflict do nothing" in sql


def test_restore_sql_escapes_quotes_and_keeps_arabic():
    sql = build_restore_sql(DATA)
    assert "'O''Brien محمد'" in sql


def test_restore_sql_writes_null_for_missing_values():
    sql = build_restore_sql(DATA)
    assert "'أحمد', null, 'a@x.org'" in sql


def test_restore_sql_links_checkins_by_serial():
    sql = build_restore_sql(DATA)
    assert "from public.guests g where g.serial = 'ALF26-AAAA22'" in sql
