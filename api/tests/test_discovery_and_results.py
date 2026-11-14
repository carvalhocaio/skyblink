import pytest

from skyblink.adapters.discovery_cache import CachedExposureSearch
from skyblink.adapters.http_retry import UpstreamUnavailable
from skyblink.adapters.result_store import ResultStore, is_persistable
from skyblink.domain.models import Frame, FrameStatus, Job, JobStatus, Target
from tests.factories import make_exposure
from tests.test_public_hardening import Clock

TARGET = Target(10.0, 20.0, 6.0)
HOUR = 3600.0


class FlakySearch:
    def __init__(self):
        self.calls = 0
        self.failing = False
        self.result = [make_exposure(obs_id="a")]

    async def search(self, target):
        self.calls += 1
        if self.failing:
            raise UpstreamUnavailable("HTTP 502")
        return self.result


def cached_search(tmp_path, inner, clock, collections=("spherex_dr1", "spherex_qr3")):
    return CachedExposureSearch(inner, tmp_path, ttl_s=24 * HOUR, collections=collections, clock=clock)


async def test_fresh_discovery_is_served_without_calling_sia(tmp_path):
    inner, clock = FlakySearch(), Clock(0.0)
    search = cached_search(tmp_path, inner, clock)

    first = await search.search(TARGET)
    clock.now = 23 * HOUR
    second = await search.search(TARGET)

    assert first == second == inner.result
    assert inner.calls == 1


async def test_stale_discovery_is_refreshed(tmp_path):
    inner, clock = FlakySearch(), Clock(0.0)
    search = cached_search(tmp_path, inner, clock)
    await search.search(TARGET)

    clock.now = 25 * HOUR
    inner.result = [make_exposure(obs_id="b")]

    assert [e.obs_id for e in await search.search(TARGET)] == ["b"]
    assert inner.calls == 2


async def test_sia_failure_falls_back_to_any_cached_discovery(tmp_path, caplog):
    inner, clock = FlakySearch(), Clock(0.0)
    search = cached_search(tmp_path, inner, clock)
    await search.search(TARGET)

    clock.now = 400 * HOUR
    inner.failing = True

    assert [e.obs_id for e in await search.search(TARGET)] == ["a"]
    assert "using cached discovery from 400.0 h ago" in caplog.text


async def test_sia_failure_without_cache_still_fails(tmp_path):
    inner = FlakySearch()
    inner.failing = True

    with pytest.raises(UpstreamUnavailable):
        await cached_search(tmp_path, inner, Clock(0.0)).search(TARGET)


async def test_cache_key_includes_fov_and_collections(tmp_path):
    inner, clock = FlakySearch(), Clock(0.0)
    await cached_search(tmp_path, inner, clock).search(TARGET)
    await cached_search(tmp_path, inner, clock).search(Target(10.0, 20.0, 8.0))
    await cached_search(tmp_path, inner, clock, collections=("spherex_dr1",)).search(TARGET)

    assert inner.calls == 3


def done_job(tmp_path, frame_status=FrameStatus.READY) -> Job:
    png = tmp_path / "render" / "j1-s0-D6.png"
    png.parent.mkdir(parents=True, exist_ok=True)
    png.write_bytes(b"\x89PNG fake")
    frame = Frame(
        id="j1-s0-D6",
        season_id=0,
        detector="D6",
        exposures=(make_exposure(),),
        n_exposures_available=1,
        status=frame_status,
        n_exposures_used=1,
        image_path=png,
    )
    return Job(
        id="j1",
        target=TARGET,
        detectors=("D6",),
        max_exposures_per_frame=30,
        status=JobStatus.DONE,
        frames=[frame],
    )


def test_result_roundtrip_points_frames_at_persisted_pngs(tmp_path):
    store = ResultStore(tmp_path / "results")
    job = done_job(tmp_path)

    store.save(job)
    restored = store.load(job.key, created_at=123.0)

    assert restored.id == "j1" and restored.status == JobStatus.DONE and restored.created_at == 123.0
    assert restored.frames[0].image_path == tmp_path / "results" / "j1" / "j1-s0-D6.png"
    assert restored.frames[0].image_path.read_bytes() == b"\x89PNG fake"
    assert restored.key == job.key


def test_missing_png_or_unknown_key_is_not_restored(tmp_path):
    store = ResultStore(tmp_path / "results")
    job = done_job(tmp_path)
    store.save(job)
    (tmp_path / "results" / "j1" / "j1-s0-D6.png").unlink()

    assert store.load(job.key, created_at=0.0) is None
    assert store.load(("other",), created_at=0.0) is None


def test_only_fully_ready_done_jobs_are_persisted(tmp_path):
    assert is_persistable(done_job(tmp_path))
    assert not is_persistable(done_job(tmp_path, FrameStatus.FAILED))


def test_saved_results_are_invalidated_by_a_new_pipeline_version(tmp_path):
    job = done_job(tmp_path)
    ResultStore(tmp_path / "results", pipeline_version="2").save(job)

    assert ResultStore(tmp_path / "results", pipeline_version="2").load(job.key, created_at=0.0) is not None
    assert ResultStore(tmp_path / "results", pipeline_version="3").load(job.key, created_at=0.0) is None
