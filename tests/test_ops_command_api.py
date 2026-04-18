from __future__ import annotations

from http import HTTPStatus
from pathlib import Path


def test_ops_command_preview_and_execute_success(client):
    preview = client.post(
        "/api/ops/commands/preview",
        json={
            "command": "python --version",
        },
    )
    assert preview.status_code == HTTPStatus.OK
    session = preview.json()["data"]["session"]
    assert session["status"] == "previewed"
    assert session["preview"]["argv"][0].lower().endswith("python")
    assert session["preview"]["requiresConfirm"] is True

    execute = client.post(
        "/api/ops/commands/execute",
        json={"sessionId": session["id"]},
    )
    assert execute.status_code == HTTPStatus.OK
    executed = execute.json()["data"]["session"]
    assert executed["status"] in {"completed", "failed"}
    assert executed["result"] is not None
    assert isinstance(executed["result"]["exitCode"], int)


def test_ops_command_preview_rejects_blocked_pattern(client):
    response = client.post(
        "/api/ops/commands/preview",
        json={"command": "rm -rf /tmp"},
    )
    assert response.status_code == HTTPStatus.FORBIDDEN
    body = response.json()
    assert body["success"] is False
    assert body["data"]["code"] == "forbidden_command"


def test_ops_command_preview_rejects_disallowed_executable(client):
    response = client.post(
        "/api/ops/commands/preview",
        json={"command": "powershell Get-Process"},
    )
    assert response.status_code == HTTPStatus.FORBIDDEN
    body = response.json()
    assert body["success"] is False
    assert body["data"]["code"] == "forbidden_command"


def test_ops_command_preview_rejects_cwd_outside_project_scope(client, tmp_path: Path):
    outside_dir = tmp_path / "outside"
    outside_dir.mkdir(parents=True, exist_ok=True)

    response = client.post(
        "/api/ops/commands/preview",
        json={
            "command": "python --version",
            "cwd": str(outside_dir),
        },
    )
    assert response.status_code == HTTPStatus.FORBIDDEN
    body = response.json()
    assert body["success"] is False
    assert body["data"]["code"] == "forbidden_cwd"


def test_ops_command_get_missing_session_returns_not_found(client):
    response = client.get("/api/ops/commands/not-found-session")
    assert response.status_code == HTTPStatus.NOT_FOUND
    body = response.json()
    assert body["success"] is False
    assert body["data"]["code"] == "not_found"

