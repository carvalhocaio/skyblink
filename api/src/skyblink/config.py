import os
from dataclasses import dataclass
from pathlib import Path

from skyblink.adapters.http_retry import RetryPolicy


def _env(name: str, default: str) -> str:
    return os.environ.get(f"SKYBLINK_{name}", default)


@dataclass(frozen=True)
class Settings:
    cache_dir: Path
    cache_max_bytes: int
    discovery_dir: Path
    discovery_ttl_s: float
    output_dir: Path
    max_concurrency: int
    fallback_concurrency: int
    max_unavailable_ratio: float
    min_requests_for_fallback: int
    max_active_jobs: int
    max_stored_jobs: int
    job_ttl_s: float
    retry: RetryPolicy
    cors_origins: tuple[str, ...]
    cors_origin_regex: str | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            cache_dir=Path(_env("CACHE_DIR", ".cache/cutouts")),
            cache_max_bytes=int(float(_env("CACHE_MAX_GB", "8")) * 1e9),
            discovery_dir=Path(_env("DISCOVERY_DIR", ".cache/discovery")),
            discovery_ttl_s=float(_env("DISCOVERY_TTL", "24")) * 3600,
            output_dir=Path(_env("OUTPUT_DIR", "out")),
            max_concurrency=int(_env("MAX_CONCURRENCY", "6")),
            fallback_concurrency=int(_env("FALLBACK_CONCURRENCY", "4")),
            max_unavailable_ratio=float(_env("MAX_503_RATIO", "0.2")),
            min_requests_for_fallback=int(_env("MIN_REQUESTS_FOR_FALLBACK", "20")),
            max_active_jobs=int(_env("MAX_ACTIVE_JOBS", "2")),
            max_stored_jobs=int(_env("MAX_STORED_JOBS", "200")),
            job_ttl_s=float(_env("JOB_TTL_HOURS", "6")) * 3600,
            retry=RetryPolicy(
                attempts=int(_env("RETRY_ATTEMPTS", "5")),
                base_delay_s=float(_env("RETRY_BASE_DELAY_S", "2")),
                request_timeout_s=float(_env("REQUEST_TIMEOUT_S", "60")),
            ),
            cors_origins=tuple(
                origin.strip()
                for origin in _env("CORS_ORIGINS", "http://localhost:3000").split(",")
                if origin.strip()
            ),
            cors_origin_regex=_env("CORS_ORIGIN_REGEX", "").strip() or None,
        )
