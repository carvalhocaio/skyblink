import asyncio

from skyblink.adapters.throttle import ConcurrencyGovernor


def make_governor() -> ConcurrencyGovernor:
    return ConcurrencyGovernor(limit=8, fallback_limit=6, max_unavailable_ratio=0.2, min_requests=20)


def test_falls_back_when_more_than_twenty_percent_are_503():
    governor = make_governor()

    for status in [503] * 5 + [200] * 15:
        governor.record(status)

    assert governor.limit == 6
    assert governor.unavailable_ratio == 0.25


def test_keeps_limit_at_exactly_twenty_percent():
    governor = make_governor()

    for status in [503] * 4 + [200] * 16:
        governor.record(status)

    assert governor.limit == 8


def test_waits_for_enough_requests_before_judging():
    governor = make_governor()

    for _ in range(19):
        governor.record(503)

    assert governor.limit == 8
    governor.record(503)
    assert governor.limit == 6


async def test_slot_never_exceeds_limit():
    governor = ConcurrencyGovernor(limit=2, fallback_limit=1, max_unavailable_ratio=0.2, min_requests=20)
    active, peak = 0, 0

    async def work():
        nonlocal active, peak
        async with governor.slot():
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.01)
            active -= 1

    await asyncio.gather(*(work() for _ in range(6)))

    assert peak == 2
