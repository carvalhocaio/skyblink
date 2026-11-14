import asyncio
import dataclasses
import logging
import time
import warnings
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS, FITSFixedWarning
from reproject import reproject_interp

from skyblink.adapters.http_retry import UpstreamUnavailable
from skyblink.adapters.irsa_cutouts import CutoutError
from skyblink.domain.flags import FlagMasks
from skyblink.domain.grid import FrameGrid
from skyblink.domain.models import Exposure, Target
from skyblink.domain.stacking import weighted_mean_stack

logger = logging.getLogger(__name__)

MIN_BACKGROUND_PIXELS = 20
BACKGROUND_SIGMA = 3.0


class NoUsableExposures(Exception):
    pass


class CutoutFetcher(Protocol):
    async def fetch(self, exposure: Exposure, ra: float, dec: float, size_deg: float) -> Path | None: ...


@dataclass(frozen=True)
class ReprojectedExposure:
    data: np.ndarray
    variance: np.ndarray
    saturated: np.ndarray


@dataclass(frozen=True)
class FrameImage:
    image: np.ndarray
    coverage: np.ndarray
    saturated_count: np.ndarray
    n_exposures_used: int
    download_s: float = 0.0
    assembly_s: float = 0.0


def subtract_background(image: np.ndarray, zodi: np.ndarray, ignore: np.ndarray) -> np.ndarray:
    residual = image - zodi
    usable = ~ignore & np.isfinite(residual)
    if np.count_nonzero(usable) >= MIN_BACKGROUND_PIXELS:
        _, median, _ = sigma_clipped_stats(residual[usable], sigma=BACKGROUND_SIGMA)
        residual = residual - median
    return residual


def _reproject(array: np.ndarray, wcs: WCS, grid: FrameGrid) -> tuple[np.ndarray, np.ndarray]:
    return reproject_interp((array, wcs), grid.wcs, shape_out=grid.shape)


def reproject_exposure(path: Path, grid: FrameGrid) -> ReprojectedExposure:
    with fits.open(path) as hdul, warnings.catch_warnings():
        warnings.simplefilter("ignore", FITSFixedWarning)
        wcs = WCS(hdul["IMAGE"].header)
        image = hdul["IMAGE"].data.astype(np.float64)
        zodi = hdul["ZODI"].data.astype(np.float64)
        variance = hdul["VARIANCE"].data.astype(np.float64)
        flags = hdul["FLAGS"].data
        masks = FlagMasks.from_header(hdul["FLAGS"].header)
    bad = masks.bad_pixels(flags) | ~np.isfinite(image) | ~np.isfinite(variance) | (variance <= 0)
    signal = subtract_background(image, zodi, bad | masks.source_pixels(flags))
    data, footprint = _reproject(np.where(bad, np.nan, signal), wcs, grid)
    projected_variance, _ = _reproject(np.where(bad, np.nan, variance), wcs, grid)
    saturated, _ = _reproject(masks.saturated_pixels(flags).astype(np.float64), wcs, grid)
    outside = footprint <= 0
    data[outside] = np.nan
    projected_variance[outside] = np.nan
    return ReprojectedExposure(data, projected_variance, np.nan_to_num(saturated) > 0)


def _load_all(paths: Sequence[Path], grid: FrameGrid) -> list[ReprojectedExposure]:
    loaded = []
    for path in paths:
        try:
            loaded.append(reproject_exposure(path, grid))
        except (OSError, KeyError, ValueError) as error:
            logger.warning("skipping unreadable cutout %s: %s", path, error)
    return loaded


def stack_cutouts(paths: Sequence[Path], grid: FrameGrid) -> FrameImage:
    exposures = [e for e in _load_all(paths, grid) if np.isfinite(e.data).any()]
    if not exposures:
        raise NoUsableExposures("no exposure overlaps the frame")
    result = weighted_mean_stack(
        np.stack([e.data for e in exposures]), np.stack([e.variance for e in exposures])
    )
    return FrameImage(
        image=result.image,
        coverage=result.coverage,
        saturated_count=np.sum([e.saturated for e in exposures], axis=0),
        n_exposures_used=len(exposures),
    )


class FrameBuilder:
    def __init__(self, cutouts: CutoutFetcher):
        self._cutouts = cutouts

    async def _fetch(self, exposure: Exposure, target: Target, grid: FrameGrid) -> Path | None:
        try:
            return await self._cutouts.fetch(exposure, target.ra, target.dec, grid.cutout_size_deg)
        except (CutoutError, UpstreamUnavailable) as error:
            logger.warning("cutout unavailable for %s %s: %s", exposure.obs_id, exposure.detector, error)
            return None

    async def build(self, exposures: Sequence[Exposure], target: Target, grid: FrameGrid) -> FrameImage:
        started = time.perf_counter()
        fetched = await asyncio.gather(*(self._fetch(e, target, grid) for e in exposures))
        downloaded = time.perf_counter()
        paths = [path for path in fetched if path is not None]
        if not paths:
            raise NoUsableExposures("no cutout could be fetched")
        frame = await asyncio.to_thread(stack_cutouts, paths, grid)
        timed = dataclasses.replace(
            frame, download_s=downloaded - started, assembly_s=time.perf_counter() - downloaded
        )
        logger.info(
            "frame %d/%d exposures: download %.1fs, assembly %.1fs",
            timed.n_exposures_used,
            len(exposures),
            timed.download_s,
            timed.assembly_s,
        )
        return timed
