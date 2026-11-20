from engine.jobs import run
from tests.py.fakes import FakeMailer, FakeSupa, context


class Clock:
    def __init__(self):
        self.t = 0.0

    def now(self):
        return self.t

    def sleep(self, s):
        self.t += s


class QueueSupa(FakeSupa):
    """claim_deliveries drains rows across calls; the runner lease is controllable."""

    def __init__(self, rows, lease=True):
        super().__init__(rows)
        self.pending = [r for r, _ in rows]
        self.lease = lease

    def rpc(self, name, args=None):
        if name == "acquire_runner_slot":
            self.calls.append((name, args))
            return 2 if self.lease else None
        if name == "claim_deliveries":
            self.calls.append((name, args))
            out, self.pending = self.pending[: args["p_limit"]], self.pending[args["p_limit"]:]
            return out
        return super().rpc(name, args)


def _rows(n):
    return [({"id": f"d{i}", "kind": "card", "event_id": "e"}, context(i)) for i in range(n)]


def test_run_skips_when_another_runner_holds_lease():
    supa, clock = QueueSupa(_rows(3), lease=False), Clock()
    assert run(supa, FakeMailer(), clock=clock.now, sleep=clock.sleep) == {"skipped": True}
    assert not supa.called("claim_deliveries")


def test_run_drains_queue_across_batches_and_releases_lease():
    supa, mailer, clock = QueueSupa(_rows(12)), FakeMailer(), Clock()
    out = run(supa, mailer, clock=clock.now, sleep=clock.sleep, batch=5)
    assert out == {"claimed": 12, "sent": 12, "failed": 0}
    assert len(mailer.sent) == 12
    assert supa.called("release_runner_slot") == [{"p_slot": 2}]


def test_run_paces_sends_to_stay_under_rate_limit():
    supa, clock = QueueSupa(_rows(4)), Clock()
    run(supa, FakeMailer(), clock=clock.now, sleep=clock.sleep, interval=0.55)
    assert clock.t >= 0.55 * 3


def test_run_stops_at_time_budget_and_still_releases():
    supa, clock = QueueSupa(_rows(500)), Clock()
    out = run(supa, FakeMailer(), clock=clock.now, sleep=clock.sleep, budget=5, interval=0.55)
    assert out["sent"] < 500
    assert supa.called("release_runner_slot") == [{"p_slot": 2}]


def test_run_waits_without_touching_queue_when_email_not_set_up():
    supa, mailer, clock = QueueSupa(_rows(3)), FakeMailer(ready=False), Clock()
    assert run(supa, mailer, clock=clock.now, sleep=clock.sleep) == {"skipped": "email not configured"}
    assert supa.calls == [] and mailer.sent == []


def test_several_runners_share_the_queue_with_a_slot_each():
    # Up to 6 senders at once (one slot each), so 500 certificates do not wait for a single sender.
    supa, clock = QueueSupa(_rows(2)), Clock()
    run(supa, FakeMailer(), clock=clock.now, sleep=clock.sleep)
    (args,) = supa.called("acquire_runner_slot")
    assert args["p_slots"] == 6
    assert args["p_ttl_seconds"] >= 60  # the slot outlives the longest possible run


def test_defaults_keep_six_senders_under_the_email_limit_and_inside_the_function_limit():
    # Resend allows 10 emails a second: 6 senders x 1 per second = 6. A round is drawn (<= 25 s) then sent
    # (6 x 1 s); the last round must start early enough to end inside the 60 s function limit.
    import inspect
    d = {k: v.default for k, v in inspect.signature(run).parameters.items() if v.default is not inspect.Parameter.empty}
    assert d["batch"] == 6 and d["interval"] >= 1.0
    assert 6 * (1 / d["interval"]) <= 10
    assert d["budget"] + 25 + d["batch"] * d["interval"] <= 55
