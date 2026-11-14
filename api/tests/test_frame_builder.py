import numpy as np
import pytest

from skyblink.adapters.irsa_cutouts import CutoutError
from skyblink.domain.grid import FrameGrid
from skyblink.domain.models import Target
from skyblink.services.frame_builder import FrameBuilder, NoUsableExposures, stack_cutouts
from tests.factories import make_exposure, write_cutout

TARGET = Target(10.0, 20.0, fov_arcmin=2)
PLANES = {1: "OVERFLOW", 10: "HOT", 21: "SOURCE"}


def star_cutout(path, *, offset: float = 0.0, hot_pixel: bool = False):
    grid = FrameGrid.centered_on(TARGET)
    rows, cols = grid.shape
    y, x = np.mgrid[:rows, :cols]
    centre = rows // 2
    star = 100.0 * np.exp(-((x - centre) ** 2 + (y - centre) ** 2) / 2.0)
    image = star + 5.0 + 0.3 + offset
    flags = np.zeros(grid.shape, dtype=np.int64)
    flags[star > 1.0] |= 1 << 21
    flags[centre, centre] |= 1 << 1
    if hot_pixel:
        image[2, 2] = 1e4
        flags[2, 2] |= 1 << 10
    return write_cutout(path, grid.wcs, image, flags=flags, zodi=np.full(grid.shape, 5.0), planes=PLANES)


def test_stack_subtracts_zodi_and_local_background_and_masks_bad_pixels(tmp_path):
    grid = FrameGrid.centered_on(TARGET)
    paths = [star_cutout(tmp_path / "a.fits", hot_pixel=True), star_cutout(tmp_path / "b.fits", offset=0.1)]

    frame = stack_cutouts(paths, grid)

    centre = grid.shape[0] // 2
    assert frame.n_exposures_used == 2
    assert np.nanargmax(frame.image) == np.ravel_multi_index((centre, centre), grid.shape)
    assert frame.image[centre, centre] == pytest.approx(100.0, rel=0.02)
    assert np.nanmedian(frame.image) == pytest.approx(0.0, abs=0.05)
    assert frame.coverage[2, 2] == 1
    assert frame.saturated_count[centre, centre] == 2


class FakeFetcher:
    def __init__(self, results):
        self._results = iter(results)

    async def fetch(self, exposure, ra, dec, size_deg):
        result = next(self._results)
        if isinstance(result, Exception):
            raise result
        return result


async def test_builder_skips_failed_and_empty_cutouts(tmp_path):
    good = star_cutout(tmp_path / "good.fits")
    builder = FrameBuilder(FakeFetcher([good, None, CutoutError("boom")]))

    frame = await builder.build([make_exposure()] * 3, TARGET, FrameGrid.centered_on(TARGET))

    assert frame.n_exposures_used == 1
    assert frame.download_s >= 0 and frame.assembly_s > 0


async def test_builder_fails_when_nothing_is_usable():
    builder = FrameBuilder(FakeFetcher([None, CutoutError("boom")]))

    with pytest.raises(NoUsableExposures):
        await builder.build([make_exposure()] * 2, TARGET, FrameGrid.centered_on(TARGET))
