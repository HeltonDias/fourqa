"""FastAPI application."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from fourqa.api.identity_routes import router as identity_router
from fourqa.api.routes import router as api_router
from fourqa.azure.azure_cache_read_source import assert_vercel_cache_mode
from fourqa.azure.config import env_value
from fourqa.persistence.operational_provider import assert_operational_provider

_log = logging.getLogger(__name__)


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
    async def identity_middleware(request, call_next):
        from fastapi.responses import JSONResponse

        from fourqa.auth.access import read_access_error, service_token_ok
        from fourqa.auth.context import (
            IdentityError,
            RequestIdentity,
            current_connection,
            current_role,
            current_user,
            needs_identity,
            resolve_request_identity,
            service_access,
        )
        from fourqa.persistence.meta_scope import (
            connection_scope,
            reset_actor_name,
            reset_meta_scope,
            set_actor_name,
            set_meta_scope,
        )

        path = request.url.path
        if not path.startswith("/api") or path.endswith("/health") or request.method == "OPTIONS":
            return await call_next(request)
        try:
            ident = await resolve_request_identity(request)
        except IdentityError as err:
            return JSONResponse(status_code=err.status, content={"error": str(err)})
        except Exception as err:
            _log.exception("Falha ao resolver identidade na rota %s: %s", path, err)
            if needs_identity(request) and (request.cookies.get("fourqa_user") or request.headers.get("x-fourqa-connection")):
                return JSONResponse(status_code=503, content={"error": "Banco indisponível."})
            ident = RequestIdentity()
        denied = read_access_error(request, ident)
        if denied:
            return JSONResponse(status_code=denied[0], content={"error": denied[1]})
        tokens = (
            current_user.set(ident.user),
            current_connection.set(ident.connection),
            current_role.set(ident.role),
            service_access.set(service_token_ok(request)),
        )
        scope_token = set_meta_scope(connection_scope(ident.connection))
        actor = ident.user.get("display_name") or ident.user.get("email") if ident.user else None
        actor_token = set_actor_name(actor)
        try:
            return await call_next(request)
        finally:
            reset_actor_name(actor_token)
            reset_meta_scope(scope_token)
            service_access.reset(tokens[3])
            current_role.reset(tokens[2])
            current_connection.reset(tokens[1])
            current_user.reset(tokens[0])

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

    app.include_router(api_router, prefix="/api")
    app.include_router(identity_router, prefix="/api")

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
