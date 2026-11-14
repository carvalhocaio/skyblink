import logging
from collections.abc import AsyncIterator, Callable
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from skyblink.adapters.job_store import JobStore
from skyblink.api.routes import Services, router
from skyblink.config import Settings
from skyblink.services.frame_builder import FrameBuilder
from skyblink.services.job_runner import JobRunner
from skyblink.wiring import cutout_client, http_client, sia_client


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)


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
                cutouts = cutout_client(client, settings)
                store = JobStore()
                runner = JobRunner(
                    sia_client(client, settings),
                    FrameBuilder(cutouts),
                    store,
                    settings.output_dir / "jobs",
                    cutouts.governor.summary,
                )
                app.state.services = Services(store=store, runner=runner)
            try:
                yield
            finally:
                await app.state.services.runner.shutdown()

    app = FastAPI(title="Skyblink API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
