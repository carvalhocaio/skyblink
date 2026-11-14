import asyncio
import io

import httpx
import numpy as np
import pytest
from astropy.io import fits

from skyblink.adapters.cutout_cache import CutoutCache, CutoutKey
from skyblink.adapters.http_retry import RetryPolicy, UpstreamUnavailable, get_with_retry
from skyblink.adapters.irsa_cutouts import CutoutClient, CutoutError
from skyblink.adapters.irsa_sia import merge_collections, parse_sia_csv
from skyblink.adapters.throttle import ConcurrencyGovernor
from tests.factories import irsa_cutout_bytes, make_exposure

FAST = RetryPolicy(attempts=3, base_delay_s=0, request_timeout_s=5)
FITS_BYTES = irsa_cutout_bytes()

SIA_CSV = (
    "obs_id,energy_bandpassname,t_min,em_min,em_max,access_url,dataproduct_subtype\n"
    "2025W33_2C_0321_1,SPHEREx-D6,60902.864715,4.41150e-06,5.00960e-06,https://x/a.fits,science\n"
    "2025W33_2C_0321_1,SPHEREx-D1,60902.864715,7.5e-07,1.1e-06,https://x/b.fits,science\n"
)


def governor(limit: int = 2) -> ConcurrencyGovernor:
    return ConcurrencyGovernor(limit=limit, fallback_limit=1, max_unavailable_ratio=0.2, min_requests=20)


async def no_sleep(_: float) -> None:
    return None


def client_with(responses: list[httpx.Response]) -> tuple[httpx.AsyncClient, list[str]]:
    calls: list[str] = []
    queue = iter(responses)

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return next(queue)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler)), calls


def test_parse_sia_csv_converts_units_and_detector():
    exposures = parse_sia_csv(SIA_CSV, "spherex_dr1")

    assert [e.detector for e in exposures] == ["D6", "D1"]
    assert exposures[0].wavelength_um == pytest.approx((4.4115, 5.0096))
    assert exposures[0].mjd == pytest.approx(60902.864715)


def test_merge_prefers_first_collection_for_same_exposure():
    dr1 = make_exposure(collection="spherex_dr1", mjd=2.0)
    qr3_duplicate = make_exposure(collection="spherex_qr3", mjd=2.0)
    qr3_new = make_exposure(obs_id="other", collection="spherex_qr3", mjd=1.0)

    merged = merge_collections([dr1], [qr3_duplicate, qr3_new])

    assert [(e.obs_id, e.collection) for e in merged] == [
        ("other", "spherex_qr3"),
        ("2025W33_2C_0321_1", "spherex_dr1"),
    ]


async def test_retries_transient_status_then_succeeds():
    client, calls = client_with([httpx.Response(503), httpx.Response(504), httpx.Response(200)])

    response = await get_with_retry(client, "https://x", FAST, sleep=no_sleep)

    assert response.status_code == 200
    assert len(calls) == 3


async def test_gives_up_after_policy_attempts():
    client, _ = client_with([httpx.Response(503)] * 3)

    with pytest.raises(UpstreamUnavailable, match="HTTP 503"):
        await get_with_retry(client, "https://x", FAST, sleep=no_sleep)


async def test_cutout_is_cached_on_disk(tmp_path):
    client, calls = client_with([httpx.Response(200, content=FITS_BYTES)])
    cutouts = CutoutClient(client, FAST, CutoutCache(tmp_path), governor=governor(2))
    exposure = make_exposure()

    first = await cutouts.fetch(exposure, 269.4464, 4.7668, 0.1)
    second = await cutouts.fetch(exposure, 269.4464, 4.7668, 0.1)

    assert first == second
    with fits.open(first) as cached, fits.open(io.BytesIO(FITS_BYTES)) as original:
        assert [hdu.name for hdu in cached] == ["PRIMARY", "IMAGE", "FLAGS", "VARIANCE", "ZODI", "WCS-WAVE"]
        assert np.array_equal(cached["IMAGE"].data, original["IMAGE"].data)
        assert cached["FLAGS"].header["MSKN0001"] == "OVERFLOW"
    assert first.stat().st_size < len(FITS_BYTES) / 5
    assert calls == [f"{exposure.access_url}?center=269.4464,4.7668&size=0.1"]


async def test_no_overlap_is_no_data_and_cached(tmp_path):
    client, calls = client_with([httpx.Response(422, text="Arrays do not overlap.")])
    cache = CutoutCache(tmp_path)
    cutouts = CutoutClient(client, RetryPolicy(attempts=1), cache, governor=governor(1))
    exposure = make_exposure()

    assert await cutouts.fetch(exposure, 1.0, 2.0, 0.1) is None
    assert await cutouts.fetch(exposure, 1.0, 2.0, 0.1) is None
    assert len(calls) == 1


async def test_non_fits_answer_is_an_error(tmp_path):
    client, _ = client_with([httpx.Response(404, text="not found")])
    cutouts = CutoutClient(client, FAST, CutoutCache(tmp_path), governor=governor(1))

    with pytest.raises(CutoutError):
        await cutouts.fetch(make_exposure(), 1.0, 2.0, 0.1)


def test_cache_key_depends_on_position_and_size():
    base = CutoutKey("obs", "D6", 1.0, 2.0, 0.1)

    assert base.digest() == CutoutKey("obs", "D6", 1.0, 2.0, 0.1).digest()
    assert base.digest() != CutoutKey("obs", "D6", 1.0, 2.0, 0.2).digest()
    assert base.digest() != CutoutKey("obs", "D5", 1.0, 2.0, 0.1).digest()


async def test_cutout_client_reports_each_attempt_to_governor(tmp_path):
    client, _ = client_with([httpx.Response(503), httpx.Response(200, content=FITS_BYTES)])
    tracker = governor()
    cutouts = CutoutClient(client, FAST, CutoutCache(tmp_path), governor=tracker)

    await cutouts.fetch(make_exposure(), 1.0, 2.0, 0.1)

    assert (tracker.requests, tracker.unavailable) == (2, 1)


async def test_concurrent_requests_for_same_cutout_share_one_download(tmp_path):
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return httpx.Response(200, content=FITS_BYTES)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        cutouts = CutoutClient(client, FAST, CutoutCache(tmp_path), governor=governor(4))
        paths = await asyncio.gather(*(cutouts.fetch(make_exposure(), 1.0, 2.0, 0.1) for _ in range(5)))

    assert calls == 1
    assert len(set(paths)) == 1
