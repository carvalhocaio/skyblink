import dataclasses
from pathlib import Path
from typing import Any

from skyblink.domain.models import (
    Alert,
    AlertCode,
    Exposure,
    Frame,
    FrameStatus,
    Job,
    JobStatus,
    Season,
    Target,
)
from skyblink.domain.stretch import StretchParams


def exposure_to_dict(exposure: Exposure) -> dict[str, Any]:
    return dataclasses.asdict(exposure)


def exposure_from_dict(data: dict[str, Any]) -> Exposure:
    return Exposure(**{**data, "wavelength_um": tuple(data["wavelength_um"])})


def _alerts_to_list(alerts: list[Alert]) -> list[dict[str, str]]:
    return [{"code": alert.code.value, "severity": alert.severity} for alert in alerts]


def _alerts_from_list(items: list[dict[str, str]]) -> list[Alert]:
    return [Alert(code=AlertCode(item["code"]), severity=item["severity"]) for item in items]


def _frame_to_dict(frame: Frame) -> dict[str, Any]:
    return {
        "id": frame.id,
        "season_id": frame.season_id,
        "detector": frame.detector,
        "exposures": [exposure_to_dict(e) for e in frame.exposures],
        "n_exposures_available": frame.n_exposures_available,
        "status": frame.status.value,
        "n_exposures_used": frame.n_exposures_used,
        "alerts": _alerts_to_list(frame.alerts),
        "download_s": frame.download_s,
        "assembly_s": frame.assembly_s,
    }


def _frame_from_dict(data: dict[str, Any], png_dir: Path) -> Frame:
    frame = Frame(
        id=data["id"],
        season_id=data["season_id"],
        detector=data["detector"],
        exposures=tuple(exposure_from_dict(e) for e in data["exposures"]),
        n_exposures_available=data["n_exposures_available"],
        status=FrameStatus(data["status"]),
        n_exposures_used=data["n_exposures_used"],
        alerts=_alerts_from_list(data["alerts"]),
        download_s=data["download_s"],
        assembly_s=data["assembly_s"],
    )
    if frame.status == FrameStatus.READY:
        frame.image_path = png_dir / f"{frame.id}.png"
    return frame


def job_to_dict(job: Job) -> dict[str, Any]:
    return {
        "id": job.id,
        "target": dataclasses.asdict(job.target),
        "detectors": list(job.detectors) if job.detectors else None,
        "max_exposures_per_frame": job.max_exposures_per_frame,
        "status": job.status.value,
        "seasons": [
            {"id": s.id, "exposures": [exposure_to_dict(e) for e in s.exposures]} for s in job.seasons
        ],
        "frames": [_frame_to_dict(f) for f in job.frames],
        "alerts": _alerts_to_list(job.alerts),
        "primary_detector": job.primary_detector,
        "stretches": {d: dataclasses.asdict(s) for d, s in job.stretches.items()},
        "stretch_frames": dict(job.stretch_frames),
    }


def job_from_dict(data: dict[str, Any], png_dir: Path, created_at: float) -> Job:
    return Job(
        id=data["id"],
        target=Target(**data["target"]),
        detectors=tuple(data["detectors"]) if data["detectors"] else None,
        max_exposures_per_frame=data["max_exposures_per_frame"],
        status=JobStatus(data["status"]),
        seasons=[
            Season(id=s["id"], exposures=tuple(exposure_from_dict(e) for e in s["exposures"]))
            for s in data["seasons"]
        ],
        frames=[_frame_from_dict(f, png_dir) for f in data["frames"]],
        alerts=_alerts_from_list(data["alerts"]),
        primary_detector=data["primary_detector"],
        stretches={d: StretchParams(**s) for d, s in data["stretches"].items()},
        stretch_frames=dict(data["stretch_frames"]),
        eta_seconds=(0.0, 0.0),
        created_at=created_at,
    )
