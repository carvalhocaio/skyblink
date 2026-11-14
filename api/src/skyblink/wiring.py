import httpx

from skyblink.adapters.cutout_cache import CutoutCache
from skyblink.adapters.irsa_cutouts import CutoutClient
from skyblink.adapters.irsa_sia import SiaClient
from skyblink.adapters.throttle import ConcurrencyGovernor
from skyblink.config import Settings


def http_client(settings: Settings) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=settings.retry.request_timeout_s)


def sia_client(client: httpx.AsyncClient, settings: Settings) -> SiaClient:
    return SiaClient(client, settings.retry)


def cutout_client(client: httpx.AsyncClient, settings: Settings) -> CutoutClient:
    governor = ConcurrencyGovernor(
        limit=settings.max_concurrency,
        fallback_limit=settings.fallback_concurrency,
        max_unavailable_ratio=settings.max_unavailable_ratio,
        min_requests=settings.min_requests_for_fallback,
    )
    return CutoutClient(client, settings.retry, CutoutCache(settings.cache_dir), governor)
