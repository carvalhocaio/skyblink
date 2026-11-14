import asyncio
import logging
from collections import Counter
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

SERVICE_UNAVAILABLE = 503


class ConcurrencyGovernor:
    def __init__(
        self,
        limit: int,
        fallback_limit: int,
        max_unavailable_ratio: float,
        min_requests: int,
    ):
        self._limit = limit
        self._fallback_limit = fallback_limit
        self._max_ratio = max_unavailable_ratio
        self._min_requests = min_requests
        self._active = 0
        self._condition = asyncio.Condition()
        self.requests = 0
        self.unavailable = 0
        self.statuses: Counter[str] = Counter()

    @property
    def limit(self) -> int:
        return self._limit

    @property
    def unavailable_ratio(self) -> float:
        return self.unavailable / self.requests if self.requests else 0.0

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        async with self._condition:
            await self._condition.wait_for(lambda: self._active < self._limit)
            self._active += 1
        try:
            yield
        finally:
            async with self._condition:
                self._active -= 1
                self._condition.notify_all()

    def record(self, status: int | None) -> None:
        self.requests += 1
        self.statuses["timeout/transport" if status is None else str(status)] += 1
        if status == SERVICE_UNAVAILABLE:
            self.unavailable += 1
        if self._should_fall_back():
            logger.warning(
                "IRSA HTTP 503 on %d of %d requests (%.0f%%): concurrency %d -> %d",
                self.unavailable,
                self.requests,
                100 * self.unavailable_ratio,
                self._limit,
                self._fallback_limit,
            )
            self._limit = self._fallback_limit

    def _should_fall_back(self) -> bool:
        return (
            self._limit > self._fallback_limit
            and self.requests >= self._min_requests
            and self.unavailable_ratio > self._max_ratio
        )

    def summary(self) -> str:
        errors = ", ".join(
            f"{code}: {count} ({100 * count / self.requests:.0f}%)"
            for code, count in sorted(self.statuses.items())
            if code != "200"
        )
        return (
            f"IRSA cutout requests {self.requests}, HTTP 503 {self.unavailable} "
            f"({100 * self.unavailable_ratio:.0f}%), concurrency {self._limit}; "
            f"errors by status: {errors or 'none'}"
        )
