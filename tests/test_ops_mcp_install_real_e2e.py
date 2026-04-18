from __future__ import annotations

import os
from http import HTTPStatus

import pytest


def _env_truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


pytestmark = pytest.mark.skipif(
    not _env_truthy("RUN_REAL_MCP_E2E"),
    reason="set RUN_REAL_MCP_E2E=1 to run the real MCP install e2e test",
)


def test_real_ops_mcp_install_flow_completes(client):
    preview = client.post(
        "/api/ops/mcp/install/preview",
        json={"link": "https://github.com/modelcontextprotocol/servers"},
    )
    assert preview.status_code == HTTPStatus.OK, preview.text

    session = preview.json()["data"]["session"]
    session_id = session["id"]
    assert session["status"] == "previewed"
    assert session_id

    for step_id in (
        "create_or_update_server",
        "check_server",
        "smoke_server",
        "enable_server",
    ):
        execute = client.post(
            "/api/ops/mcp/install/execute",
            json={"sessionId": session_id, "stepId": step_id},
        )
        assert execute.status_code == HTTPStatus.OK, execute.text
        body = execute.json()["data"]
        assert body["step"]["id"] == step_id
        assert body["step"]["status"] == "passed"
        session = body["session"]

    final_state = client.get(f"/api/ops/mcp/install/{session_id}")
    assert final_state.status_code == HTTPStatus.OK, final_state.text
    final_session = final_state.json()["data"]["session"]
    assert final_session["status"] == "completed"
    assert final_session["serverId"]

