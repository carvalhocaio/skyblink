import asyncio
import json
import time

import httpx
import pytest

from skyblink.api.app import create_app

pytestmark = pytest.mark.e2e

BARNARD = {"ra": 269.4462, "dec": 4.7682, "fov_arcmin": 6, "detectors": ["D6"]}
TIMEOUT_S = 900


async def test_barnard_d6_job_finishes_with_three_ready_frames():
    app = create_app()
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            created = await client.post("/jobs", json=BARNARD)
            assert created.status_code == 202
            job_id = created.json()["job_id"]
            started = time.monotonic()
            while True:
                body = (await client.get(f"/jobs/{job_id}")).json()
                if body["status"] in ("done", "failed") or time.monotonic() - started > TIMEOUT_S:
                    break
                await asyncio.sleep(2)
            ready = [f for f in body["frames"] if f["status"] == "ready"]
            pngs = [await client.get(f["image_url"]) for f in ready]

    print(f"\nfinished in {time.monotonic() - started:.0f}s")
    print(json.dumps(body, indent=2))
    assert body["status"] == "done"
    assert len(ready) == 3
    assert all(p.status_code == 200 and p.content.startswith(b"\x89PNG") for p in pngs)
    assert body["stretch"]["fixed_from_frame"] == f"{job_id}-s{body['seasons'][0]['id']}-D6"
