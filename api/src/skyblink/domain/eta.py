from collections.abc import Iterable

PRIOR_SECONDS_PER_EXPOSURE = (1.0, 3.0)
LOW_MARGIN = 0.8
HIGH_MARGIN = 1.25


def estimate_eta(samples: Iterable[tuple[float, int]], remaining_exposures: int) -> tuple[float, float]:
    if remaining_exposures <= 0:
        return 0.0, 0.0
    rates = [seconds / count for seconds, count in samples if count > 0]
    if rates:
        low, high = min(rates) * LOW_MARGIN, max(rates) * HIGH_MARGIN
    else:
        low, high = PRIOR_SECONDS_PER_EXPOSURE
    return remaining_exposures * low, remaining_exposures * high
