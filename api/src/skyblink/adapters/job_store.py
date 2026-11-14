from skyblink.domain.models import Frame, Job


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._frames: dict[str, Frame] = {}

    def add(self, job: Job) -> None:
        self._jobs[job.id] = job

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def register_frames(self, job: Job) -> None:
        self._frames.update({frame.id: frame for frame in job.frames})

    def frame(self, frame_id: str) -> Frame | None:
        return self._frames.get(frame_id)
