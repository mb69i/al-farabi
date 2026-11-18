"""Keeps an up-to-date local copy of all registrations on a backup laptop or PC.

Set up from the dashboard (Admin -> Backup devices -> Add device), then on that PC, once:
    python backup.py pair ABCD-EFGH
    -> pairs this PC, takes the first backup and schedules one every 5 minutes (Windows Task Scheduler).
The owner can switch the device off/on or delete it in the dashboard; a switched-off device skips quietly.
Older way (still works): python backup.py init --label laptop-1  (prints one SQL line for the SQL Editor).
Every few minutes (done for you by `pair`):
    python backup.py run

Files land in the backup folder (default D:\\alfarabi-backups):
    backup-YYYYmmdd-HHMMSS.json   full copy, newest N kept
    latest.json                   newest full copy
    latest-guests.csv, latest-researchers.csv, latest-checkins.csv   open directly in Excel
    status.txt                    time of the last good backup and the counts
Uses only the Python standard library plus `requests`.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import secrets
import subprocess
import sys
from datetime import datetime
from pathlib import Path

SUPABASE_URL = "https://kxwimaslalczappzngci.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_w6HsSyij-2N2xwSNwGa84w_mqNcAuIO"  # public by design
DEFAULT_DIR = r"D:\alfarabi-backups"
TASK_NAME = "AlFarabi Backup"
DEFAULT_KEEP = 288  # one day at one copy every 5 minutes
CONFIG = Path(os.environ.get("APPDATA", Path.home())) / "alfarabi-backup" / "config.json"

CSV_COLUMNS = {
    "guests": ["serial", "full_name", "phone", "email", "gender", "guest_type", "workplace", "specialization",
               "lang", "is_vip", "created_at"],
    "researchers": ["name_ar", "name_en", "email", "phone", "gender", "institution", "research_title", "is_vip"],
    "checkins": ["serial", "day", "at"],
}


class BackupError(Exception):
    pass


def make_token() -> str:
    return secrets.token_urlsafe(36)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def default_dir(exists=os.path.exists, home: Path | None = None) -> str:
    """D:\\alfarabi-backups when the PC has a D: drive, else Documents\\alfarabi-backups."""
    if exists("D:\\"):
        return DEFAULT_DIR
    return str((home or Path.home()) / "Documents" / "alfarabi-backups")


def pair_device(url: str, key: str, code: str, token: str, http=None) -> str:
    """Binds this PC to the device the owner added in the dashboard. Sends only the token's SHA-256."""
    if http is None:
        import requests as http  # noqa: N813
    res = http.post(f"{url.rstrip('/')}/rest/v1/rpc/backup_pair",
                    json={"p_code": code, "p_token_hash": token_hash(token)},
                    headers={"apikey": key, "Content-Type": "application/json"}, timeout=60)
    if res.status_code != 200:
        raise BackupError("the pairing code was not accepted (wrong, already used, or older than 30 minutes); "
                          "make a new code in the dashboard")
    return res.json()


def schedule_command(python: str, script: str) -> list[str]:
    return ["schtasks", "/Create", "/SC", "MINUTE", "/MO", "5", "/TN", TASK_NAME,
            "/TR", f'"{python}" "{script}" run', "/F"]


def schedule() -> bool:
    """Windows: run every 5 minutes with this Python and this script. Elsewhere: print how to schedule."""
    if os.name != "nt":
        print(f"Schedule this every 5 minutes (cron): {sys.executable} {Path(__file__).resolve()} run")
        return False
    cmd = schedule_command(sys.executable, str(Path(__file__).resolve()))
    done = subprocess.run(cmd, capture_output=True, text=True)
    if done.returncode != 0:
        print(f"Could not schedule automatically ({done.stderr.strip()}). Run this yourself:\n  "
              f"{subprocess.list2cmdline(cmd)}")
        return False
    print(f"Scheduled: a backup every 5 minutes (task '{TASK_NAME}').")
    return True


def fetch_export(url: str, key: str, token: str, http=None) -> dict:
    if http is None:
        import requests as http  # noqa: N813
    res = http.post(f"{url.rstrip('/')}/rest/v1/rpc/backup_export", json={"p_token": token},
                    headers={"apikey": key, "Content-Type": "application/json"}, timeout=60)
    if res.status_code != 200:
        raise BackupError(f"export refused: {res.status_code} {res.text[:200]}")
    return res.json()


def _csv_bytes(rows: list[dict], columns: list[str]) -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow({c: r.get(c, "") for c in columns})
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def _atomic_write(path: Path, data: bytes) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def write_backup(data: dict, out_dir: Path, stamp: str, keep: int = DEFAULT_KEEP) -> Path:
    if not isinstance(data, dict) or not all(isinstance(data.get(k), list) for k in CSV_COLUMNS):
        raise BackupError("export is incomplete; keeping the previous copy")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, ensure_ascii=False, indent=1).encode("utf-8")

    snapshot = out_dir / f"backup-{stamp}.json"
    _atomic_write(snapshot, body)
    _atomic_write(out_dir / "latest.json", body)
    for name, cols in CSV_COLUMNS.items():
        _atomic_write(out_dir / f"latest-{name}.csv", _csv_bytes(data[name], cols))
    counts = "\n".join(f"{k}: {len(data[k])}" for k in ("guests", "checkins", "researchers"))
    _atomic_write(out_dir / "status.txt",
                  f"last good backup: {stamp}\nexported_at (server): {data.get('exported_at')}\n{counts}\n".encode("utf-8"))

    for old in sorted(out_dir.glob("backup-*.json"))[:-keep]:
        old.unlink()
    return snapshot


def cmd_init(args) -> int:
    if CONFIG.exists() and not args.force:
        print(f"Already set up ({CONFIG}). Use --force to make a new token.", file=sys.stderr)
        return 1
    token = make_token()
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps({"label": args.label, "token": token, "out_dir": args.dir}, indent=1), encoding="utf-8")
    print(f"Saved token for '{args.label}' in {CONFIG} (keep this file private).")
    print("Run this ONE line in Supabase -> SQL Editor (it contains only a hash, not the token):\n")
    print(f"insert into public.backup_tokens (label, token_hash) values ('{args.label}', '{token_hash(token)}');")
    return 0


def cmd_run(_args) -> int:
    if not CONFIG.exists():
        print("Not set up. Add this PC in the dashboard (Admin -> Backup devices), then run: "
              "python backup.py pair CODE", file=sys.stderr)
        return 1
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    try:
        data = fetch_export(SUPABASE_URL, PUBLISHABLE_KEY, cfg["token"])
        path = write_backup(data, Path(cfg.get("out_dir") or default_dir()), stamp)
    except BackupError as exc:
        if "paused" in str(exc):
            print(f"{stamp} paused by the owner in the dashboard; skipped (the last copy is kept)")
            return 0
        print(f"{stamp} BACKUP FAILED: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 — log and keep the previous copy
        print(f"{stamp} BACKUP FAILED: {exc}", file=sys.stderr)
        return 1
    print(f"{stamp} ok -> {path} ({len(data['guests'])} guests, {len(data['researchers'])} researchers)")
    return 0


def cmd_pair(args) -> int:
    if CONFIG.exists() and not args.force:
        print(f"This PC is already set up ({CONFIG}). Use --force to pair it again.", file=sys.stderr)
        return 1
    token = make_token()
    try:
        label = pair_device(SUPABASE_URL, PUBLISHABLE_KEY, args.code, token)
    except Exception as exc:  # noqa: BLE001
        print(f"PAIRING FAILED: {exc}", file=sys.stderr)
        return 1
    out_dir = args.dir or default_dir()
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps({"label": label, "token": token, "out_dir": out_dir}, indent=1), encoding="utf-8")
    print(f"Paired as '{label}'. Backups go to {out_dir}")
    rc = cmd_run(args)
    if not args.no_schedule:
        schedule()
    return rc


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("init")
    i.add_argument("--label", required=True)
    i.add_argument("--dir", default=None)
    i.add_argument("--force", action="store_true")
    pr = sub.add_parser("pair", help="pair this PC with a code from the dashboard")
    pr.add_argument("code")
    pr.add_argument("--dir", default=None, help="backup folder (default D:\\alfarabi-backups, else Documents)")
    pr.add_argument("--no-schedule", action="store_true")
    pr.add_argument("--force", action="store_true")
    sub.add_parser("run")
    args = p.parse_args(argv)
    if args.cmd == "init":
        args.dir = args.dir or default_dir()
        return cmd_init(args)
    return cmd_pair(args) if args.cmd == "pair" else cmd_run(args)


if __name__ == "__main__":
    sys.exit(main())
