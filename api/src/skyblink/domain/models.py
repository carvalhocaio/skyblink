from dataclasses import dataclass, field
from enum import StrEnum


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

    @property
    def mid_mjd(self) -> float:
        return (self.exposures[0].mjd + self.exposures[-1].mjd) / 2

    @property
    def wavelength_um(self) -> tuple[float, float]:
        return (
            min(e.wavelength_um[0] for e in self.exposures),
            max(e.wavelength_um[1] for e in self.exposures),
        )
