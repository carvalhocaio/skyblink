from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import TYPE_CHECKING

from skyblink.domain.stretch import StretchParams

if TYPE_CHECKING:
    from skyblink.domain.motion import Motion

DETECTORS = ("D1", "D2", "D3", "D4", "D5", "D6")


class JobStatus(StrEnum):
    QUEUED = "queued"
    DISCOVERING = "discovering"
    BUILDING = "building"
    DONE = "done"
    FAILED = "failed"


class FrameStatus(StrEnum):
    PENDING = "pending"
    READY = "ready"
    FAILED = "failed"


class AlertCode(StrEnum):
    NO_COVERAGE = "NO_COVERAGE"
    SINGLE_SEASON = "SINGLE_SEASON"
    FEW_EXPOSURES = "FEW_EXPOSURES"
    SATURATED_CORE = "SATURATED_CORE"
    ALIGNMENT_DRIFT = "ALIGNMENT_DRIFT"


@dataclass(frozen=True)
class Alert:
    code: AlertCode
    severity: str


@dataclass(frozen=True)
class Target:
    ra: float
    dec: float
    fov_arcmin: float = 6.0

    @property
    def fov_deg(self) -> float:
        return self.fov_arcmin / 60.0


@dataclass(frozen=True)
class Exposure:
    obs_id: str
    detector: str
    mjd: float
    wavelength_um: tuple[float, float]
    access_url: str
    collection: str


@dataclass(frozen=True)
class Season:
    id: int
    exposures: tuple[Exposure, ...]

    @property
    def start_mjd(self) -> float:
        return self.exposures[0].mjd

    @property
    def end_mjd(self) -> float:
        return self.exposures[-1].mjd

    @property
    def n_exposures(self) -> int:
        return len(self.exposures)

    def for_detector(self, detector: str) -> tuple[Exposure, ...]:
        return tuple(e for e in self.exposures if e.detector == detector)


@dataclass
class Frame:
    id: str
    season_id: int
    detector: str
    exposures: tuple[Exposure, ...]
    n_exposures_available: int
    status: FrameStatus = FrameStatus.PENDING
    n_exposures_used: int = 0
    alerts: list[Alert] = field(default_factory=list)
    image_path: Path | None = None
    download_s: float = 0.0
    assembly_s: float = 0.0

    @property
    def mid_mjd(self) -> float:
        return (self.exposures[0].mjd + self.exposures[-1].mjd) / 2

    @property
    def wavelength_um(self) -> tuple[float, float]:
        return (
            min(e.wavelength_um[0] for e in self.exposures),
            max(e.wavelength_um[1] for e in self.exposures),
        )


@dataclass
class Job:
    id: str
    target: Target
    detectors: tuple[str, ...] | None
    max_exposures_per_frame: int
    target_name: str | None = None
    status: JobStatus = JobStatus.QUEUED
    seasons: list[Season] = field(default_factory=list)
    frames: list[Frame] = field(default_factory=list)
    alerts: list[Alert] = field(default_factory=list)
    primary_detector: str | None = None
    stretches: dict[str, StretchParams] = field(default_factory=dict)
    stretch_frames: dict[str, str] = field(default_factory=dict)
    eta_seconds: tuple[float, float] | None = None
    created_at: float = 0.0
    motion: "Motion | None" = None
    motion_reason: str | None = None

    @property
    def key(self) -> tuple:
        return (
            self.target.ra,
            self.target.dec,
            self.target.fov_arcmin,
            self.detectors,
            self.max_exposures_per_frame,
            self.target_name,
        )

    @property
    def stretch_frame_id(self) -> str | None:
        return self.stretch_frames.get(self.primary_detector) if self.primary_detector else None

    @property
    def finished(self) -> bool:
        return self.status in (JobStatus.DONE, JobStatus.FAILED)

    @property
    def frames_done(self) -> int:
        return sum(1 for frame in self.frames if frame.status != FrameStatus.PENDING)

    @property
    def percent(self) -> int:
        if self.status == JobStatus.DONE:
            return 100
        return int(100 * self.frames_done / len(self.frames)) if self.frames else 0

    @property
    def remaining_exposures(self) -> int:
        return sum(len(f.exposures) for f in self.frames if f.status == FrameStatus.PENDING)
