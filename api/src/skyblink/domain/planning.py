from collections import Counter
from collections.abc import Sequence

from skyblink.domain.models import DETECTORS, Frame, Season
from skyblink.domain.seasons import spread_evenly


def detector_priority(seasons: Sequence[Season], requested: Sequence[str] | None) -> list[str]:
    if requested:
        return list(dict.fromkeys(requested))
    counts = Counter(e.detector for season in seasons for e in season.exposures)
    return sorted((d for d in DETECTORS if counts[d]), key=lambda d: -counts[d])


def frame_id(job_id: str, season: Season, detector: str) -> str:
    return f"{job_id}-s{season.id}-{detector}"


def make_frame(job_id: str, season: Season, detector: str, max_exposures: int) -> Frame:
    available = season.for_detector(detector)
    return Frame(
        id=frame_id(job_id, season, detector),
        season_id=season.id,
        detector=detector,
        exposures=tuple(spread_evenly(available, max_exposures)),
        n_exposures_available=len(available),
    )


def plan_frames(
    job_id: str,
    seasons: Sequence[Season],
    requested: Sequence[str] | None,
    max_exposures: int,
) -> list[Frame]:
    candidates = [
        (season, detector)
        for detector in detector_priority(seasons, requested)
        for season in seasons
        if season.for_detector(detector)
    ]
    first_per_season: dict[int, tuple[Season, str]] = {}
    for season, detector in candidates:
        first_per_season.setdefault(season.id, (season, detector))
    head = sorted(first_per_season.values(), key=lambda pair: pair[0].start_mjd)
    tail = [pair for pair in candidates if pair not in head]
    return [make_frame(job_id, season, detector, max_exposures) for season, detector in head + tail]
