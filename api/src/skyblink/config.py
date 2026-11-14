import os
from dataclasses import dataclass
from pathlib import Path

from skyblink.adapters.http_retry import RetryPolicy


def _env(name: str, default: str) -> str:
    return os.environ.get(f"SKYBLINK_{name}", default)


@dataclass(frozen=True)
class Settings:
    cache_dir: Path
    output_dir: Path
    max_concurrency: int
    fallback_concurrency: int
    max_unavailable_ratio: float
    min_requests_for_fallback: int
    retry: RetryPolicy
    cors_origins: tuple[str, ...]

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            cache_dir=Path(_env("CACHE_DIR", ".cache/cutouts")),
            output_dir=Path(_env("OUTPUT_DIR", "out")),
            max_concurrency=int(_env("MAX_CONCURRENCY", "8")),
            fallback_concurrency=int(_env("FALLBACK_CONCURRENCY", "6")),
            max_unavailable_ratio=float(_env("MAX_503_RATIO", "0.2")),
            min_requests_for_fallback=int(_env("MIN_REQUESTS_FOR_FALLBACK", "20")),
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
        )
