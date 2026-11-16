import io
import json

from PIL import Image

from engine.auth import AuthError
from engine.handlers import handle_deliver, handle_preview, handle_staff, handle_template
from tests.py.fakes import LAYOUT, FakeMailer, FakeSupa

FIXTURE_PDF = "tests/py/fixtures/test_template.pdf"


def deps(**kw):
    base = {
        "secret": "s3cret",
        "supa": FakeSupa([]),
        "mailer": FakeMailer(),
        "event_slug": "alfarabi-conf-2026",
        "auth": lambda token, allowed: {"role": "admin", "aal": "aal2", "user_id": "u1"},
        "run": lambda supa, mailer: {"claimed": 0, "sent": 0, "failed": 0},
    }
    base.update(kw)
    return base


def deny(token, allowed):
    raise AuthError(403, "forbidden")


def test_deliver_rejects_wrong_secret():
    assert handle_deliver({"authorization": "Bearer nope"}, b"", deps())[0] == 401


def test_deliver_rejects_when_secret_not_configured():
    assert handle_deliver({"authorization": "Bearer "}, b"", deps(secret=""))[0] == 401


def test_deliver_runs_batch_with_right_secret():
    status, _, body = handle_deliver({"authorization": "Bearer s3cret"}, b"",
                                     deps(run=lambda s, m: {"claimed": 2, "sent": 2, "failed": 0}))
    assert status == 200 and json.loads(body)["sent"] == 2


def test_preview_requires_admin():
    assert handle_preview({"authorization": "Bearer t"}, b"{}", deps(auth=deny))[0] == 403


def test_preview_returns_png():
    body = json.dumps({"kind": "card", "layout": LAYOUT, "forma_path": "x/card/forma.png",
                       "sample_values": {"full_name": "علي"}}).encode()
    status, headers, out = handle_preview({"authorization": "Bearer t"}, body, deps())
    assert status == 200 and headers["Content-Type"] == "image/png" and out[:4] == b"\x89PNG"


def test_preview_rejects_bad_json():
    assert handle_preview({"authorization": "Bearer t"}, b"{not json", deps())[0] == 400


class PdfSupa(FakeSupa):
    def download(self, bucket, path):
        with open(FIXTURE_PDF, "rb") as f:
            return f.read()


def test_template_converts_pdf_and_returns_size():
    supa = PdfSupa([])
    body = json.dumps({"kind": "certificate", "upload_path": "uploads/abc.pdf",
                       "content_type": "application/pdf"}).encode()
    status, _, out = handle_template({"authorization": "Bearer t"}, body, deps(supa=supa))
    res = json.loads(out)
    assert status == 200
    assert res["forma_path"] == "alfarabi-conf-2026/certificate/forma.png"
    data, ctype = supa.uploads[("templates", res["forma_path"])]
    img = Image.open(io.BytesIO(data))
    assert ctype == "image/png" and (img.width, img.height) == (res["width"], res["height"])


def test_template_rejects_path_outside_uploads():
    body = json.dumps({"kind": "card", "upload_path": "../x.png", "content_type": "image/png"}).encode()
    assert handle_template({"authorization": "Bearer t"}, body, deps())[0] == 400


def test_template_rejects_unknown_kind():
    body = json.dumps({"kind": "vip", "upload_path": "uploads/a.png", "content_type": "image/png"}).encode()
    assert handle_template({"authorization": "Bearer t"}, body, deps())[0] == 400


class InviteSupa(FakeSupa):
    def invite_user(self, email):
        self.calls.append(("invite_user", email))
        return "new-user-id"


def owner(token, allowed):
    assert allowed == {"owner"}
    return {"role": "owner", "aal": "aal2", "user_id": "owner-id"}


def test_staff_invite_requires_owner():
    body = json.dumps({"email": "d@x.org", "role": "doctor", "display_name": "Dr A"}).encode()
    assert handle_staff({"authorization": "Bearer t"}, body, deps(auth=deny))[0] == 403


def test_staff_invite_creates_user_and_staff_row():
    supa = InviteSupa([])
    body = json.dumps({"email": " D@X.org ", "role": "doctor", "display_name": "Dr A"}).encode()
    status, _, _ = handle_staff({"authorization": "Bearer t"}, body, deps(supa=supa, auth=owner))
    assert status == 200
    assert ("invite_user", "d@x.org") in supa.calls
    assert supa.called("service_add_staff") == [{
        "p_user_id": "new-user-id", "p_email": "d@x.org", "p_role": "doctor",
        "p_display_name": "Dr A", "p_created_by": "owner-id"}]


def test_staff_invite_cannot_create_owner():
    body = json.dumps({"email": "x@x.org", "role": "owner", "display_name": "X"}).encode()
    status = handle_staff({"authorization": "Bearer t"}, body, deps(supa=InviteSupa([]), auth=owner))[0]
    assert status == 400
