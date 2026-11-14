import math
from collections.abc import Callable
from typing import Literal

from astropy.time import Time
from pydantic import BaseModel, Field

from skyblink.domain.grid import SPHEREX_PIXEL_ARCSEC
from skyblink.domain.models import DETECTORS, Alert, Frame, FrameStatus, Job, Season
from skyblink.domain.motion import CatalogComparison, Motion, SeasonMotion

Detector = Literal["D1", "D2", "D3", "D4", "D5", "D6"]


class JobRequest(BaseModel):
    ra: float = Field(ge=0, le=360)
    dec: float = Field(ge=-90, le=90)
    fov_arcmin: float = Field(default=6, ge=1, le=30)
    detectors: list[Detector] | None = Field(default=None, min_length=1)
    max_exposures_per_frame: int = Field(default=30, ge=1)
    target_name: str | None = Field(default=None, min_length=1, max_length=100)


class JobCreated(BaseModel):
    job_id: str
    status: str


class TargetView(BaseModel):
    ra: float
    dec: float
    fov_arcmin: float
    name: str | None


class ProgressView(BaseModel):
    frames_done: int
    frames_total: int
    percent: int


class EtaView(BaseModel):
    min: int | None
    max: int | None


class SeasonView(BaseModel):
    id: int
    start: str
    end: str
    n_exposures: int


class AlertView(BaseModel):
    code: str
    severity: str


class FrameView(BaseModel):
    id: str
    season_id: int
    detector: str
    wavelength_um: tuple[float, float]
    mid_date: str
    status: str
    n_exposures_used: int
    n_exposures_available: int
    image_url: str | None
    alerts: list[AlertView]


class StretchView(BaseModel):
    fixed_from_frame: str | None
    by_detector: dict[str, str]


class OffsetView(BaseModel):
    dx_px: float
    dy_px: float
    dx_err_px: float
    dy_err_px: float
    east_arcsec: float
    north_arcsec: float
    east_err_arcsec: float
    north_err_arcsec: float
    total_arcsec: float
    total_err_arcsec: float


class PredictedOffsetView(BaseModel):
    dx_px: float
    dy_px: float
    east_arcsec: float
    north_arcsec: float
    total_arcsec: float


class SeasonMotionView(BaseModel):
    season_id: int
    frame_id: str
    mid_date: str
    epoch_date: str
    peak_snr: float
    drift_corrected: bool
    offset: OffsetView
    predicted_offset: PredictedOffsetView | None
    residual_sigma: float | None


class RateView(BaseModel):
    value: float
    error: float


class CatalogView(BaseModel):
    name: str
    object: str
    coordinates_source: str
    pmra_mas_yr: float
    pmdec_mas_yr: float
    parallax_mas: float | None
    radial_velocity_km_s: float | None
    predicted_rate_arcsec_yr: float
    rate_residual_sigma: float


class MotionView(BaseModel):
    detector: str
    reference_season_id: int
    seasons: list[SeasonMotionView]
    rate_arcsec_yr: RateView
    catalog: CatalogView | None
    catalog_reason: str | None


class JobView(BaseModel):
    status: str
    target: TargetView
    progress: ProgressView
    eta_seconds: EtaView
    seasons: list[SeasonView]
    frames: list[FrameView]
    stretch: StretchView
    alerts: list[AlertView]
    motion: MotionView | None
    motion_reason: str | None


def mjd_to_iso(mjd: float) -> str:
    return Time(mjd, format="mjd", scale="utc").isot[:19] + "Z"


def _alerts(alerts: list[Alert]) -> list[AlertView]:
    return [AlertView(code=a.code, severity=a.severity) for a in alerts]


def _season(season: Season) -> SeasonView:
    return SeasonView(
        id=season.id,
        start=mjd_to_iso(season.start_mjd),
        end=mjd_to_iso(season.end_mjd),
        n_exposures=season.n_exposures,
    )


def _frame(frame: Frame, image_url: Callable[[Frame], str]) -> FrameView:
    low, high = frame.wavelength_um
    return FrameView(
        id=frame.id,
        season_id=frame.season_id,
        detector=frame.detector,
        wavelength_um=(round(low, 4), round(high, 4)),
        mid_date=mjd_to_iso(frame.mid_mjd),
        status=frame.status,
        n_exposures_used=frame.n_exposures_used,
        n_exposures_available=frame.n_exposures_available,
        image_url=image_url(frame) if frame.status == FrameStatus.READY else None,
        alerts=_alerts(frame.alerts),
    )


def _eta(job: Job) -> EtaView:
    if job.eta_seconds is None:
        return EtaView(min=None, max=None)
    low, high = job.eta_seconds
    return EtaView(min=math.floor(low), max=math.ceil(high))


def _offset(dx: float, dy: float, ex: float, ey: float) -> OffsetView:
    total = math.hypot(dx, dy)
    total_err = math.hypot(dx * ex, dy * ey) / total if total > 0 else math.hypot(ex, ey)
    return OffsetView(
        dx_px=dx,
        dy_px=dy,
        dx_err_px=ex,
        dy_err_px=ey,
        east_arcsec=-dx * SPHEREX_PIXEL_ARCSEC,
        north_arcsec=dy * SPHEREX_PIXEL_ARCSEC,
        east_err_arcsec=ex * SPHEREX_PIXEL_ARCSEC,
        north_err_arcsec=ey * SPHEREX_PIXEL_ARCSEC,
        total_arcsec=total * SPHEREX_PIXEL_ARCSEC,
        total_err_arcsec=total_err * SPHEREX_PIXEL_ARCSEC,
    )


def _predicted(offset: tuple[float, float] | None) -> PredictedOffsetView | None:
    if offset is None:
        return None
    dx, dy = offset
    return PredictedOffsetView(
        dx_px=dx,
        dy_px=dy,
        east_arcsec=-dx * SPHEREX_PIXEL_ARCSEC,
        north_arcsec=dy * SPHEREX_PIXEL_ARCSEC,
        total_arcsec=math.hypot(dx, dy) * SPHEREX_PIXEL_ARCSEC,
    )


def _season_motion(season: SeasonMotion) -> SeasonMotionView:
    return SeasonMotionView(
        season_id=season.season_id,
        frame_id=season.frame_id,
        mid_date=mjd_to_iso(season.mid_mjd),
        epoch_date=mjd_to_iso(season.epoch_mjd),
        peak_snr=season.snr,
        drift_corrected=season.drift_corrected,
        offset=_offset(*season.offset_px, *season.offset_err_px),
        predicted_offset=_predicted(season.predicted_offset_px),
        residual_sigma=season.residual_sigma,
    )


def _catalog(comparison: CatalogComparison | None) -> CatalogView | None:
    if comparison is None:
        return None
    source = comparison.source
    return CatalogView(
        name=source.catalog,
        object=source.object,
        coordinates_source=source.coordinates_source,
        pmra_mas_yr=source.pmra_mas_yr,
        pmdec_mas_yr=source.pmdec_mas_yr,
        parallax_mas=source.parallax_mas,
        radial_velocity_km_s=source.radial_velocity_km_s,
        predicted_rate_arcsec_yr=comparison.predicted_rate_arcsec_yr,
        rate_residual_sigma=comparison.rate_residual_sigma,
    )


def _motion(motion: Motion | None) -> MotionView | None:
    if motion is None:
        return None
    return MotionView(
        detector=motion.detector,
        reference_season_id=motion.reference_season_id,
        seasons=[_season_motion(s) for s in motion.seasons],
        rate_arcsec_yr=RateView(value=motion.rate_arcsec_yr, error=motion.rate_err_arcsec_yr),
        catalog=_catalog(motion.prediction),
        catalog_reason=motion.prediction_reason,
    )


def job_view(job: Job, image_url: Callable[[Frame], str]) -> JobView:
    by_date = sorted(job.frames, key=lambda f: (f.mid_mjd, f.detector))
    return JobView(
        status=job.status,
        target=TargetView(
            ra=job.target.ra, dec=job.target.dec, fov_arcmin=job.target.fov_arcmin, name=job.target_name
        ),
        progress=ProgressView(frames_done=job.frames_done, frames_total=len(job.frames), percent=job.percent),
        eta_seconds=_eta(job),
        seasons=[_season(s) for s in job.seasons],
        frames=[_frame(f, image_url) for f in by_date],
        stretch=StretchView(
            fixed_from_frame=job.stretch_frame_id,
            by_detector={d: job.stretch_frames[d] for d in DETECTORS if d in job.stretch_frames},
        ),
        alerts=_alerts(job.alerts),
        motion=_motion(job.motion),
        motion_reason=job.motion_reason,
    )
