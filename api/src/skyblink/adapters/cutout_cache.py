import hashlib
import logging
import os
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path

from skyblink.adapters.fits_compaction import compact_fits, is_compact

logger = logging.getLogger(__name__)

NO_COVERAGE_SUFFIX = ".nocoverage"
ENTRY_SUFFIXES = (".fits", NO_COVERAGE_SUFFIX)
COMPACT_MARKER = ".compact-v1"
LOW_WATERMARK = 0.9


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


@dataclass(frozen=True)
class CompactionReport:
    files: int
    compacted: int
    bytes_before: int
    bytes_after: int
    skipped: bool = False


class CutoutCache:
    def __init__(self, root: Path, max_bytes: int | None = None):
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)
        self._max_bytes = max_bytes
        self._lock = threading.Lock()
        self._total = sum(_size(path) for path in self._entries())

    @property
    def total_bytes(self) -> int:
        return self._total

    def _entries(self) -> list[Path]:
        return [p for p in self._root.rglob("*") if p.suffix in ENTRY_SUFFIXES and p.is_file()]

    def _base(self, key: CutoutKey) -> Path:
        digest = key.digest()
        return self._root / digest[:2] / digest

    def get(self, key: CutoutKey) -> CachedCutout | None:
        base = self._base(key)
        for path, cached in (
            (base.with_suffix(".fits"), True),
            (base.with_suffix(NO_COVERAGE_SUFFIX), False),
        ):
            if path.exists():
                _touch(path)
                return CachedCutout(path if cached else None)
        return None

    def put(self, key: CutoutKey, content: bytes) -> Path:
        target = self._base(key).with_suffix(".fits")
        previous = _size(target)
        _write_atomically(target, content)
        with self._lock:
            self._total += len(content) - previous
        self._enforce_limit()
        return target

    def mark_no_coverage(self, key: CutoutKey) -> None:
        _write_atomically(self._base(key).with_suffix(NO_COVERAGE_SUFFIX), b"")

    def _enforce_limit(self) -> None:
        if self._max_bytes is not None and self._total > self._max_bytes:
            self.evict_to(int(self._max_bytes * LOW_WATERMARK))

    def evict_to(self, target_bytes: int) -> int:
        with self._lock:
            entries = sorted(self._entries(), key=_mtime)
            removed = freed = 0
            for path in entries:
                if self._total <= target_bytes:
                    break
                size = _size(path)
                path.unlink(missing_ok=True)
                self._total -= size
                removed, freed = removed + 1, freed + size
        if removed:
            logger.info(
                "cache eviction: removed %d files (%.1f MB), %.1f MB kept",
                removed,
                freed / 1e6,
                self._total / 1e6,
            )
        return removed

    def compact_all(self) -> CompactionReport:
        marker = self._root / COMPACT_MARKER
        if marker.exists():
            return CompactionReport(0, 0, 0, 0, skipped=True)
        files = compacted = before = after = 0
        for path in sorted(self._root.rglob("*.fits")):
            try:
                size = _size(path)
                files, before = files + 1, before + size
                if is_compact(path):
                    after += size
                    continue
                stat = path.stat()
                content = compact_fits(path.read_bytes())
                _write_atomically(path, content)
                os.utime(path, (stat.st_atime, stat.st_mtime))
                compacted, after = compacted + 1, after + len(content)
            except FileNotFoundError:
                continue
        marker.write_text("IMAGE FLAGS VARIANCE ZODI WCS-WAVE\n")
        with self._lock:
            self._total = sum(_size(path) for path in self._entries())
        report = CompactionReport(files, compacted, before, after)
        logger.info(
            "cache compaction: %d/%d files compacted, %.1f MB -> %.1f MB (%.0f KB -> %.0f KB per cutout)",
            compacted,
            files,
            before / 1e6,
            after / 1e6,
            before / max(files, 1) / 1e3,
            after / max(files, 1) / 1e3,
        )
        return report


def _size(path: Path) -> int:
    try:
        return path.stat().st_size
    except FileNotFoundError:
        return 0


def _mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except FileNotFoundError:
        return 0.0


def _touch(path: Path) -> None:
    try:
        os.utime(path)
    except OSError:
        pass


def _write_atomically(target: Path, content: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".part")
    with os.fdopen(fd, "wb") as handle:
        handle.write(content)
    os.replace(tmp, target)
