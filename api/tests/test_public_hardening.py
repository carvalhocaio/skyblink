import asyncio
import time

import httpx
import numpy as np

from skyblink.adapters.cutout_cache import CutoutCache
from skyblink.adapters.http_retry import RetryPolicy
from skyblink.adapters.irsa_cutouts import CutoutClient
from skyblink.adapters.job_store import JobStore
from skyblink.adapters.result_store import ResultStore
from skyblink.adapters.throttle import ConcurrencyGovernor
from skyblink.domain.grid import FrameGrid
from skyblink.domain.models import Job, JobStatus, Target
from skyblink.services.frame_builder import FrameBuilder
from skyblink.services.job_runner import JobRunner, RunnerLimits
from tests.factories import make_exposure, write_cutout
from tests.test_api import BARNARD, FakeBuilder, FakeSearch, api, seasonal_exposures, wait_finished

TARGET = Target(10.0, 20.0, fov_arcmin=2)


def fits_bytes(tmp_path) -> bytes:
    grid = FrameGrid.centered_on(TARGET)
    y, x = np.mgrid[: grid.shape[0], : grid.shape[1]]
    image = 50 * np.exp(-((x - grid.shape[1] // 2) ** 2 + (y - grid.shape[0] // 2) ** 2) / 2.0)
    return write_cutout(tmp_path / "template.fits", grid.wcs, image).read_bytes()


class Clock:
    def __init__(self, now: float = 0.0):
        self.now = now

    def __call__(self) -> float:
        return self.now


async def wait_until(condition, timeout_s: float = 5.0) -> None:
    for _ in range(int(timeout_s / 0.01)):
        if condition():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("condition not reached")


async def test_same_request_returns_existing_job(tmp_path):
    async with api(tmp_path, FakeSearch(seasonal_exposures()), FakeBuilder()) as client:
        first = (await client.post("/jobs", json=BARNARD)).json()
        again = (await client.post("/jobs", json=BARNARD)).json()
        await wait_finished(client, first["job_id"])
        after_done = await client.post("/jobs", json=BARNARD)
        other = (await client.post("/jobs", json={**BARNARD, "max_exposures_per_frame": 10})).json()

    assert again["job_id"] == first["job_id"]
    assert after_done.status_code == 202
    assert after_done.json() == {"job_id": first["job_id"], "status": "done"}
    assert other["job_id"] != first["job_id"]


async def test_failed_job_is_not_reused(tmp_path):
    runner = JobRunner(FakeSearch([]), FakeBuilder(), JobStore(), tmp_path)
    failed = runner.submit(TARGET, ["D6"], 30)
    await wait_until(lambda: failed.finished)
    failed.status = JobStatus.FAILED

    assert runner.submit(TARGET, ["D6"], 30).id != failed.id


class GatedBuilder(FakeBuilder):
    def __init__(self):
        super().__init__()
        self.gate = asyncio.Event()

    async def build(self, exposures, target, grid):
        await self.gate.wait()
        return await super().build(exposures, target, grid)


async def test_only_limited_number_of_jobs_build_at_once(tmp_path):
    builder = GatedBuilder()
    runner = JobRunner(
        FakeSearch(seasonal_exposures()),
        builder,
        JobStore(),
        tmp_path,
        limits=RunnerLimits(max_active_jobs=2),
    )
    jobs = [runner.submit(Target(10.0 + i, 20.0), ["D6"], 30) for i in range(3)]

    await wait_until(lambda: sum(j.status == JobStatus.BUILDING for j in jobs) == 2)
    assert jobs[2].status == JobStatus.QUEUED
    builder.gate.set()
    await wait_until(lambda: all(j.status == JobStatus.DONE for j in jobs))


async def test_download_cap_is_shared_by_all_jobs(tmp_path):
    payload = fits_bytes(tmp_path)
    in_flight, peak = 0, 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        return httpx.Response(200, content=payload)

    governor = ConcurrencyGovernor(limit=3, fallback_limit=2, max_unavailable_ratio=0.2, min_requests=20)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        cutouts = CutoutClient(client, RetryPolicy(attempts=1), CutoutCache(tmp_path / "cache"), governor)
        exposures = [make_exposure(obs_id=f"e{i}", mjd=60900 + i) for i in range(12)]
        runner = JobRunner(
            FakeSearch(exposures),
            FrameBuilder(cutouts),
            JobStore(),
            tmp_path / "out",
            limits=RunnerLimits(max_active_jobs=2),
        )
        jobs = [runner.submit(TARGET, ["D6"], limit) for limit in (12, 11)]
        await wait_until(lambda: all(j.finished for j in jobs), timeout_s=20)

    assert [j.status for j in jobs] == [JobStatus.DONE, JobStatus.DONE]
    assert governor.requests == 12
    assert peak == 3


def finished_job(job_id: str, created_at: float) -> Job:
    return Job(
        id=job_id,
        target=Target(1.0, 2.0),
        detectors=None,
        max_exposures_per_frame=30,
        status=JobStatus.DONE,
        created_at=created_at,
    )


def test_store_evicts_expired_then_oldest_finished_jobs():
    store = JobStore()
    for index, created in enumerate([0.0, 100.0, 200.0, 300.0]):
        store.add(finished_job(f"j{index}", created))
    running = finished_job("running", 0.0)
    running.status = JobStatus.BUILDING
    store.add(running)

    evicted = store.evict(now=350.0, max_jobs=3, max_age_s=300.0)

    assert [job.id for job in evicted] == ["j0", "j1"]
    assert store.get("running") is not None
    assert [store.get(f"j{i}") is not None for i in range(4)] == [False, False, True, True]


async def test_runner_removes_evicted_jobs_and_their_pngs(tmp_path):
    clock = Clock()
    store = JobStore()
    runner = JobRunner(
        FakeSearch(seasonal_exposures(detectors=("D6",))),
        FakeBuilder(),
        store,
        tmp_path,
        limits=RunnerLimits(max_stored_jobs=10, job_ttl_s=60.0),
        clock=clock,
    )
    old = runner.submit(Target(1.0, 2.0), ["D6"], 30)
    await wait_until(lambda: old.finished)
    old_frame = old.frames[0].id
    assert (tmp_path / old.id).is_dir()

    clock.now = 61.0
    runner.submit(Target(3.0, 4.0), ["D6"], 30)

    assert store.get(old.id) is None
    assert store.frame(old_frame) is None
    assert not (tmp_path / old.id).exists()


async def test_health_does_not_touch_irsa(tmp_path):
    class ExplodingSearch:
        async def search(self, target):
            raise AssertionError("health must not query IRSA")

    async with api(tmp_path, ExplodingSearch(), FakeBuilder()) as client:
        response = await client.get("/health")

    assert (response.status_code, response.json()) == (200, {"status": "ok"})


async def test_finished_job_with_a_failed_frame_is_not_reused(tmp_path):
    builder = FakeBuilder(failing_detectors={"D1"})
    request = {**BARNARD, "detectors": None}
    async with api(tmp_path, FakeSearch(seasonal_exposures()), builder) as client:
        first = (await client.post("/jobs", json=request)).json()["job_id"]
        partial = await wait_finished(client, first)
        builder.failing.clear()
        second = (await client.post("/jobs", json=request)).json()["job_id"]
        rebuilt = await wait_finished(client, second)
        third = (await client.post("/jobs", json=request)).json()

    assert partial["status"] == "done" and "failed" in {f["status"] for f in partial["frames"]}
    assert second != first
    assert {f["status"] for f in rebuilt["frames"]} == {"ready"}
    assert third == {"job_id": second, "status": "done"}


class SlowResults(ResultStore):
    def __init__(self, root):
        super().__init__(root)
        self.status_while_saving: list[JobStatus] = []

    def save(self, job):
        self.status_while_saving.append(job.status)
        time.sleep(0.2)
        return super().save(job)


async def test_result_is_persisted_before_the_job_is_published_as_done(tmp_path):
    results = SlowResults(tmp_path / "results")
    runner = JobRunner(
        FakeSearch(seasonal_exposures(detectors=("D6",))),
        FakeBuilder(),
        JobStore(),
        tmp_path,
        results=results,
    )
    job = runner.submit(TARGET, ["D6"], 30)
    await wait_until(lambda: job.finished)

    assert job.status == JobStatus.DONE
    assert results.status_while_saving == [JobStatus.BUILDING]
    restored = results.load(job.key, created_at=0.0)
    assert restored is not None and restored.status == JobStatus.DONE
    await runner.shutdown()


async def test_cancellation_after_done_keeps_the_job_done(tmp_path, monkeypatch):
    runner = JobRunner(FakeSearch([]), FakeBuilder(), JobStore(), tmp_path)
    done_and_lingering = asyncio.Event()

    async def finish_then_linger(job):
        job.status = JobStatus.DONE
        done_and_lingering.set()
        await asyncio.sleep(60)

    monkeypatch.setattr(runner, "_run", finish_then_linger)
    job = runner.submit(TARGET, ["D6"], 30)
    await done_and_lingering.wait()
    await runner.shutdown()

    assert job.status == JobStatus.DONE


async def test_cancellation_before_done_fails_the_job(tmp_path, monkeypatch):
    runner = JobRunner(FakeSearch([]), FakeBuilder(), JobStore(), tmp_path)
    started = asyncio.Event()

    async def linger(job):
        job.status = JobStatus.BUILDING
        started.set()
        await asyncio.sleep(60)

    monkeypatch.setattr(runner, "_run", linger)
    job = runner.submit(TARGET, ["D6"], 30)
    await started.wait()
    await runner.shutdown()

    assert job.status == JobStatus.FAILED
