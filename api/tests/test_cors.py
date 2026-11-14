import dataclasses

import httpx
import pytest

from skyblink.adapters.job_store import JobStore
from skyblink.api.app import create_app
from skyblink.api.routes import Services
from skyblink.config import Settings
from skyblink.services.job_runner import JobRunner
from tests.test_api import FRONTEND, FakeBuilder, FakeSearch

VERCEL_PATTERN = r"https://skyblink(-[a-z0-9-]+)?\.vercel\.app"


async def preflight_origin(tmp_path, regex: str | None, origin: str) -> str | None:
    settings = dataclasses.replace(Settings.from_env(), cors_origins=(FRONTEND,), cors_origin_regex=regex)
    store = JobStore()
    runner = JobRunner(FakeSearch([]), FakeBuilder(), store, tmp_path)
    app = create_app(settings, services_factory=lambda: Services(store=store, runner=runner))
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.options(
                "/jobs", headers={"Origin": origin, "Access-Control-Request-Method": "POST"}
            )
    return response.headers.get("access-control-allow-origin")


@pytest.mark.parametrize(
    "origin",
    [
        "https://skyblink.vercel.app",
        "https://skyblink-git-main-caio.vercel.app",
        "https://skyblink-3f9a2c1-caio.vercel.app",
    ],
)
async def test_regex_allows_vercel_deploys(tmp_path, origin):
    assert await preflight_origin(tmp_path, VERCEL_PATTERN, origin) == origin


@pytest.mark.parametrize(
    "origin",
    [
        "https://other.vercel.app",
        "https://skyblink.vercel.app.evil.example",
        "http://skyblink.vercel.app",
    ],
)
async def test_regex_rejects_other_origins(tmp_path, origin):
    assert await preflight_origin(tmp_path, VERCEL_PATTERN, origin) is None


async def test_list_still_works_with_regex(tmp_path):
    assert await preflight_origin(tmp_path, VERCEL_PATTERN, FRONTEND) == FRONTEND


async def test_without_regex_only_the_list_is_allowed(tmp_path):
    assert await preflight_origin(tmp_path, None, "https://skyblink.vercel.app") is None


def test_regex_read_from_environment(monkeypatch):
    monkeypatch.delenv("SKYBLINK_CORS_ORIGIN_REGEX", raising=False)
    assert Settings.from_env().cors_origin_regex is None

    monkeypatch.setenv("SKYBLINK_CORS_ORIGIN_REGEX", "  ")
    assert Settings.from_env().cors_origin_regex is None

    monkeypatch.setenv("SKYBLINK_CORS_ORIGIN_REGEX", VERCEL_PATTERN)
    assert Settings.from_env().cors_origin_regex == VERCEL_PATTERN
