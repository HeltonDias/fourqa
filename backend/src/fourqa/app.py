"""FastAPI application (mirrors backend/src/app.ts)."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from fourqa.api.routes import router as api_router
from fourqa.azure.azure_cache_read_source import assert_vercel_cache_mode
from fourqa.azure.config import env_value
from fourqa.persistence.operational_provider import assert_operational_provider


def _allowed_origins() -> list[str]:
    configured = env_value("FRONTEND_ORIGIN")
    origins = (
        [item.strip() for item in configured.split(",") if item.strip()]
        if configured
        else ["http://localhost:5173", "http://localhost:3001"]
    )
    for host in (
        os.environ.get("VERCEL_URL"),
        os.environ.get("VERCEL_BRANCH_URL"),
        os.environ.get("VERCEL_PROJECT_PRODUCTION_URL"),
    ):
        if host:
            origins.append(f"https://{host}")
    return origins


def create_app(*, skip_operational_assert: bool = False) -> FastAPI:
    if not skip_operational_assert:
        assert_operational_provider(env_value("DB_PROVIDER"))
    assert_vercel_cache_mode()

    app = FastAPI(title="FourQA API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

    @app.middleware("http")
    async def vercel_path_rewrite(request, call_next):
        if os.environ.get("VERCEL") == "1":
            hinted = (
                request.headers.get("x-forwarded-uri")
                or request.headers.get("x-vercel-original-url")
                or request.headers.get("x-invoke-path")
            )
            path = request.url.path
            if hinted and hinted.startswith("/"):
                from urllib.parse import urlparse, parse_qs, urlencode

                parsed = urlparse(hinted)
                path = parsed.path or path
                rest = parse_qs(parsed.query).get("rest", [None])[0]
                if rest and path in ("/api/index", "/index", "/api"):
                    path = f"/api{rest if rest.startswith('/') else '/' + rest}"
                elif not path.startswith("/api"):
                    path = f"/api{path if path.startswith('/') else '/' + path}"
            request.scope["path"] = path
        return await call_next(request)

    @app.middleware("http")
    async def read_auth_middleware(request, call_next):
        from fourqa.http.write_auth import decide_read_auth

        protected = os.environ.get("VERCEL") == "1" and env_value("FOURQA_PROTECT_READS") != "0"
        if not protected or request.url.path.endswith("/health"):
            return await call_next(request)
        if request.method not in ("GET", "HEAD"):
            return await call_next(request)
        decision = decide_read_auth(
            protect_reads=True,
            configured_token=env_value("FOURQA_API_TOKEN"),
            authorization_header=request.headers.get("authorization"),
        )
        if decision == "allow":
            return await call_next(request)
        from fastapi.responses import JSONResponse

        if decision == "unconfigured":
            return JSONResponse(status_code=503, content={"error": "Acesso desabilitado. Configure FOURQA_API_TOKEN neste ambiente."})
        return JSONResponse(status_code=401, content={"error": "Não autorizado."})

    app.include_router(api_router, prefix="/api")

    from fastapi.responses import JSONResponse

    from fourqa.azure.azure_cache_read_source import AzureCacheUnavailableError
    from fourqa.domain.plan_period import PlanningPeriodError
    from fourqa.persistence.planning_conflict import PlanningConflictError

    @app.exception_handler(AzureCacheUnavailableError)
    async def azure_cache_unavailable(_request, exc: AzureCacheUnavailableError):
        return JSONResponse(status_code=503, content={"error": str(exc), "unavailable": True})

    @app.exception_handler(PlanningPeriodError)
    async def planning_period_error(_request, exc: PlanningPeriodError):
        return JSONResponse(status_code=400, content={"error": str(exc)})

    @app.exception_handler(PlanningConflictError)
    async def planning_conflict_error(_request, exc: PlanningConflictError):
        return JSONResponse(status_code=409, content={"error": str(exc)})

    if os.environ.get("VERCEL") != "1":
        root = Path(__file__).resolve().parents[3]
        frontend_dist = root / "frontend" / "dist"
        index = frontend_dist / "index.html"
        if frontend_dist.is_dir():

            class SpaFiles(StaticFiles):
                async def get_response(self, path: str, scope):
                    try:
                        return await super().get_response(path, scope)
                    except StarletteHTTPException as exc:
                        if exc.status_code == 404 and index.is_file():
                            return await super().get_response("index.html", scope)
                        raise

            app.mount("/", SpaFiles(directory=frontend_dist, html=True), name="frontend")

    return app


app = create_app(skip_operational_assert=os.environ.get("DB_PROVIDER", "").strip().lower() != "postgres")
