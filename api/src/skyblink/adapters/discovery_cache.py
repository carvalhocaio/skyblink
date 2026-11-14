import hashlib
import json
import logging
import os
import tempfile
import time
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Protocol

import httpx

from skyblink.adapters.http_retry import UpstreamUnavailable
from skyblink.adapters.irsa_sia import SiaError
from skyblink.adapters.serialization import exposure_from_dict, exposure_to_dict
from skyblink.domain.models import Exposure, Target

logger = logging.getLogger(__name__)

SEARCH_FAILURES = (UpstreamUnavailable, SiaError, httpx.HTTPError)


class ExposureSearch(Protocol):
    async def search(self, target: Target) -> list[Exposure]: ...


class CachedExposureSearch:
    def __init__(
        self,
        inner: ExposureSearch,
        root: Path,
        ttl_s: float,
        collections: Sequence[str],
        clock: Callable[[], float] = time.time,
    ):
        self._inner = inner
        self._root = root
        self._ttl_s = ttl_s
        self._collections = tuple(collections)
        self._clock = clock
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, target: Target) -> Path:
        key = [
            round(target.ra, 6),
            round(target.dec, 6),
            round(target.fov_arcmin, 3),
            list(self._collections),
        ]
        return self._root / f"{hashlib.sha256(json.dumps(key).encode()).hexdigest()}.json"

    def _load(self, path: Path) -> tuple[float, list[Exposure]] | None:
        try:
            data = json.loads(path.read_text())
        except (FileNotFoundError, ValueError):
            return None
        return data["fetched_at"], [exposure_from_dict(e) for e in data["exposures"]]

    def _save(self, path: Path, exposures: list[Exposure]) -> None:
        payload = {"fetched_at": self._clock(), "exposures": [exposure_to_dict(e) for e in exposures]}
        fd, tmp = tempfile.mkstemp(dir=self._root, suffix=".part")
        with os.fdopen(fd, "w") as handle:
            json.dump(payload, handle)
        os.replace(tmp, path)

    async def search(self, target: Target) -> list[Exposure]:
        path = self._path(target)
        cached = self._load(path)
        if cached is not None:
            age = self._clock() - cached[0]
            if age < self._ttl_s:
                logger.info("discovery cache hit (%.1f h old), no SIA call", age / 3600)
                return cached[1]
        logger.info("SIA query for (%.4f, %+.4f)", target.ra, target.dec)
        try:
            exposures = await self._inner.search(target)
        except SEARCH_FAILURES as error:
            if cached is None:
                raise
            logger.warning(
                "SIA unavailable (%s); using cached discovery from %.1f h ago",
                error,
                (self._clock() - cached[0]) / 3600,
            )
            return cached[1]
        self._save(path, exposures)
        return exposures
