import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import AsyncExitStack, asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from skyblink.adapters.cutout_cache import CutoutCache
from skyblink.adapters.discovery_cache import CachedExposureSearch
from skyblink.adapters.irsa_sia import COLLECTIONS
from skyblink.adapters.job_store import JobStore
from skyblink.adapters.result_store import ResultStore
from skyblink.adapters.simbad import CatalogEntry, resolve
from skyblink.api.routes import Services, router
from skyblink.config import Settings
from skyblink.services.frame_builder import FrameBuilder
from skyblink.services.job_runner import JobRunner, RunnerLimits
from skyblink.wiring import cutout_cache, cutout_client, http_client, sia_client


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)


async def _finish(task: asyncio.Task) -> None:
    await asyncio.gather(task, return_exceptions=True)


async def simbad_resolver(name: str) -> CatalogEntry:
    return await asyncio.to_thread(resolve, name)


def irsa_services(settings: Settings, client: httpx.AsyncClient, cache: CutoutCache) -> Services:
    cutouts = cutout_client(client, settings, cache)
    search = CachedExposureSearch(
        sia_client(client, settings), settings.discovery_dir, settings.discovery_ttl_s, COLLECTIONS
    )
    store = JobStore()
    runner = JobRunner(
        search,
        FrameBuilder(cutouts),
        store,
        settings.output_dir / "jobs",
        cutouts.governor.summary,
        RunnerLimits(
            max_active_jobs=settings.max_active_jobs,
            max_stored_jobs=settings.max_stored_jobs,
            job_ttl_s=settings.job_ttl_s,
        ),
        results=ResultStore(settings.output_dir / "results"),
        catalog=simbad_resolver,
    )
    return Services(store=store, runner=runner)


def create_app(
    settings: Settings | None = None,
    services_factory: Callable[[], Services] | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        _configure_logging()
        async with AsyncExitStack() as stack:
            if services_factory is not None:
                app.state.services = services_factory()
            else:
                client = await stack.enter_async_context(http_client(settings))
                cache = cutout_cache(settings)
                migration = asyncio.create_task(asyncio.to_thread(cache.compact_all))
                stack.push_async_callback(_finish, migration)
                app.state.services = irsa_services(settings, client, cache)
            try:
                yield
            finally:
                await app.state.services.runner.shutdown()

    app = FastAPI(title="Skyblink API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_origin_regex=settings.cors_origin_regex,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
