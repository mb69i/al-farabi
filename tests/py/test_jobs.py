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


def test_certificate_attaches_pdf_and_png():
    supa, mailer = FakeSupa(_rows(1, kind="certificate")), FakeMailer()
    process_batch(supa, mailer)
    names = [a[0] for a in mailer.sent[0]["attachments"]]
    assert any(n.endswith(".pdf") for n in names) and any(n.endswith(".png") for n in names)


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
