"""Turns a backup (latest.json) into one SQL file for the Supabase SQL Editor.

    python scripts/restore_sql.py D:\\alfarabi-backups\\latest.json > restore.sql

Run it on a database that already has the schema (supabase/migrations applied in order).
Existing rows are kept (on conflict do nothing), so running it twice is safe.
Doctor links on signatures are not restored (staff accounts are recreated by hand).
"""
from __future__ import annotations

import json
import sys


def q(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


EVENT = "(select id from public.events where slug = {slug})"


def build_restore_sql(data: dict) -> str:
    ev = EVENT.format(slug=q(data["event"]["slug"]))
    out = ["begin;"]
    for g in data.get("guests", []):
        out.append(
            "insert into public.guests (id, event_id, serial, full_name, name_script, phone, email, gender, guest_type, "
            "workplace, specialization, lang, is_vip, created_at) values ("
            + ", ".join([q(g["id"]), ev] + [q(g.get(k)) for k in (
                "serial", "full_name", "name_script", "phone", "email", "gender", "guest_type",
                "workplace", "specialization", "lang", "is_vip", "created_at")])
            + ") on conflict do nothing;")
    for c in data.get("checkins", []):
        out.append(
            "insert into public.guest_checkins (guest_id, day, at) "
            f"select g.id, {q(c['day'])}, {q(c['at'])} from public.guests g where g.serial = {q(c['serial'])} "
            "on conflict do nothing;")
    for r in data.get("researchers", []):
        out.append(
            "insert into public.researchers (id, event_id, name_ar, name_en, email, phone, gender, institution, "
            "research_title, is_vip) values ("
            + ", ".join([q(r["id"]), ev] + [q(r.get(k)) for k in (
                "name_ar", "name_en", "email", "phone", "gender", "institution", "research_title", "is_vip")])
            + ") on conflict do nothing;")
    for s in data.get("signoffs", []):
        out.append(
            "insert into public.researcher_signoffs (researcher_id, day, signed_at, signature_path, strokes_path, "
            "sig_sha256, device) values ("
            + ", ".join(q(s.get(k)) for k in (
                "researcher_id", "day", "signed_at", "signature_path", "strokes_path", "sig_sha256", "device"))
            + ") on conflict do nothing;")
    out.append("commit;")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdout.write(build_restore_sql(json.load(f)))
