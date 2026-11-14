from skyblink.domain.models import Frame, Job, JobStatus


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._frames: dict[str, Frame] = {}

    def __len__(self) -> int:
        return len(self._jobs)

    def add(self, job: Job) -> None:
        self._jobs[job.id] = job

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def find_reusable(self, key: tuple) -> Job | None:
        for job in reversed(self._jobs.values()):
            if job.key == key and job.status != JobStatus.FAILED:
                return job
        return None

    def register_frames(self, job: Job) -> None:
        self._frames.update({frame.id: frame for frame in job.frames})

    def frame(self, frame_id: str) -> Frame | None:
        return self._frames.get(frame_id)

    def evict(self, now: float, max_jobs: int, max_age_s: float) -> list[Job]:
        expired = [job for job in self._jobs.values() if job.finished and now - job.created_at > max_age_s]
        for job in expired:
            self._remove(job)
        surplus = len(self._jobs) - max_jobs
        oldest_finished = [job for job in self._jobs.values() if job.finished][: max(surplus, 0)]
        for job in oldest_finished:
            self._remove(job)
        return expired + oldest_finished

    def _remove(self, job: Job) -> None:
        del self._jobs[job.id]
        for frame in job.frames:
            self._frames.pop(frame.id, None)
