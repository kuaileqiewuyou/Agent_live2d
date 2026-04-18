from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import api_router
from app.config import get_settings
from app.core.errors import AppError
from app.core.logging import configure_logging
from app.core.responses import api_response
from app.db.init_db import init_db
from app.db.session import get_engine
from app.mcp import shutdown_mcp_runtime


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    await init_db(get_engine())
    try:
        yield
    finally:
        await shutdown_mcp_runtime()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=settings.api_prefix)

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError):  # noqa: ARG001
        data = {"code": exc.code}
        if exc.details:
            data.update(exc.details)
        return JSONResponse(
            status_code=exc.status_code,
            content=api_response(data, success=False, message=exc.message),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception):  # noqa: ARG001
        return JSONResponse(
            status_code=500,
            content=api_response({"code": "internal_error"}, success=False, message=str(exc)),
        )

    return app


app = create_app()
