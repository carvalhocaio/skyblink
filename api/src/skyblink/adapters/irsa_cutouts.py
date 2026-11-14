import asyncio
from pathlib import Path

import httpx

from skyblink.adapters.cutout_cache import CutoutCache, CutoutKey
from skyblink.adapters.http_retry import RetryPolicy, get_with_retry
from skyblink.domain.models import Exposure

FITS_SIGNATURE = b"SIMPLE"
NO_OVERLAP_MARKER = "overlap"


class CutoutError(Exception):
    pass


def cutout_url(exposure: Exposure, ra: float, dec: float, size_deg: float) -> str:
    return f"{exposure.access_url}?center={ra},{dec}&size={size_deg}"


def is_no_overlap(response: httpx.Response) -> bool:
    return not response.content.startswith(FITS_SIGNATURE) and NO_OVERLAP_MARKER in response.text.lower()


class CutoutClient:
    def __init__(
        self,
        client: httpx.AsyncClient,
        policy: RetryPolicy,
        cache: CutoutCache,
        max_concurrency: int,
    ):
        self._client = client
        self._policy = policy
        self._cache = cache
        self._semaphore = asyncio.Semaphore(max_concurrency)

    async def fetch(self, exposure: Exposure, ra: float, dec: float, size_deg: float) -> Path | None:
        key = CutoutKey(exposure.obs_id, exposure.detector, ra, dec, size_deg)
        cached = self._cache.get(key)
        if cached is not None:
            return cached.path
        async with self._semaphore:
            response = await get_with_retry(
                self._client, cutout_url(exposure, ra, dec, size_deg), self._policy
            )
        if is_no_overlap(response):
            self._cache.mark_no_coverage(key)
            return None
        if response.status_code != 200 or not response.content.startswith(FITS_SIGNATURE):
            raise CutoutError(f"{exposure.obs_id} {exposure.detector}: HTTP {response.status_code}")
        return self._cache.put(key, response.content)
