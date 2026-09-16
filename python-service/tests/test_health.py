from fastapi.testclient import TestClient

from app import create_app


def test_health_endpoint() -> None:
    response = TestClient(create_app()).get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "realmflow-agent",
    }


def test_info_endpoint() -> None:
    response = TestClient(create_app()).get("/api/v1/info")

    assert response.status_code == 200
    assert response.json() == {
        "name": "RealmFlow Agent",
        "version": "0.1.0",
        "transport": "HTTP/SSE",
    }
