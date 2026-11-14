import math
from collections.abc import Callable
from typing import Literal

from astropy.time import Time
from pydantic import BaseModel, Field

from skyblink.domain.models import Alert, Frame, FrameStatus, Job, Season

Detector = Literal["D1", "D2", "D3", "D4", "D5", "D6"]


class JobRequest(BaseModel):
    ra: float = Field(ge=0, le=360)
    dec: float = Field(ge=-90, le=90)
    fov_arcmin: float = Field(default=6, ge=1, le=30)
    detectors: list[Detector] | None = Field(default=None, min_length=1)
    max_exposures_per_frame: int = Field(default=30, ge=1)


class JobCreated(BaseModel):
    job_id: str
    status: str


class TargetView(BaseModel):
    ra: float
    dec: float
    fov_arcmin: float


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


class JobView(BaseModel):
    status: str
    target: TargetView
    progress: ProgressView
    eta_seconds: EtaView
    seasons: list[SeasonView]
    frames: list[FrameView]
    stretch: StretchView
    alerts: list[AlertView]


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


def job_view(job: Job, image_url: Callable[[Frame], str]) -> JobView:
    by_date = sorted(job.frames, key=lambda f: (f.mid_mjd, f.detector))
    return JobView(
        status=job.status,
        target=TargetView(ra=job.target.ra, dec=job.target.dec, fov_arcmin=job.target.fov_arcmin),
        progress=ProgressView(frames_done=job.frames_done, frames_total=len(job.frames), percent=job.percent),
        eta_seconds=_eta(job),
        seasons=[_season(s) for s in job.seasons],
        frames=[_frame(f, image_url) for f in by_date],
        stretch=StretchView(fixed_from_frame=job.stretch_frame_id),
        alerts=_alerts(job.alerts),
    )
