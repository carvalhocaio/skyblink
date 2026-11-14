import hashlib
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

NO_COVERAGE_SUFFIX = ".nocoverage"


@dataclass(frozen=True)
class CutoutKey:
    obs_id: str
    detector: str
    ra: float
    dec: float
    size_deg: float

    def digest(self) -> str:
        raw = f"{self.obs_id}|{self.detector}|{self.ra:.6f}|{self.dec:.6f}|{self.size_deg:.6f}"
        return hashlib.sha256(raw.encode()).hexdigest()


@dataclass(frozen=True)
class CachedCutout:
    path: Path | None


class CutoutCache:
    def __init__(self, root: Path):
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)

    def _base(self, key: CutoutKey) -> Path:
        digest = key.digest()
        return self._root / digest[:2] / digest

    def get(self, key: CutoutKey) -> CachedCutout | None:
        base = self._base(key)
        fits_path = base.with_suffix(".fits")
        if fits_path.exists():
            return CachedCutout(fits_path)
        if base.with_suffix(NO_COVERAGE_SUFFIX).exists():
            return CachedCutout(None)
        return None

    def put(self, key: CutoutKey, content: bytes) -> Path:
        target = self._base(key).with_suffix(".fits")
        self._write_atomically(target, content)
        return target

    def mark_no_coverage(self, key: CutoutKey) -> None:
        self._write_atomically(self._base(key).with_suffix(NO_COVERAGE_SUFFIX), b"")

    @staticmethod
    def _write_atomically(target: Path, content: bytes) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".part")
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
        os.replace(tmp, target)
