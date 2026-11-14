import numpy as np
import pytest

from skyblink.domain.alerts import frame_alerts, is_saturated_core, job_alerts, touches_core
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


def test_without_requested_detectors_d6_comes_first_then_d1_to_d5():
    assert detector_priority(SEASONS, None) == ["D6", "D1"]
    assert detector_priority(SEASONS, ["D1", "D6", "D1"]) == ["D1", "D6"]


def test_all_detectors_build_d6_per_season_first_then_other_detectors_in_order():
    seasons = [
        season(0, 0.0, {d: 2 for d in ("D1", "D2", "D3", "D4", "D5", "D6")}),
        season(1, 300.0, {d: 2 for d in ("D1", "D3", "D6")}),
    ]

    frames = plan_frames("job", seasons, None, max_exposures=30)

    assert [f.id.removeprefix("job-") for f in frames] == [
        "s0-D6",
        "s1-D6",
        "s0-D1",
        "s1-D1",
        "s0-D2",
        "s0-D3",
        "s1-D3",
        "s0-D4",
        "s0-D5",
    ]


def test_season_without_primary_detector_still_gets_an_early_frame():
    seasons = [season(0, 0.0, {"D6": 2, "D1": 2}), season(1, 300.0, {"D2": 2})]

    frames = plan_frames("job", seasons, None, max_exposures=30)

    assert [f.id.removeprefix("job-") for f in frames][:2] == ["s0-D6", "s1-D2"]


def test_job_alerts_for_coverage_and_seasons():
    assert [a.code for a in job_alerts([])] == [AlertCode.NO_COVERAGE]
    assert [a.code for a in job_alerts(SEASONS[:1])] == [AlertCode.SINGLE_SEASON]
    assert job_alerts(SEASONS) == []


@pytest.mark.parametrize(
    ("saturated", "total", "expected"),
    [
        (1, 20, False),
        (4, 20, False),
        (5, 20, True),
        (20, 20, True),
        (1, 4, False),
        (2, 4, True),
        (1, 1, False),
    ],
)
def test_saturated_core_needs_a_quarter_of_exposures_and_at_least_two(saturated, total, expected):
    assert is_saturated_core(saturated, total) is expected
    codes = [a.code for a in frame_alerts(total, saturated)]
    assert (AlertCode.SATURATED_CORE in codes) is expected


def test_frame_alerts_for_few_exposures_and_saturated_target():
    alerts = frame_alerts(4, 2)

    assert [(a.code, a.severity) for a in alerts] == [
        (AlertCode.FEW_EXPOSURES, "warning"),
        (AlertCode.SATURATED_CORE, "info"),
    ]
    assert frame_alerts(5, 0) == []


def test_saturation_outside_the_core_box_is_ignored():
    saturated = np.zeros((9, 9))
    saturated[0, 0] = 1
    saturated[4, 6] = 1

    assert not touches_core(saturated)
    saturated[5, 5] = 1
    assert touches_core(saturated)


def test_eta_uses_prior_then_measured_rates():
    low, high = PRIOR_SECONDS_PER_EXPOSURE
    assert estimate_eta([], 10) == pytest.approx((10 * low, 10 * high * MAX_SAFETY_FACTOR))
    assert estimate_eta([(20.0, 10), (60.0, 20)], 10) == pytest.approx(
        (10 * 2.0 * 0.8, 10 * 3.0 * 1.25 * 1.2)
    )
    assert estimate_eta([(20.0, 10)], 0) == (0.0, 0.0)
