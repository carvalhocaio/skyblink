import asyncio
import dataclasses
from contextlib import asynccontextmanager

import httpx
import numpy as np
import pytest

from skyblink.adapters.job_store import JobStore
from skyblink.api.app import create_app
from skyblink.api.routes import Services
from skyblink.config import Settings
from skyblink.domain.models import Target
from skyblink.services.frame_builder import FrameImage, NoUsableExposures
from skyblink.services.job_runner import JobRunner
from tests.factories import make_exposure

FRONTEND = "http://localhost:3000"
BARNARD = {"ra": 269.4462, "dec": 4.7682, "fov_arcmin": 6, "detectors": ["D6"]}


class FakeSearch:
    def __init__(self, exposures):
        self.exposures = exposures

    async def search(self, target):
        return self.exposures


class FakeBuilder:
    def __init__(self, failing_detectors=()):
        self.failing = set(failing_detectors)
        self.built: list[str] = []

    async def build(self, exposures, target, grid):
        detector = exposures[0].detector
        self.built.append(f"{detector}@{exposures[0].mjd:.0f}")
        if detector in self.failing:
            raise NoUsableExposures("no overlap")
        rng = np.random.default_rng(len(self.built))
        saturated = np.zeros(grid.shape)
        saturated[grid.shape[0] // 2, grid.shape[1] // 2] = 1
        return FrameImage(
            image=rng.normal(size=grid.shape),
            coverage=np.full(grid.shape, len(exposures)),
            saturated_count=saturated,
            n_exposures_used=len(exposures),
            saturated_core_exposures=len(exposures),
            download_s=0.5 * len(exposures),
            assembly_s=0.1,
        )


def seasonal_exposures(detectors=("D6", "D1"), per_season=6, seasons=(0.0, 200.0, 400.0)):
    return [
        make_exposure(obs_id=f"{start}-{d}-{i}", detector=d, mjd=60900 + start + i)
        for start in seasons
        for d in detectors
        for i in range(per_season)
    ]


@asynccontextmanager
async def api(tmp_path, search, builder):
    settings = dataclasses.replace(Settings.from_env(), cors_origins=(FRONTEND,))
    store = JobStore()
    runner = JobRunner(search, builder, store, tmp_path)
    app = create_app(settings, services_factory=lambda: Services(store=store, runner=runner))
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


async def wait_finished(client, job_id, timeout_s=5.0):
    for _ in range(int(timeout_s / 0.01)):
        body = (await client.get(f"/jobs/{job_id}")).json()
        if body["status"] in ("done", "failed"):
            return body
        await asyncio.sleep(0.01)
    raise AssertionError(f"job {job_id} did not finish")


@pytest.mark.parametrize(
    "change",
    [
        {"ra": -0.1},
        {"ra": 360.1},
        {"dec": -90.5},
        {"dec": 91},
        {"fov_arcmin": 0.9},
        {"fov_arcmin": 30.5},
        {"detectors": ["D7"]},
        {"detectors": ["d6"]},
        {"detectors": []},
        {"ra": "abc"},
        {"max_exposures_per_frame": 0},
        {"max_exposures_per_frame": 61},
    ],
)
async def test_invalid_input_is_422(tmp_path, change):
    async with api(tmp_path, FakeSearch([]), FakeBuilder()) as client:
        response = await client.post("/jobs", json={**BARNARD, **change})

    assert response.status_code == 422


async def test_max_exposures_per_frame_accepts_the_cap(tmp_path):
    async with api(tmp_path, FakeSearch([]), FakeBuilder()) as client:
        response = await client.post("/jobs", json={**BARNARD, "max_exposures_per_frame": 60})

    assert response.status_code == 202


async def test_missing_coordinates_is_422(tmp_path):
    async with api(tmp_path, FakeSearch([]), FakeBuilder()) as client:
        response = await client.post("/jobs", json={"ra": 10})

    assert response.status_code == 422


async def test_job_lifecycle_matches_contract(tmp_path):
    builder = FakeBuilder()
    async with api(tmp_path, FakeSearch(seasonal_exposures()), builder) as client:
        created = await client.post("/jobs", json={**BARNARD, "detectors": ["D6", "D1"]})
        assert created.status_code == 202
        assert set(created.json()) == {"job_id", "status"}
        assert created.json()["status"] == "queued"

        body = await wait_finished(client, created.json()["job_id"])
        png = await client.get(body["frames"][0]["image_url"])

    assert set(body) == {
        "status",
        "target",
        "progress",
        "eta_seconds",
        "seasons",
        "frames",
        "stretch",
        "alerts",
        "motion",
        "motion_reason",
    }
    assert body["status"] == "done"
    assert body["target"] == {"ra": 269.4462, "dec": 4.7682, "fov_arcmin": 6.0, "name": None}
    assert body["progress"] == {"frames_done": 6, "frames_total": 6, "percent": 100}
    assert body["eta_seconds"] == {"min": 0, "max": 0}
    assert [s["n_exposures"] for s in body["seasons"]] == [12, 12, 12]
    assert builder.built[:3] == ["D6@60900", "D6@61100", "D6@61300"]
    assert [f["mid_date"] for f in body["frames"]] == sorted(f["mid_date"] for f in body["frames"])
    frame = body["frames"][0]
    assert set(frame) == {
        "id",
        "season_id",
        "detector",
        "wavelength_um",
        "mid_date",
        "status",
        "n_exposures_used",
        "n_exposures_available",
        "image_url",
        "alerts",
        "exposures",
    }
    assert frame["status"] == "ready"
    assert len(frame["exposures"]) == frame["n_exposures_available"] == 6
    assert frame["exposures"][0] == {
        "obs_id": "0.0-D1-0",
        "collection": "spherex_dr1",
        "date": "2025-08-13T00:00:00Z",
        "wavelength_um": [4.4115, 5.0096],
        "access_url": "https://irsa.example/0.0-D1-0D1.fits",
    }
    assert frame["alerts"] == [{"code": "SATURATED_CORE", "severity": "info"}]
    assert body["stretch"]["fixed_from_frame"].endswith("-s0-D6")
    assert body["alerts"] == []
    assert png.status_code == 200 and png.headers["content-type"] == "image/png"


async def test_failed_frame_does_not_fail_job(tmp_path):
    async with api(
        tmp_path, FakeSearch(seasonal_exposures()), FakeBuilder(failing_detectors={"D1"})
    ) as client:
        job_id = (await client.post("/jobs", json={**BARNARD, "detectors": None})).json()["job_id"]
        body = await wait_finished(client, job_id)
        failed = next(f for f in body["frames"] if f["status"] == "failed")
        png = await client.get(f"/frames/{failed['id']}.png")

    assert body["status"] == "done"
    assert {f["detector"]: f["status"] for f in body["frames"]} == {"D6": "ready", "D1": "failed"}
    assert failed["image_url"] is None
    assert png.status_code == 404


async def test_no_coverage_and_single_season_alerts(tmp_path):
    async with api(tmp_path, FakeSearch([]), FakeBuilder()) as client:
        empty = await wait_finished(client, (await client.post("/jobs", json=BARNARD)).json()["job_id"])
    single = seasonal_exposures(detectors=("D6",), per_season=3, seasons=(0.0,))
    async with api(tmp_path, FakeSearch(single), FakeBuilder()) as client:
        one = await wait_finished(client, (await client.post("/jobs", json=BARNARD)).json()["job_id"])

    assert (empty["status"], empty["alerts"]) == ("done", [{"code": "NO_COVERAGE", "severity": "error"}])
    assert empty["frames"] == [] and empty["progress"]["percent"] == 100
    assert one["alerts"] == [{"code": "SINGLE_SEASON", "severity": "warning"}]
    assert {"code": "FEW_EXPOSURES", "severity": "warning"} in one["frames"][0]["alerts"]


async def test_eta_is_a_range_while_building(tmp_path):
    gate = asyncio.Event()

    class SlowBuilder(FakeBuilder):
        async def build(self, exposures, target, grid):
            if len(self.built) == 1:
                await gate.wait()
            return await super().build(exposures, target, grid)

    async with api(tmp_path, FakeSearch(seasonal_exposures()), SlowBuilder()) as client:
        job_id = (await client.post("/jobs", json=BARNARD)).json()["job_id"]
        for _ in range(200):
            body = (await client.get(f"/jobs/{job_id}")).json()
            if body["progress"]["frames_done"] == 1:
                break
            await asyncio.sleep(0.01)
        gate.set()
        await wait_finished(client, job_id)

    assert body["status"] == "building"
    assert body["progress"] == {"frames_done": 1, "frames_total": 3, "percent": 33}
    assert 0 < body["eta_seconds"]["min"] < body["eta_seconds"]["max"]


async def test_unknown_job_and_frame_are_404(tmp_path):
    async with api(tmp_path, FakeSearch([]), FakeBuilder()) as client:
        assert (await client.get("/jobs/nope")).status_code == 404
        assert (await client.get("/frames/nope.png")).status_code == 404


async def test_cors_allows_configured_frontend(tmp_path):
    async with api(tmp_path, FakeSearch([]), FakeBuilder()) as client:
        allowed = await client.options(
            "/jobs", headers={"Origin": FRONTEND, "Access-Control-Request-Method": "POST"}
        )
        other = await client.options(
            "/jobs", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"}
        )

    assert allowed.headers["access-control-allow-origin"] == FRONTEND
    assert "access-control-allow-origin" not in other.headers


class BrightnessByDetector(FakeBuilder):
    SCALE = {"D1": 1000.0, "D6": 1.0}

    async def build(self, exposures, target, grid):
        frame = await super().build(exposures, target, grid)
        return dataclasses.replace(frame, image=frame.image * self.SCALE[exposures[0].detector])


async def test_each_detector_gets_its_own_stretch(tmp_path):
    store = JobStore()
    runner = JobRunner(FakeSearch(seasonal_exposures()), BrightnessByDetector(), store, tmp_path)
    job = runner.submit(Target(269.4462, 4.7682, 6), None, 30)
    for _ in range(500):
        if job.finished:
            break
        await asyncio.sleep(0.01)

    first_ready = {}
    for frame in job.frames:
        first_ready.setdefault(frame.detector, frame.id)
    assert job.primary_detector == "D6"
    assert job.stretch_frames == {"D6": first_ready["D6"], "D1": first_ready["D1"]}
    assert job.stretches["D1"].vmax > 100 * job.stretches["D6"].vmax


async def test_api_reports_stretch_by_detector(tmp_path):
    async with api(tmp_path, FakeSearch(seasonal_exposures()), FakeBuilder()) as client:
        job_id = (await client.post("/jobs", json={**BARNARD, "detectors": None})).json()["job_id"]
        body = await wait_finished(client, job_id)

    assert body["stretch"] == {
        "fixed_from_frame": f"{job_id}-s0-D6",
        "by_detector": {"D1": f"{job_id}-s0-D1", "D6": f"{job_id}-s0-D6"},
    }
