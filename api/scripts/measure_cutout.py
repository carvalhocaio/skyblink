import argparse
import asyncio
import statistics
import time

import httpx

from skyblink.adapters.http_retry import RETRYABLE_STATUS
from skyblink.adapters.irsa_cutouts import cutout_url
from skyblink.adapters.irsa_sia import SiaClient
from skyblink.config import Settings
from skyblink.domain.models import Exposure, Target

BARNARD_2026 = Target(ra=269.4464, dec=4.7668)


def spread(exposures: list[Exposure], count: int) -> list[Exposure]:
    step = max(1, len(exposures) // count)
    return exposures[::step][:count]


async def time_until_success(
    client: httpx.AsyncClient, url: str, attempts: int, timeout_s: float
) -> tuple[float | None, int, int]:
    retries = 0
    for _ in range(attempts):
        started = time.perf_counter()
        try:
            async with asyncio.timeout(timeout_s):
                response = await client.get(url)
        except (httpx.TransportError, TimeoutError):
            retries += 1
            continue
        elapsed = time.perf_counter() - started
        if response.status_code in RETRYABLE_STATUS:
            retries += 1
            await asyncio.sleep(3)
            continue
        return elapsed, retries, len(response.content)
    return None, retries, 0


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ra", type=float, default=BARNARD_2026.ra)
    parser.add_argument("--dec", type=float, default=BARNARD_2026.dec)
    parser.add_argument("--fov-arcmin", type=float, default=BARNARD_2026.fov_arcmin)
    parser.add_argument("--detector", default="D6")
    parser.add_argument("--samples", type=int, default=5)
    args = parser.parse_args()
    settings = Settings.from_env()
    target = Target(args.ra, args.dec, args.fov_arcmin)
    size_deg = round(target.fov_deg * 2**0.5, 4)

    async with httpx.AsyncClient(timeout=settings.retry.request_timeout_s) as client:
        started = time.perf_counter()
        exposures = await SiaClient(client, settings.retry).search(target)
        print(f"SIA dr1+qr3: {len(exposures)} exposures in {time.perf_counter() - started:.1f}s")
        chosen = spread([e for e in exposures if e.detector == args.detector], args.samples)
        durations: list[float] = []
        for exposure in chosen:
            url = cutout_url(exposure, target.ra, target.dec, size_deg)
            elapsed, retries, size = await time_until_success(
                client, url, settings.retry.attempts, settings.retry.request_timeout_s
            )
            label = f"{elapsed:.2f}s" if elapsed is not None else "FAILED"
            print(f"  {exposure.obs_id} {exposure.collection}: {label} retries={retries} bytes={size}")
            if elapsed is not None:
                durations.append(elapsed)
    if durations:
        print(f"median cutout time ({len(durations)} ok): {statistics.median(durations):.2f}s")


if __name__ == "__main__":
    asyncio.run(main())
