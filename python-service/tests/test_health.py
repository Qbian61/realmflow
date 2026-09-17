import pytest
from fastapi.testclient import TestClient

from app import create_app


def authenticated_client() -> TestClient:
    return TestClient(
        create_app(auth_token="session-secret"),
        headers={"Authorization": "Bearer session-secret"},
    )


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/health"),
        ("GET", "/api/v1/info"),
        ("POST", "/api/v1/runs"),
        ("GET", "/api/v1/runs/missing/events"),
        ("POST", "/api/v1/runs/missing/cancel"),
    ],
)
def test_every_endpoint_requires_the_sidecar_session_token(
    method: str, path: str
) -> None:
    client = TestClient(create_app(auth_token="session-secret"))

    missing = client.request(method, path)
    invalid = client.request(
        method,
        path,
        headers={"Authorization": "Bearer wrong-secret"},
    )

    assert missing.status_code == 401
    assert invalid.status_code == 401


def test_valid_sidecar_session_token_is_accepted() -> None:
    response = TestClient(
        create_app(auth_token="session-secret")
    ).get(
        "/health",
        headers={"Authorization": "Bearer session-secret"},
    )

    assert response.status_code == 200


def test_health_endpoint() -> None:
    response = authenticated_client().get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "realmflow-agent",
    }


def test_info_endpoint() -> None:
    response = authenticated_client().get("/api/v1/info")

    assert response.status_code == 200
    assert response.json() == {
        "name": "RealmFlow Agent",
        "version": "0.1.0",
        "transport": "HTTP/SSE",
    }
