from secrets import compare_digest

from fastapi import FastAPI
from fastapi.requests import Request
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.core.config import settings


def create_app(auth_token: str | None = None) -> FastAPI:
    configured_token = auth_token or settings.auth_token
    if not configured_token:
        raise RuntimeError("REALMFLOW_SIDECAR_TOKEN is required")
    app = FastAPI(
        title="RealmFlow Agent",
        description="Local AI and automation sidecar for RealmFlow.",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
    )

    @app.middleware("http")
    async def authenticate(request: Request, call_next):
        authorization = request.headers.get("Authorization", "")
        scheme, _, supplied_token = authorization.partition(" ")
        if (
            scheme.lower() != "bearer"
            or not supplied_token
            or not compare_digest(supplied_token, configured_token)
        ):
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid Sidecar session token"},
            )
        return await call_next(request)

    app.include_router(router)
    return app
