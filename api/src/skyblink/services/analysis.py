import asyncio
import dataclasses
import logging
import time
from collections.abc import Awaitable, Callable

import numpy as np

from skyblink.adapters.simbad import CatalogEntry, CatalogLookupError
from skyblink.domain.alerts import alert, is_alignment_drift
from skyblink.domain.astrometry import (
    MIN_REFERENCE_STARS,
    Drift,
    DriftMeasurement,
    measure_drift,
    select_reference_stars,
)
from skyblink.domain.grid import FrameGrid
from skyblink.domain.models import AlertCode, Frame, FrameStatus, Job
from skyblink.domain.motion import (
    CatalogSource,
    Motion,
    MotionUnavailable,
    SeasonFrame,
    compare_with_catalog,
    measure_motion,
    predict_pixels,
)
from skyblink.services.frame_builder import FrameImage

logger = logging.getLogger(__name__)

CatalogResolver = Callable[[str], Awaitable[CatalogEntry]]
CATALOG_TIMEOUT_S = 30.0


def catalog_source(entry: CatalogEntry) -> CatalogSource:
    star = entry.astrometry
    return CatalogSource(
        catalog=entry.catalog,
        object=entry.object,
        coordinates_source=entry.coordinates_source,
        pmra_mas_yr=star.pmra_mas_yr,
        pmdec_mas_yr=star.pmdec_mas_yr,
        parallax_mas=star.parallax_mas if entry.parallax_known else None,
        radial_velocity_km_s=star.radial_velocity_km_s if entry.radial_velocity_known else None,
    )


def _describe(measurement: DriftMeasurement) -> str:
    def listed(items) -> str:
        return ", ".join(f"({x:.0f},{y:.0f}) {dx:+.2f},{dy:+.2f}" for (x, y), (dx, dy) in items) or "none"

    return f"kept [{listed(measurement.kept)}] dropped [{listed(measurement.dropped)}]"


class JobAnalysis:
    def __init__(self, job: Job, resolver: CatalogResolver | None):
        self._job = job
        self._resolver = resolver
        self._references: dict[str, tuple[np.ndarray, list[tuple[float, float]]]] = {}
        self._season_frames: list[SeasonFrame] = []
        self._motion_done = False

    def frame_ready(self, frame: Frame, image: FrameImage) -> None:
        drift = self._alignment(frame, image)
        if frame.detector == self._job.primary_detector and image.exposure_data is not None:
            self._season_frames.append(
                SeasonFrame(
                    season_id=frame.season_id,
                    frame_id=frame.id,
                    mid_mjd=frame.mid_mjd,
                    image=image.image,
                    exposure_data=image.exposure_data,
                    exposure_variance=image.exposure_variance,
                    drift=drift,
                    epoch_mjd=image.epoch_mjd,
                )
            )

    def _alignment(self, frame: Frame, image: FrameImage) -> Drift | None:
        reference = self._references.get(frame.detector)
        if reference is None:
            stars = select_reference_stars(image.image, image.saturated_count)
            self._references[frame.detector] = (image.image, stars)
            if len(stars) < MIN_REFERENCE_STARS:
                logger.info(
                    "frame %s: alignment not checked for %s, only %d reference stars (need %d)",
                    frame.id,
                    frame.detector,
                    len(stars),
                    MIN_REFERENCE_STARS,
                )
                return None
            return Drift(0.0, 0.0, len(stars))
        measurement = measure_drift(reference[0], image.image, reference[1])
        drift = measurement.drift
        if drift is None:
            logger.info(
                "frame %s: alignment not corrected, %d consistent of %d usable reference stars (need %d); %s",
                frame.id,
                len(measurement.kept),
                measurement.usable,
                MIN_REFERENCE_STARS,
                _describe(measurement),
            )
            return None
        logger.info(
            "frame %s: drift %.3f px (±%.3f, ±%.3f) from %d stars; %s",
            frame.id,
            drift.magnitude,
            drift.dx_err,
            drift.dy_err,
            drift.n_stars,
            _describe(measurement),
        )
        if is_alignment_drift(drift):
            frame.alerts.append(alert(AlertCode.ALIGNMENT_DRIFT))
        return drift

    def _primary_finished(self) -> bool:
        primary = [f for f in self._job.frames if f.detector == self._job.primary_detector]
        return bool(primary) and all(f.status != FrameStatus.PENDING for f in primary)

    async def maybe_compute_motion(self, grid: FrameGrid) -> None:
        if self._motion_done or not self._primary_finished():
            return
        self._motion_done = True
        started = time.perf_counter()
        try:
            motion = await asyncio.to_thread(measure_motion, self._season_frames, self._job.primary_detector)
        except MotionUnavailable as error:
            self._job.motion_reason = str(error)
            logger.info("job %s: motion unavailable: %s", self._job.id, error)
            return
        if self._job.target_name:
            motion = await self._with_prediction(motion, grid)
        self._job.motion = motion
        self._season_frames = []
        logger.info(
            "job %s: motion %.2f ± %.2f arcsec/yr over %d seasons (computed in %.1fs)",
            self._job.id,
            motion.rate_arcsec_yr,
            motion.rate_err_arcsec_yr,
            len(motion.seasons),
            time.perf_counter() - started,
        )

    async def _with_prediction(self, motion: Motion, grid: FrameGrid) -> Motion:
        if self._resolver is None:
            return dataclasses.replace(motion, prediction_reason="catalog lookup is not configured")
        try:
            entry = await asyncio.wait_for(self._resolver(self._job.target_name), CATALOG_TIMEOUT_S)
        except (CatalogLookupError, TimeoutError) as error:
            reason = str(error) or "catalog lookup timed out"
            logger.warning("job %s: no catalog prediction: %s", self._job.id, reason)
            return dataclasses.replace(motion, prediction_reason=reason)
        mjds = [season.epoch_mjd for season in motion.seasons]
        predicted = await asyncio.to_thread(predict_pixels, entry.astrometry, mjds, grid.wcs)
        compared = compare_with_catalog(motion, predicted, catalog_source(entry))
        if not entry.parallax_known:
            reason = (
                f"{entry.catalog} has no parallax for {entry.object}; the prediction ignores annual parallax"
            )
            compared = dataclasses.replace(compared, prediction_reason=reason)
        return compared
