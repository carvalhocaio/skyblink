import dataclasses
import shutil
from contextlib import asynccontextmanager

import httpx
import numpy as np

from skyblink.adapters.cutout_cache import CutoutCache
from skyblink.adapters.http_retry import RetryPolicy
from skyblink.api.app import create_app, irsa_services
from skyblink.config import Settings
from skyblink.domain.grid import FrameGrid
from skyblink.domain.models import Target
from tests.factories import write_cutout
from tests.test_api import wait_finished

BARNARD = Target(269.4462, 4.7682, 6.0)
REQUEST = {"ra": BARNARD.ra, "dec": BARNARD.dec, "fov_arcmin": 6, "detectors": ["D6"]}
SEASON_STARTS = (60900.0, 61100.0, 61300.0)
SIA_HEADER = "obs_id,energy_bandpassname,t_min,em_min,em_max,access_url,dataproduct_subtype\n"


class FakeIrsa:
    def __init__(self, cutout: bytes):
        self.cutout = cutout
        self.failing = False
        self.calls: list[str] = []

    def sia_csv(self, collection: str) -> str:
        if collection != "spherex_dr1":
            return SIA_HEADER
        rows = [
            f"obs{int(start)}_{i},SPHEREx-D6,{start + i},4.4e-06,5.0e-06,https://irsa.example/obs{int(start)}_{i}.fits,science"
            for start in SEASON_STARTS
            for i in range(3)
        ]
        return SIA_HEADER + "\n".join(rows) + "\n"

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request.url.path)
        if self.failing:
            return httpx.Response(502)
        if request.url.path == "/SIA":
            return httpx.Response(200, text=self.sia_csv(request.url.params["COLLECTION"]))
        return httpx.Response(200, content=self.cutout)


def star_fits(tmp_path) -> bytes:
    grid = FrameGrid.centered_on(BARNARD)
    y, x = np.mgrid[: grid.shape[0], : grid.shape[1]]
    image = 100 * np.exp(-((x - grid.shape[1] // 2) ** 2 + (y - grid.shape[0] // 2) ** 2) / 2.0) + 1.0
    return write_cutout(tmp_path / "star.fits", grid.wcs, image).read_bytes()


def offline_settings(tmp_path, discovery_ttl_s: float = 24 * 3600) -> Settings:
    return dataclasses.replace(
        Settings.from_env(),
        cache_dir=tmp_path / "cache",
        output_dir=tmp_path / "out",
        discovery_dir=tmp_path / "discovery",
        discovery_ttl_s=discovery_ttl_s,
        retry=RetryPolicy(attempts=2, base_delay_s=0, request_timeout_s=5),
    )


@asynccontextmanager
async def running_api(settings: Settings, irsa: FakeIrsa):
    async with httpx.AsyncClient(transport=httpx.MockTransport(irsa.handler)) as irsa_client:
        app = create_app(
            settings,
            services_factory=lambda: irsa_services(settings, irsa_client, CutoutCache(settings.cache_dir)),
        )
        async with app.router.lifespan_context(app):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                yield client


async def warm_up(tmp_path, settings: Settings) -> FakeIrsa:
    irsa = FakeIrsa(star_fits(tmp_path))
    async with running_api(settings, irsa) as client:
        job_id = (await client.post("/jobs", json=REQUEST)).json()["job_id"]
        body = await wait_finished(client, job_id, timeout_s=30)
    assert body["status"] == "done" and len(body["frames"]) == 3
    return irsa


async def test_warmed_target_is_done_after_restart_with_irsa_down(tmp_path):
    settings = offline_settings(tmp_path)
    irsa = await warm_up(tmp_path, settings)
    irsa.failing, irsa.calls = True, []

    async with running_api(settings, irsa) as client:
        created = await client.post("/jobs", json=REQUEST)
        body = (await client.get(f"/jobs/{created.json()['job_id']}")).json()
        pngs = [await client.get(frame["image_url"]) for frame in body["frames"]]

    assert created.status_code == 202 and created.json()["status"] == "done"
    assert [f["status"] for f in body["frames"]] == ["ready"] * 3
    assert all(p.status_code == 200 and p.content.startswith(b"\x89PNG") for p in pngs)
    assert irsa.calls == []


async def test_without_persisted_result_falls_back_to_cached_discovery_and_cutouts(tmp_path):
    irsa = await warm_up(tmp_path, offline_settings(tmp_path))
    shutil.rmtree(tmp_path / "out" / "results")
    irsa.failing, irsa.calls = True, []

    async with running_api(offline_settings(tmp_path, discovery_ttl_s=0), irsa) as client:
        job_id = (await client.post("/jobs", json=REQUEST)).json()["job_id"]
        body = await wait_finished(client, job_id, timeout_s=30)

    assert body["status"] == "done"
    assert [f["status"] for f in body["frames"]] == ["ready"] * 3
    assert irsa.calls and set(irsa.calls) == {"/SIA"}
