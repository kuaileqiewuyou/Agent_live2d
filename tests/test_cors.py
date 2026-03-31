from fastapi.testclient import TestClient

from app.main import create_app


def test_cors_preflight_allows_frontend_origin():
    client = TestClient(create_app())

    response = client.options(
        "/api/personas",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
