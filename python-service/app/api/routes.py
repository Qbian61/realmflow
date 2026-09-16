from fastapi import APIRouter

router = APIRouter()


@router.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "realmflow-agent"}


@router.get("/api/v1/info", tags=["system"])
def info() -> dict[str, str]:
    return {
        "name": "RealmFlow Agent",
        "version": "0.1.0",
        "transport": "HTTP/SSE",
    }
