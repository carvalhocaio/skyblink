import dataclasses
import logging

import numpy as np
import pytest
from astropy import units as u
from astropy.coordinates import SkyCoord

from skyblink.adapters.serialization import motion_from_dict, motion_to_dict
from skyblink.adapters.simbad import CatalogEntry
from skyblink.domain.astrometry import Drift, measure_drift, select_reference_stars
from skyblink.domain.grid import FrameGrid
from skyblink.domain.models import AlertCode, Frame, FrameStatus, Job, Target
from skyblink.domain.motion import (
    CatalogSource,
    MotionUnavailable,
    SeasonFrame,
    bootstrap_centroid,
    compare_with_catalog,
    measure_motion,
)
from skyblink.domain.proper_motion import StellarAstrometry, apparent_position
from skyblink.services.analysis import JobAnalysis
from skyblink.services.frame_builder import FrameImage
from tests.factories import make_exposure

SHAPE = (59, 59)
CENTRE = 29.0
BACKGROUND_STARS = [(10.0, 12.0), (45.0, 15.0), (14.0, 44.0), (47.0, 47.0)]


def stars_image(stars, shift=(0.0, 0.0), amplitude=50.0, noise=0.01, seed=0) -> np.ndarray:
    y, x = np.mgrid[: SHAPE[0], : SHAPE[1]]
    image = np.random.default_rng(seed).normal(0.0, noise, SHAPE)
    for sx, sy in stars:
        image += amplitude * np.exp(-((x - sx - shift[0]) ** 2 + (y - sy - shift[1]) ** 2) / (2 * 1.3**2))
    return image


def test_reference_stars_exclude_centre_box_and_saturated_stars():
    image = stars_image([*BACKGROUND_STARS, (CENTRE + 1, CENTRE)])
    saturated = np.zeros(SHAPE)
    saturated[47, 47] = 1

    stars = select_reference_stars(image, saturated)

    assert sorted(stars) == sorted([(10.0, 12.0), (45.0, 15.0), (14.0, 44.0)])


@pytest.mark.parametrize(("shift", "alert"), [((0.3, 0.0), True), ((0.1, 0.1), False)])
def test_alignment_drift_alert_above_a_fifth_of_a_pixel(shift, alert):
    job = Job(
        id="j", target=Target(1, 2), detectors=("D6",), max_exposures_per_frame=30, primary_detector="D6"
    )
    analysis = JobAnalysis(job, resolver=None)
    first, second = (make_frame("j-s0-D6", 0), make_frame("j-s1-D6", 1))
    analysis.frame_ready(first, frame_image(stars_image(BACKGROUND_STARS)))
    analysis.frame_ready(second, frame_image(stars_image(BACKGROUND_STARS, shift=shift, seed=1)))

    assert (AlertCode.ALIGNMENT_DRIFT in [a.code for a in second.alerts]) is alert
    assert first.alerts == []


def test_fewer_than_three_reference_stars_gives_no_alert_and_logs_why(caplog):
    job = Job(
        id="j", target=Target(1, 2), detectors=("D6",), max_exposures_per_frame=30, primary_detector="D6"
    )
    analysis = JobAnalysis(job, resolver=None)
    second = make_frame("j-s1-D6", 1)
    with caplog.at_level(logging.INFO):
        analysis.frame_ready(make_frame("j-s0-D6", 0), frame_image(stars_image(BACKGROUND_STARS[:2])))
        analysis.frame_ready(second, frame_image(stars_image(BACKGROUND_STARS[:2], shift=(1.0, 0.0))))

    assert second.alerts == []
    assert "only 2 reference stars (need 3)" in caplog.text


def test_drift_is_the_median_star_offset():
    reference = stars_image(BACKGROUND_STARS)
    moved = stars_image(BACKGROUND_STARS, shift=(0.4, -0.2), seed=3)

    drift, usable = measure_drift(reference, moved, BACKGROUND_STARS)

    assert usable == 4
    assert (drift.dx, drift.dy) == pytest.approx((0.4, -0.2), abs=0.03)


def make_frame(frame_id: str, season: int) -> Frame:
    return Frame(
        id=frame_id,
        season_id=season,
        detector="D6",
        exposures=(make_exposure(obs_id=frame_id, mjd=60000.0 + 365.0 * season),),
        n_exposures_available=1,
        status=FrameStatus.READY,
    )


def frame_image(image: np.ndarray, data=None, variance=None) -> FrameImage:
    return FrameImage(
        image=image,
        coverage=np.ones(SHAPE),
        saturated_count=np.zeros(SHAPE),
        n_exposures_used=1,
        exposure_data=data,
        exposure_variance=variance,
    )


def season_frame(season: int, mjd: float, centre_shift, amplitude=50.0, n=12, noise=0.05, drift=None):
    rng = np.random.default_rng(season)
    data = np.stack(
        [
            stars_image(
                [(CENTRE, CENTRE)],
                shift=centre_shift,
                amplitude=amplitude,
                noise=noise,
                seed=int(rng.integers(1e9)),
            )
            for _ in range(n)
        ]
    )
    variance = np.full(data.shape, noise**2)
    image = data.mean(axis=0)
    return SeasonFrame(season, f"j-s{season}-D6", mjd, image, data, variance, drift)


def test_bootstrap_is_deterministic_for_a_seed():
    frame = season_frame(0, 60000.0, (0.0, 0.0))

    first = bootstrap_centroid(
        frame.exposure_data, frame.exposure_variance, (CENTRE, CENTRE), 50, np.random.default_rng(7)
    )
    again = bootstrap_centroid(
        frame.exposure_data, frame.exposure_variance, (CENTRE, CENTRE), 50, np.random.default_rng(7)
    )

    assert first == again
    assert 0 < first[0] < 0.05 and 0 < first[1] < 0.05


def test_motion_recovers_a_known_shift_and_rate():
    frames = [
        season_frame(0, 60000.0, (0.0, 0.0)),
        season_frame(1, 60000.0 + 365.25, (-0.2, 1.7), drift=Drift(0.1, 0.0, 4)),
    ]

    motion = measure_motion(frames, "D6")

    second = motion.seasons[1]
    assert second.drift_corrected
    assert second.offset_px == pytest.approx((-0.3, 1.7), abs=0.05)
    assert motion.rate_arcsec_yr == pytest.approx(np.hypot(-0.3, 1.7) * 6.15, abs=0.3)
    assert motion.rate_err_arcsec_yr > 0


@pytest.mark.parametrize(
    ("frames", "reason"),
    [
        ([season_frame(0, 60000.0, (0, 0))], "at least two seasons"),
        ([season_frame(0, 60000.0, (0, 0)), season_frame(1, 60300.0, (0, 0), amplitude=0.05)], "too faint"),
        (
            [season_frame(0, 60000.0, (0, 0)), season_frame(1, 60300.0, (0, 0), n=2)],
            "needed for an error bar",
        ),
    ],
)
def test_motion_is_unavailable_when_it_cannot_be_defended(frames, reason):
    with pytest.raises(MotionUnavailable, match=reason):
        measure_motion(frames, "D6")


def test_parallax_of_a_star_at_the_ecliptic_pole_is_one_parallax_all_year():
    pole = SkyCoord(lon=0 * u.deg, lat=90 * u.deg, frame="barycentrictrueecliptic").icrs
    star = StellarAstrometry(
        ra=pole.ra.deg,
        dec=pole.dec.deg,
        ref_epoch_jyear=2000.0,
        parallax_mas=1000.0,
        pmra_mas_yr=0,
        pmdec_mas_yr=0,
    )

    for mjd in (60000.0, 60091.0, 60182.0, 60273.0):
        with_plx = SkyCoord(*apparent_position(star, mjd), unit="deg")
        without = SkyCoord(*apparent_position(star, mjd, include_parallax=False), unit="deg")
        assert with_plx.separation(without).arcsec == pytest.approx(1.0, abs=0.02)


def test_catalog_comparison_residual_is_zero_when_prediction_matches():
    motion = measure_motion(
        [season_frame(0, 60000.0, (0.0, 0.0)), season_frame(1, 60365.0, (0.0, 1.0))], "D6"
    )
    positions = np.array([s.position_px for s in motion.seasons])
    source = CatalogSource("SIMBAD", "test star", "bibcode", 0.0, 6150.0, 100.0, None)

    compared = compare_with_catalog(motion, positions, source)

    assert compared.seasons[0].residual_sigma is None
    assert compared.seasons[1].residual_sigma == pytest.approx(0.0, abs=1e-9)
    assert compared.prediction.source.catalog == "SIMBAD"
    assert compared.prediction.rate_residual_sigma == pytest.approx(0.0, abs=1e-6)


def test_motion_survives_persistence():
    motion = measure_motion(
        [season_frame(0, 60000.0, (0.0, 0.0)), season_frame(1, 60365.0, (0.0, 1.0))], "D6"
    )
    source = CatalogSource("SIMBAD", "test star", "bibcode", 1.0, 2.0, None, None)
    motion = compare_with_catalog(motion, np.array([s.position_px for s in motion.seasons]), source)

    assert motion_from_dict(motion_to_dict(motion)) == motion
    assert motion_from_dict(None) is None


def catalog_entry() -> CatalogEntry:
    return CatalogEntry(
        catalog="SIMBAD",
        server="test",
        object="NAME Test",
        coordinates_source="bibcode",
        astrometry=StellarAstrometry(
            ra=1.0, dec=2.0, ref_epoch_jyear=2000.0, parallax_mas=1e-3, pmra_mas_yr=0, pmdec_mas_yr=0
        ),
        parallax_known=False,
        radial_velocity_known=False,
    )


async def test_prediction_failure_keeps_the_measured_motion():
    from skyblink.adapters.simbad import CatalogLookupError

    async def failing(name):
        raise CatalogLookupError(f"{name!r} not found in SIMBAD")

    job = Job(
        id="j",
        target=Target(1.0, 2.0),
        detectors=("D6",),
        max_exposures_per_frame=30,
        primary_detector="D6",
        target_name="Nobody",
    )
    job.frames = [make_frame("j-s0-D6", 0), make_frame("j-s1-D6", 1)]
    analysis = JobAnalysis(job, resolver=failing)
    for frame, season in zip(
        job.frames, [season_frame(0, 60000.0, (0, 0)), season_frame(1, 60365.0, (0, 1))], strict=True
    ):
        analysis.frame_ready(frame, frame_image(season.image, season.exposure_data, season.exposure_variance))

    await analysis.maybe_compute_motion(FrameGrid.centered_on(job.target))

    assert job.motion is not None and job.motion.prediction is None
    assert job.motion.prediction_reason == "'Nobody' not found in SIMBAD"


def test_motion_is_reproducible_across_jobs():
    frames = [season_frame(0, 60000.0, (0.0, 0.0)), season_frame(1, 60365.0, (0.3, 1.5))]
    other_job = [dataclasses.replace(f, frame_id=f"otherjob-s{f.season_id}-D6") for f in frames]

    first, again = measure_motion(frames, "D6"), measure_motion(other_job, "D6")

    assert (first.rate_arcsec_yr, first.rate_err_arcsec_yr) == (
        again.rate_arcsec_yr,
        again.rate_err_arcsec_yr,
    )
    assert [(s.offset_px, s.offset_err_px) for s in first.seasons] == [
        (s.offset_px, s.offset_err_px) for s in again.seasons
    ]
