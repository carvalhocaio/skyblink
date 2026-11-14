import asyncio
import logging
import resource
import shutil
import time
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from skyblink.adapters.job_store import JobStore
from skyblink.adapters.png_renderer import render_png
from skyblink.domain.alerts import frame_alerts, job_alerts
from skyblink.domain.eta import estimate_eta
from skyblink.domain.grid import FrameGrid
from skyblink.domain.models import Exposure, Frame, FrameStatus, Job, JobStatus, Target
from skyblink.domain.planning import detector_priority, plan_frames
from skyblink.domain.stretch import StretchParams
from skyblink.services.discovery import ExposureSearch, discover_seasons
from skyblink.services.frame_builder import FrameImage, NoUsableExposures

logger = logging.getLogger(__name__)


class FrameSource(Protocol):
    async def build(self, exposures: Sequence[Exposure], target: Target, grid: FrameGrid) -> FrameImage: ...


def _no_summary() -> str:
    return ""


def peak_rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


@dataclass(frozen=True)
class RunnerLimits:
    max_active_jobs: int = 2
    max_stored_jobs: int = 200
    job_ttl_s: float = 6 * 3600


DEFAULT_LIMITS = RunnerLimits()


class JobRunner:
    def __init__(
        self,
        search: ExposureSearch,
        builder: FrameSource,
        store: JobStore,
        output_dir: Path,
        throttle_summary: Callable[[], str] = _no_summary,
        limits: RunnerLimits = DEFAULT_LIMITS,
        clock: Callable[[], float] = time.time,
    ):
        self._search = search
        self._builder = builder
        self._store = store
        self._output_dir = output_dir
        self._throttle_summary = throttle_summary
        self._limits = limits
        self._clock = clock
        self._active = asyncio.Semaphore(limits.max_active_jobs)
        self._tasks: set[asyncio.Task[None]] = set()

    def submit(self, target: Target, detectors: Sequence[str] | None, max_exposures_per_frame: int) -> Job:
        job = Job(
            id=uuid.uuid4().hex[:12],
            target=target,
            detectors=tuple(dict.fromkeys(detectors)) if detectors else None,
            max_exposures_per_frame=max_exposures_per_frame,
            created_at=self._clock(),
        )
        existing = self._store.find_reusable(job.key)
        if existing is not None:
            return existing
        self._evict_old_jobs()
        self._store.add(job)
        task = asyncio.create_task(self.run(job))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return job

    async def shutdown(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    def _evict_old_jobs(self) -> None:
        evicted = self._store.evict(self._clock(), self._limits.max_stored_jobs, self._limits.job_ttl_s)
        for job in evicted:
            shutil.rmtree(self._output_dir / job.id, ignore_errors=True)
        if evicted:
            logger.info("evicted %d old jobs, %d kept", len(evicted), len(self._store))

    async def run(self, job: Job) -> None:
        try:
            async with self._active:
                started = time.perf_counter()
                await self._run(job)
            logger.info(
                "job %s %s in %.0fs, peak RSS %.0f MB",
                job.id,
                job.status,
                time.perf_counter() - started,
                peak_rss_mb(),
            )
        except asyncio.CancelledError:
            job.status = JobStatus.FAILED
            raise
        except Exception:
            logger.exception("job %s failed", job.id)
            job.status = JobStatus.FAILED

    async def _run(self, job: Job) -> None:
        job.status = JobStatus.DISCOVERING
        job.seasons = await discover_seasons(self._search, job.target, job.detectors)
        job.alerts = job_alerts(job.seasons)
        job.frames = plan_frames(job.id, job.seasons, job.detectors, job.max_exposures_per_frame)
        job.primary_detector = next(iter(detector_priority(job.seasons, job.detectors)), None)
        self._store.register_frames(job)
        job.eta_seconds = estimate_eta([], job.remaining_exposures)
        job.status = JobStatus.BUILDING
        grid = FrameGrid.centered_on(job.target)
        for frame in job.frames:
            await self._build_frame(job, frame, grid)
            job.eta_seconds = estimate_eta(_timing_samples(job), job.remaining_exposures)
            logger.info(
                "job %s: %d/%d frames, eta %.0f-%.0fs. %s",
                job.id,
                job.frames_done,
                len(job.frames),
                *job.eta_seconds,
                self._throttle_summary(),
            )
        job.status = JobStatus.DONE

    async def _build_frame(self, job: Job, frame: Frame, grid: FrameGrid) -> None:
        try:
            image = await self._builder.build(frame.exposures, job.target, grid)
            stretch = job.stretches.get(frame.detector) or StretchParams.from_image(image.image)
            path = self._output_dir / job.id / f"{frame.id}.png"
            await asyncio.to_thread(render_png, image.image, stretch, path)
        except NoUsableExposures as error:
            logger.warning("frame %s has no usable exposure: %s", frame.id, error)
            frame.status = FrameStatus.FAILED
            return
        except Exception:
            logger.exception("frame %s failed", frame.id)
            frame.status = FrameStatus.FAILED
            return
        if frame.detector not in job.stretches:
            job.stretches[frame.detector] = stretch
            job.stretch_frames[frame.detector] = frame.id
        frame.image_path = path
        frame.n_exposures_used = image.n_exposures_used
        frame.download_s, frame.assembly_s = image.download_s, image.assembly_s
        frame.alerts = frame_alerts(image.n_exposures_used, image.saturated_core_exposures)
        frame.status = FrameStatus.READY


def _timing_samples(job: Job) -> list[tuple[float, int]]:
    return [
        (frame.download_s + frame.assembly_s, len(frame.exposures))
        for frame in job.frames
        if frame.status == FrameStatus.READY
    ]
