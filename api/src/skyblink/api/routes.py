from dataclasses import dataclass

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import FileResponse

from skyblink.adapters.job_store import JobStore
from skyblink.api.schemas import JobCreated, JobRequest, JobView, job_view
from skyblink.domain.models import Frame, FrameStatus, Target
from skyblink.services.job_runner import JobRunner

router = APIRouter()


@dataclass(frozen=True)
class Services:
    store: JobStore
    runner: JobRunner


def _services(request: Request) -> Services:
    return request.app.state.services


@router.post("/jobs", status_code=status.HTTP_202_ACCEPTED, response_model=JobCreated)
async def create_job(body: JobRequest, request: Request) -> JobCreated:
    job = _services(request).runner.submit(
        Target(ra=body.ra, dec=body.dec, fov_arcmin=body.fov_arcmin),
        body.detectors,
        body.max_exposures_per_frame,
    )
    return JobCreated(job_id=job.id, status=job.status)


@router.get("/jobs/{job_id}", response_model=JobView)
async def get_job(job_id: str, request: Request) -> JobView:
    job = _services(request).store.get(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")

    def image_url(frame: Frame) -> str:
        return str(request.url_for("get_frame_png", frame_id=frame.id))

    return job_view(job, image_url)


@router.get("/frames/{frame_id}.png", name="get_frame_png")
async def get_frame_png(frame_id: str, request: Request) -> FileResponse:
    frame = _services(request).store.frame(frame_id)
    if frame is None or frame.status != FrameStatus.READY or frame.image_path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "frame not available")
    return FileResponse(frame.image_path, media_type="image/png")
