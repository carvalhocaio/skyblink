import numpy as np
import pytest

from skyblink.domain.astrometry import (
    bootstrap_means,
    bootstrap_shift,
    centroid,
    find_reference_stars,
)
from skyblink.domain.proper_motion import BARNARD_GAIA_DR3, StellarAstrometry, apparent_position


def gaussian(shape, x0, y0, peak=100.0, sigma=1.2):
    y, x = np.mgrid[: shape[0], : shape[1]]
    return peak * np.exp(-((x - x0) ** 2 + (y - y0) ** 2) / (2 * sigma**2))


def test_centroid_recovers_subpixel_position_from_offset_guess():
    image = gaussian((31, 31), 15.3, 14.6)

    x, y = centroid(image, (14.0, 16.0))

    assert (x, y) == pytest.approx((15.3, 14.6), abs=0.05)


def test_centroid_rejects_edges_and_mostly_empty_boxes():
    image = gaussian((31, 31), 15, 15)
    holed = image.copy()
    holed[10:20, 10:20] = np.nan

    assert centroid(image, (1.0, 15.0)) is None
    assert centroid(holed, (15.0, 15.0)) is None


def test_bootstrap_shift_matches_mean_difference_and_scatter():
    rng = np.random.default_rng(1)
    first = rng.normal([10.0, 10.0], 0.5, size=(40, 2))
    last = rng.normal([10.0, 12.0], 0.5, size=(40, 2))

    shift = bootstrap_shift(first, last)

    assert (shift.dx, shift.dy) == pytest.approx(tuple(last.mean(0) - first.mean(0)))
    assert shift.dy_err == pytest.approx(0.5 * np.sqrt(2 / 40), rel=0.3)
    assert shift.magnitude_err > 0


def test_bootstrap_of_identical_positions_has_no_spread():
    means = bootstrap_means(np.ones((5, 2)), samples=50)

    assert means.std(axis=0).tolist() == [0.0, 0.0]


def test_reference_stars_skip_target_edges_and_saturation():
    image = (
        gaussian((41, 41), 20, 20, peak=500)
        + gaussian((41, 41), 8, 30, peak=5)
        + gaussian((41, 41), 32, 10, peak=5)
        + gaussian((41, 41), 1, 1, peak=5)
    )
    saturated = np.zeros(image.shape, dtype=int)
    saturated[10, 32] = 1

    stars = find_reference_stars(image, (20, 20), 6, threshold=1.0, saturated=saturated)

    assert stars == [(8.0, 30.0)]


def test_star_without_motion_or_parallax_stays_put():
    still = StellarAstrometry(ra=120.0, dec=-30.0, ref_epoch_jyear=2016.0, parallax_mas=1.0, pmra_mas_yr=0, pmdec_mas_yr=0)

    assert apparent_position(still, 61000.0) == pytest.approx((120.0, -30.0), abs=1e-6)


def test_barnard_moves_about_ten_arcsec_per_year_north():
    ra0, dec0 = apparent_position(BARNARD_GAIA_DR3, 60900.0)
    ra1, dec1 = apparent_position(BARNARD_GAIA_DR3, 60900.0 + 365.25)

    assert (dec1 - dec0) * 3600 == pytest.approx(10.36, abs=0.6)
    assert (ra1 - ra0) * 3600 * np.cos(np.radians(dec0)) == pytest.approx(-0.80, abs=0.6)
