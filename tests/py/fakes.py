"""Test doubles for engine.supa.Supa and engine.mailer.Mailer."""
import io

from PIL import Image

from engine.mailer import MailError

LAYOUT = {"fields": {"full_name": {"text": "{full_name}", "x": 200, "y": 150, "anchor": "ms",
                                   "font": "IBMPlexSansArabic-Bold.ttf", "size": 30,
                                   "min_size": 16, "max_width": 360, "max_lines": 2,
                                   "color": "#14234B"}}}


def png_bytes(w=400, h=300):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "white").save(buf, "PNG")
    return buf.getvalue()


def context(i, kind="card", lang="ar", name="محمد علي"):
    values = {"full_name": name, "event_name": "مؤتمر الفارابي"}
    if kind == "card":
        values["serial"] = f"ALF26-AAAA{i:02d}"
    else:
        values.update(research_title="عنوان البحث", institution="جامعة الفارابي")
    return {"kind": kind, "lang": lang, "to_email": f"p{i}@example.com", "values": values,
            "template": {"forma_path": f"e/{kind}/forma.png", "width": 400, "height": 300,
                         "layout": LAYOUT}}


class FakeSupa:
    def __init__(self, rows):
        self.rows = rows  # list of (delivery_row, context)
        self.calls = []
        self.uploads = {}
        self.downloads = 0
        self.downloaded = []
        self.deleted = []

    def rpc(self, name, args=None):
        self.calls.append((name, args))
        if name == "claim_deliveries":
            return [r for r, _ in self.rows][: args["p_limit"]]
        if name == "delivery_context":
            return next(c for r, c in self.rows if r["id"] == args["p_id"])
        return None

    def download(self, bucket, path):
        self.downloads += 1
        self.downloaded.append((bucket, path))
        if path.endswith(".pdf"):
            return b"%PDF-1.4 pre-made certificate"
        return png_bytes()

    def delete(self, bucket, path):
        self.deleted.append((bucket, path))

    def upload(self, bucket, path, data, content_type):
        self.uploads[(bucket, path)] = (data, content_type)

    def called(self, name):
        return [a for n, a in self.calls if n == name]


class FakeMailer:
    def __init__(self, fail_for=(), ready=True):
        self.ready = ready
        self.fail_for = set(fail_for)
        self.sent = []

    def send(self, to, subject, html, text, attachments, idempotency_key):
        if to in self.fail_for:
            raise MailError("503 provider down")
        self.sent.append(dict(to=to, subject=subject, html=html, text=text,
                              attachments=attachments, key=idempotency_key))
        return f"re_{len(self.sent)}"
