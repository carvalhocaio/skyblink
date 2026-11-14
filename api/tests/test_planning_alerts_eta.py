import numpy as np
import pytest

from skyblink.domain.alerts import frame_alerts, has_saturated_core, job_alerts
from skyblink.domain.eta import MAX_SAFETY_FACTOR, PRIOR_SECONDS_PER_EXPOSURE, estimate_eta
from skyblink.domain.models import AlertCode, Season
from skyblink.domain.planning import detector_priority, plan_frames
from tests.factories import make_exposure


def season(season_id: int, mjd: float, detectors: dict[str, int]) -> Season:
    exposures = tuple(
        make_exposure(obs_id=f"{season_id}-{d}-{i}", detector=d, mjd=mjd + i)
        for d, count in detectors.items()
        for i in range(count)
    )
    return Season(id=season_id, exposures=tuple(sorted(exposures, key=lambda e: e.mjd)))


SEASONS = [
    season(0, 0.0, {"D6": 3, "D1": 2}),
    season(1, 200.0, {"D1": 4}),
    season(2, 400.0, {"D6": 2, "D1": 1}),
]


def test_one_frame_per_season_first_then_other_detectors():
    frames = plan_frames("job", SEASONS, ["D6", "D1"], max_exposures=30)

    assert [f.id for f in frames] == [
        "job-s0-D6",
        "job-s1-D1",
        "job-s2-D6",
        "job-s0-D1",
        "job-s2-D1",
    ]


def test_frames_respect_exposure_limit_and_keep_available_count():
    frames = plan_frames("job", SEASONS, ["D1"], max_exposures=2)

    season1 = next(f for f in frames if f.season_id == 1)
    assert (len(season1.exposures), season1.n_exposures_available) == (2, 4)


def test_without_requested_detectors_priority_follows_exposure_count():
    assert detector_priority(SEASONS, None) == ["D1", "D6"]
    assert detector_priority(SEASONS, ["D6", "D6", "D1"]) == ["D6", "D1"]


def test_job_alerts_for_coverage_and_seasons():
    assert [a.code for a in job_alerts([])] == [AlertCode.NO_COVERAGE]
    assert [a.code for a in job_alerts(SEASONS[:1])] == [AlertCode.SINGLE_SEASON]
    assert job_alerts(SEASONS) == []


def test_frame_alerts_for_few_exposures_and_saturated_target():
    saturated = np.zeros((9, 9))
    saturated[5, 4] = 3

    alerts = frame_alerts(4, saturated)

    assert [(a.code, a.severity) for a in alerts] == [
        (AlertCode.FEW_EXPOSURES, "warning"),
        (AlertCode.SATURATED_CORE, "info"),
    ]
    assert frame_alerts(5, np.zeros((9, 9))) == []


def test_saturation_away_from_target_is_ignored():
    saturated = np.zeros((9, 9))
    saturated[0, 0] = 1

    assert not has_saturated_core(saturated)


def test_eta_uses_prior_then_measured_rates():
    low, high = PRIOR_SECONDS_PER_EXPOSURE
    assert estimate_eta([], 10) == pytest.approx((10 * low, 10 * high * MAX_SAFETY_FACTOR))
    assert estimate_eta([(20.0, 10), (60.0, 20)], 10) == pytest.approx(
        (10 * 2.0 * 0.8, 10 * 3.0 * 1.25 * 1.2)
    )
    assert estimate_eta([(20.0, 10)], 0) == (0.0, 0.0)
