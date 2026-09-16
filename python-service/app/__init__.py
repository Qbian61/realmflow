from fastapi import FastAPI

from app.api.routes import router


def create_app() -> FastAPI:
    app = FastAPI(
        title="RealmFlow Agent",
        description="Local AI and automation sidecar for RealmFlow.",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
    )
    app.include_router(router)
    return app


app = create_app()
