import asyncio
import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import httpx

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class UpstreamUnavailable(Exception):
    pass


@dataclass(frozen=True)
class RetryPolicy:
    attempts: int = 5
    base_delay_s: float = 2.0
    max_delay_s: float = 30.0
    request_timeout_s: float = 60.0

    def delay(self, attempt: int) -> float:
        backoff = min(self.max_delay_s, self.base_delay_s * 2**attempt)
        return backoff * random.uniform(0.75, 1.25)


Sleep = Callable[[float], Awaitable[None]]
Observer = Callable[[int | None], None]


def _ignore(_: int | None) -> None:
    return None


async def get_with_retry(
    client: httpx.AsyncClient,
    url: str,
    policy: RetryPolicy,
    sleep: Sleep = asyncio.sleep,
    observe: Observer = _ignore,
) -> httpx.Response:
    reason = "no attempts"
    for attempt in range(policy.attempts):
        try:
            async with asyncio.timeout(policy.request_timeout_s):
                response = await client.get(url)
        except (httpx.TransportError, TimeoutError) as error:
            observe(None)
            reason = f"{type(error).__name__}: {error}"
        else:
            observe(response.status_code)
            if response.status_code not in RETRYABLE_STATUS:
                return response
            reason = f"HTTP {response.status_code}"
        if attempt + 1 < policy.attempts:
            await sleep(policy.delay(attempt))
    raise UpstreamUnavailable(f"{url} failed after {policy.attempts} attempts ({reason})")
