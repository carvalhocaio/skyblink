from collections.abc import Sequence
from typing import Protocol

from skyblink.domain.models import Exposure, Season, Target
from skyblink.domain.seasons import group_into_seasons

ALL_DETECTORS = ("D1", "D2", "D3", "D4", "D5", "D6")


class ExposureSearch(Protocol):
    async def search(self, target: Target) -> list[Exposure]: ...


def restrict_to_detectors(seasons: Sequence[Season], detectors: Sequence[str]) -> list[Season]:
    wanted = set(detectors)
    restricted = (
        Season(id=s.id, exposures=tuple(e for e in s.exposures if e.detector in wanted)) for s in seasons
    )
    return [season for season in restricted if season.exposures]


async def discover_seasons(
    search: ExposureSearch, target: Target, detectors: Sequence[str] | None = None
) -> list[Season]:
    seasons = group_into_seasons(await search.search(target))
    return restrict_to_detectors(seasons, detectors or ALL_DETECTORS)
