import hashlib
import json
import logging
import os
import shutil
import tempfile
from pathlib import Path

from skyblink.adapters.serialization import job_from_dict, job_to_dict
from skyblink.domain.models import FrameStatus, Job, JobStatus
from skyblink.domain.version import PIPELINE_VERSION

logger = logging.getLogger(__name__)

JOB_FILE = "job.json"


def is_persistable(job: Job) -> bool:
    return (
        job.status == JobStatus.DONE
        and bool(job.frames)
        and all(f.status == FrameStatus.READY for f in job.frames)
    )


class ResultStore:
    def __init__(self, root: Path, pipeline_version: str = PIPELINE_VERSION):
        self._root = root
        self._version = pipeline_version
        (self._root / "by_key").mkdir(parents=True, exist_ok=True)

    def _index(self, key: tuple) -> Path:
        digest = hashlib.sha256(json.dumps([self._version, *key]).encode()).hexdigest()
        return self._root / "by_key" / digest

    def save(self, job: Job) -> Path:
        directory = self._root / job.id
        directory.mkdir(parents=True, exist_ok=True)
        for frame in job.frames:
            if frame.image_path is not None and frame.image_path.parent != directory:
                shutil.copyfile(frame.image_path, directory / f"{frame.id}.png")
        _write_atomically(directory / JOB_FILE, json.dumps(job_to_dict(job)))
        _write_atomically(self._index(job.key), job.id)
        return directory

    def load(self, key: tuple, created_at: float) -> Job | None:
        try:
            job_id = self._index(key).read_text().strip()
            data = json.loads((self._root / job_id / JOB_FILE).read_text())
        except (FileNotFoundError, ValueError):
            return None
        job = job_from_dict(data, self._root / job_id, created_at)
        missing = [f.id for f in job.frames if f.image_path is not None and not f.image_path.exists()]
        if missing:
            logger.warning("persisted result %s is missing %d PNGs; ignoring it", job_id, len(missing))
            return None
        return job


def _write_atomically(target: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".part")
    with os.fdopen(fd, "w") as handle:
        handle.write(text)
    os.replace(tmp, target)
