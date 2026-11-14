import asyncio
import csv
import io
from urllib.parse import urlencode

import httpx

from skyblink.adapters.http_retry import RetryPolicy, get_with_retry
from skyblink.domain.models import Exposure, Target

SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
COLLECTIONS = ("spherex_dr1", "spherex_qr3")
BANDPASS_PREFIX = "SPHEREx-"
METERS_TO_MICRONS = 1e6


class SiaError(Exception):
    pass


def parse_sia_csv(text: str, collection: str) -> list[Exposure]:
    rows = csv.DictReader(io.StringIO(text))
    return [
        Exposure(
            obs_id=row["obs_id"],
            detector=row["energy_bandpassname"].removeprefix(BANDPASS_PREFIX),
            mjd=float(row["t_min"]),
            wavelength_um=(
                float(row["em_min"]) * METERS_TO_MICRONS,
                float(row["em_max"]) * METERS_TO_MICRONS,
            ),
            access_url=row["access_url"],
            collection=collection,
        )
        for row in rows
        if row.get("dataproduct_subtype", "science") == "science"
    ]


def merge_collections(*results: list[Exposure]) -> list[Exposure]:
    merged: dict[tuple[str, str], Exposure] = {}
    for exposures in results:
        for exposure in exposures:
            merged.setdefault((exposure.obs_id, exposure.detector), exposure)
    return sorted(merged.values(), key=lambda e: e.mjd)


class SiaClient:
    def __init__(self, client: httpx.AsyncClient, policy: RetryPolicy, search_radius_deg: float = 0.01):
        self._client = client
        self._policy = policy
        self._radius = search_radius_deg

    def query_url(self, target: Target, collection: str) -> str:
        params = {
            "COLLECTION": collection,
            "POS": f"CIRCLE {target.ra} {target.dec} {self._radius}",
            "RESPONSEFORMAT": "CSV",
        }
        return f"{SIA_URL}?{urlencode(params)}"

    async def search_collection(self, target: Target, collection: str) -> list[Exposure]:
        response = await get_with_retry(self._client, self.query_url(target, collection), self._policy)
        if response.status_code != 200:
            raise SiaError(f"SIA {collection} returned HTTP {response.status_code}")
        return parse_sia_csv(response.text, collection)

    async def search(self, target: Target) -> list[Exposure]:
        results = await asyncio.gather(*(self.search_collection(target, c) for c in COLLECTIONS))
        return merge_collections(*results)
