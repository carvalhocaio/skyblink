from collections.abc import Iterable, Sequence

from skyblink.domain.models import Exposure, Season

SEASON_GAP_DAYS = 30.0


def group_into_seasons(exposures: Iterable[Exposure], gap_days: float = SEASON_GAP_DAYS) -> list[Season]:
    ordered = sorted(exposures, key=lambda e: e.mjd)
    groups: list[list[Exposure]] = []
    for exposure in ordered:
        if groups and exposure.mjd - groups[-1][-1].mjd <= gap_days:
            groups[-1].append(exposure)
        else:
            groups.append([exposure])
    return [Season(id=index, exposures=tuple(group)) for index, group in enumerate(groups)]


def spread_evenly[T](items: Sequence[T], limit: int) -> list[T]:
    if len(items) <= limit:
        return list(items)
    step = (len(items) - 1) / (limit - 1) if limit > 1 else 0
    return [items[round(index * step)] for index in range(limit)]
