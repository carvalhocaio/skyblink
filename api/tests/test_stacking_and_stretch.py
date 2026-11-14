import numpy as np
import pytest

from skyblink.domain.grid import FrameGrid
from skyblink.domain.models import Target
from skyblink.domain.seasons import spread_evenly
from skyblink.domain.stacking import weighted_mean_stack
from skyblink.domain.stretch import StretchParams


def column(values: list[float]) -> np.ndarray:
    return np.array(values, dtype=float).reshape(-1, 1, 1)


def test_inverse_variance_weighting():
    result = weighted_mean_stack(column([1.0, 4.0]), column([1.0, 2.0]))

    assert result.image[0, 0] == pytest.approx((1 / 1 + 4 / 2) / (1 / 1 + 1 / 2))
    assert result.coverage[0, 0] == 2


def test_rejects_outlier_with_five_or_more_exposures():
    result = weighted_mean_stack(column([1.0, 1.1, 0.9, 1.0, 50.0]), column([1.0] * 5))

    assert result.image[0, 0] == pytest.approx(1.0)
    assert (result.coverage[0, 0], result.rejected[0, 0]) == (4, 1)


def test_no_rejection_with_fewer_than_five_exposures():
    result = weighted_mean_stack(column([1.0, 1.0, 1.0, 49.0]), column([1.0] * 4))

    assert result.image[0, 0] == pytest.approx(13.0)
    assert result.rejected[0, 0] == 0


def test_no_rejection_where_pixel_has_fewer_than_five_valid_values():
    result = weighted_mean_stack(column([1.0, 1.0, 1.0, 49.0, np.nan]), column([1.0] * 5))

    assert result.image[0, 0] == pytest.approx(13.0)


def test_pixels_without_data_are_nan_with_zero_coverage():
    result = weighted_mean_stack(column([np.nan, 2.0]), column([1.0, -1.0]))

    assert np.isnan(result.image[0, 0])
    assert result.coverage[0, 0] == 0


def test_stretch_maps_percentiles_to_bytes_and_nan_to_black():
    image = np.linspace(0, 100, 101)
    stretch = StretchParams.from_image(image, low=0, high=100)

    pixels = stretch.apply(np.array([0.0, 100.0, 1000.0, np.nan]))

    assert pixels.tolist() == [0, 255, 255, 0]
    assert pixels.dtype == np.uint8


def test_stretch_survives_flat_or_empty_images():
    assert StretchParams.from_image(np.full(4, 3.0)).vmax > 3.0
    assert StretchParams.from_image(np.full(4, np.nan)) == StretchParams(0.0, 1.0)


def test_grid_is_odd_and_centered_on_target():
    grid = FrameGrid.centered_on(Target(269.4464, 4.7668, fov_arcmin=6))

    assert grid.shape == (59, 59)
    ra, dec = grid.wcs.pixel_to_world_values(29, 29)
    assert (ra, dec) == pytest.approx((269.4464, 4.7668))
    assert grid.cutout_size_deg == pytest.approx(59 * 6.15 / 3600 * 2**0.5, abs=1e-4)


def test_spread_evenly_keeps_ends():
    assert spread_evenly(list(range(10)), 3) == [0, 4, 9]
    assert spread_evenly([1, 2], 5) == [1, 2]
