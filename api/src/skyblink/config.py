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
    retry: RetryPolicy
    cors_origins: tuple[str, ...]

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            cache_dir=Path(_env("CACHE_DIR", ".cache/cutouts")),
            output_dir=Path(_env("OUTPUT_DIR", "out")),
            max_concurrency=int(_env("MAX_CONCURRENCY", "4")),
            retry=RetryPolicy(
                attempts=int(_env("RETRY_ATTEMPTS", "5")),
                base_delay_s=float(_env("RETRY_BASE_DELAY_S", "2")),
                request_timeout_s=float(_env("REQUEST_TIMEOUT_S", "60")),
            ),
            cors_origins=tuple(_env("CORS_ORIGINS", "*").split(",")),
        )
