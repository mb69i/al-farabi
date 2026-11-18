from engine.jobs import process_batch
from tests.py.fakes import FakeMailer, FakeSupa, context


def _rows(n, kind="card"):
    return [({"id": f"d{i}", "kind": kind, "event_id": "e"}, context(i, kind)) for i in range(n)]


def test_process_batch_sends_and_completes():
    supa, mailer = FakeSupa(_rows(2)), FakeMailer()
    summary = process_batch(supa, mailer, limit=10)
    assert summary == {"claimed": 2, "sent": 2, "failed": 0}
    done = supa.called("complete_delivery")
    assert [d["p_id"] for d in done] == ["d0", "d1"]
    assert all(d["p_file_path"].startswith("e/card/") for d in done)
    assert ("outputs", "e/card/d0.png") in supa.uploads


def test_mailer_failure_calls_fail_delivery_with_backoff():
    supa, mailer = FakeSupa(_rows(3)), FakeMailer(fail_for={"p1@example.com"})
    summary = process_batch(supa, mailer)
    assert summary == {"claimed": 3, "sent": 2, "failed": 1}
    failed = supa.called("fail_delivery")
    assert failed == [{"p_id": "d1", "p_error": "503 provider down"}]
    assert [d["p_id"] for d in supa.called("complete_delivery")] == ["d0", "d2"]


def test_one_bad_row_does_not_stop_batch():
    rows = _rows(2)
    rows[0][1]["template"] = None  # template missing for the first row
    supa, mailer = FakeSupa(rows), FakeMailer()
    summary = process_batch(supa, mailer)
    assert summary["sent"] == 1 and summary["failed"] == 1
    assert supa.called("fail_delivery")[0]["p_id"] == "d0"


def test_idempotency_key_uses_delivery_id():
    supa, mailer = FakeSupa(_rows(1)), FakeMailer()
    process_batch(supa, mailer)
    assert mailer.sent[0]["key"] == "delivery-d0-0"


def test_certificate_never_uses_an_old_pillow_template():
    # certificates are always drawn on the owner's forma by the site function, even if a Pillow template exists
    class Certs:
        ready = True
        made = []

        def make(self, delivery_id):
            self.made.append(delivery_id)
            return b"%PDF-1.4 drawn"

    certs = Certs()
    supa, mailer = FakeSupa(_rows(1, kind="certificate")), FakeMailer()
    assert process_batch(supa, mailer, certs=certs)["sent"] == 1
    assert certs.made == ["d0"] and supa.uploads == {}
    assert [a[0] for a in mailer.sent[0]["attachments"]] == ["al-farabi-certificate.pdf"]


def test_forma_downloaded_once_per_path_in_a_batch():
    supa, mailer = FakeSupa(_rows(4)), FakeMailer()
    process_batch(supa, mailer)
    assert supa.downloads == 1


def test_error_message_is_truncated_to_500_chars():
    class LongFail(FakeMailer):
        def send(self, *a, **k):
            raise RuntimeError("x" * 2000)
    supa = FakeSupa(_rows(1))
    process_batch(supa, LongFail())
    assert len(supa.called("fail_delivery")[0]["p_error"]) == 500


def test_empty_queue_returns_zero_summary():
    assert process_batch(FakeSupa([]), FakeMailer()) == {"claimed": 0, "sent": 0, "failed": 0}


def test_resend_uses_new_idempotency_key():
    supa, mailer = FakeSupa([({"id": "d9", "kind": "card", "event_id": "e", "resend_count": 2}, context(9))]), FakeMailer()
    process_batch(supa, mailer)
    assert mailer.sent[0]["key"] == "delivery-d9-2"


def _premade(prerendered="e/certificate/demo-x.pdf"):
    ctx = context(5, kind="certificate")
    ctx["template"] = None  # the Chromium engine made the file; no Pillow template needed
    ctx["prerendered"] = prerendered
    return [({"id": "d5", "kind": "certificate", "event_id": "e"}, ctx)]


def test_premade_certificate_is_emailed_as_is():
    supa, mailer = FakeSupa(_premade()), FakeMailer()
    assert process_batch(supa, mailer) == {"claimed": 1, "sent": 1, "failed": 0}
    assert supa.downloaded == [("outputs", "e/certificate/demo-x.pdf")]
    assert supa.uploads == {}  # nothing re-drawn or re-stored
    assert mailer.sent[0]["attachments"] == [
        ("al-farabi-certificate.pdf", b"%PDF-1.4 pre-made certificate", "application/pdf")]
    assert supa.called("complete_delivery")[0]["p_file_path"] == "e/certificate/demo-x.pdf"


def test_premade_file_that_is_not_a_pdf_fails_the_row():
    supa, mailer = FakeSupa(_premade("e/certificate/demo-x.png")), FakeMailer()
    assert process_batch(supa, mailer)["failed"] == 1
    assert mailer.sent == []


class FakeCerts:
    ready = True

    def __init__(self):
        self.made = []

    def make(self, delivery_id):
        self.made.append(delivery_id)
        return b"%PDF-1.4 drawn " + delivery_id.encode()


def _new_cert():
    ctx = context(6, kind="certificate")
    ctx["template"] = None
    ctx["prerendered"] = None
    return [({"id": "d6", "kind": "certificate", "event_id": "e"}, ctx)]


def test_new_certificate_is_drawn_by_the_site_function_then_emailed():
    supa, mailer, certs = FakeSupa(_new_cert()), FakeMailer(), FakeCerts()
    assert process_batch(supa, mailer, certs=certs) == {"claimed": 1, "sent": 1, "failed": 0}
    assert certs.made == ["d6"]
    assert mailer.sent[0]["attachments"] == [("al-farabi-certificate.pdf", b"%PDF-1.4 drawn d6", "application/pdf")]
    # nothing stored in Supabase: no upload, no download, no file path
    assert supa.uploads == {} and supa.downloaded == [] and supa.deleted == []
    assert supa.called("complete_delivery")[0]["p_file_path"] is None


def test_new_certificate_without_the_site_function_fails_and_retries_later():
    supa, mailer = FakeSupa(_new_cert()), FakeMailer()
    assert process_batch(supa, mailer)["failed"] == 1
    assert "renderer" in supa.called("fail_delivery")[0]["p_error"]


# ---------- 500+ guests: draw several certificates at once; don't keep PDFs after sending ----------
import threading  # noqa: E402
import time  # noqa: E402


def _new_certs(ids):
    rows = []
    for i in ids:
        ctx = context(i, kind="certificate")
        ctx["template"], ctx["prerendered"] = None, None
        ctx["to_email"] = f"p{i}@example.com"
        rows.append(({"id": f"d{i}", "kind": "certificate", "event_id": "e"}, ctx))
    return rows


class SlowCerts:
    """Draws take 0.2 s; records how many were being drawn at the same time."""
    ready = True

    def __init__(self, fail=()):
        self.fail, self.active, self.peak, self.lock = set(fail), 0, 0, threading.Lock()

    def make(self, delivery_id):
        with self.lock:
            self.active += 1
            self.peak = max(self.peak, self.active)
        time.sleep(0.2)
        with self.lock:
            self.active -= 1
        if delivery_id in self.fail:
            raise RuntimeError("certificate function 500: render failed")
        return b"%PDF-1.4 " + delivery_id.encode()


def test_certificates_in_a_batch_are_drawn_at_the_same_time():
    certs = SlowCerts()
    supa, mailer = FakeSupa(_new_certs([1, 2, 3])), FakeMailer()
    start = time.monotonic()
    assert process_batch(supa, mailer, limit=3, certs=certs) == {"claimed": 3, "sent": 3, "failed": 0}
    assert certs.peak >= 2 and time.monotonic() - start < 0.5  # not 3 x 0.2 s one after another
    assert [m["to"] for m in mailer.sent] == ["p1@example.com", "p2@example.com", "p3@example.com"]


def test_a_failed_drawing_only_fails_its_own_row():
    supa, mailer = FakeSupa(_new_certs([1, 2, 3])), FakeMailer()
    assert process_batch(supa, mailer, limit=3, certs=SlowCerts(fail={"d2"})) == {"claimed": 3, "sent": 2, "failed": 1}
    assert supa.called("fail_delivery")[0]["p_id"] == "d2"


def test_a_drawn_certificate_never_touches_supabase_storage():
    supa, mailer = FakeSupa(_new_certs([4])), FakeMailer()
    process_batch(supa, mailer, certs=SlowCerts())
    assert supa.uploads == {} and supa.downloaded == [] and supa.deleted == []
    assert mailer.sent[0]["attachments"][0][1] == b"%PDF-1.4 d4"


def test_a_hand_made_pdf_is_kept():
    supa, mailer = FakeSupa(_premade()), FakeMailer()
    process_batch(supa, mailer)
    assert supa.deleted == []
