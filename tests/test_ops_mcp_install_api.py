from __future__ import annotations

import asyncio
from http import HTTPStatus

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.init_db import init_db
from app.db.models import MCPServer
from app.services.mcp import MCPServerService
from app.services.ops_mcp_installer import OpsMCPInstallerService


def test_ops_mcp_install_preview_with_url(client):
    response = client.post(
        "/api/ops/mcp/install/preview",
        json={"link": "https://example.com/mcp"},
    )
    assert response.status_code == HTTPStatus.OK
    payload = response.json()["data"]["session"]
    assert payload["status"] == "previewed"
    assert payload["parsedConfig"]["sourceType"] == "url"
    assert payload["parsedConfig"]["transportType"] == "http"
    assert payload["parsedConfig"]["endpointOrCommand"] == "https://example.com/mcp"
    assert len(payload["envReport"]) == 6
    assert payload["steps"][0]["id"] == "parse_link"
    assert payload["steps"][0]["status"] == "passed"
    assert payload["steps"][2]["id"] == "create_or_update_server"
    assert payload["steps"][2]["status"] == "pending"


def test_ops_mcp_install_preview_with_github_link(client, monkeypatch: pytest.MonkeyPatch):
    async def fake_readme(self, owner: str, repo: str):
        assert owner == "modelcontextprotocol"
        assert repo == "servers"
        return """
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    }
  }
}
```
"""

    monkeypatch.setattr(OpsMCPInstallerService, "_fetch_github_readme", fake_readme)
    response = client.post(
        "/api/ops/mcp/install/preview",
        json={"link": "https://github.com/modelcontextprotocol/servers"},
    )
    assert response.status_code == HTTPStatus.OK
    payload = response.json()["data"]["session"]["parsedConfig"]
    assert payload["sourceType"] == "github"
    assert payload["transportType"] == "stdio"
    assert payload["endpointOrCommand"] == "npx"
    assert payload["advancedConfig"]["args"] == ["-y", "@modelcontextprotocol/server-filesystem"]


def test_ops_mcp_install_preview_with_github_inline_command_extracts_args(
    client,
    monkeypatch: pytest.MonkeyPatch,
):
    async def fake_readme(self, owner: str, repo: str):
        assert owner == "modelcontextprotocol"
        assert repo == "servers"
        return "Run `npx -y @modelcontextprotocol/server-fetch --transport stdio` to start."

    monkeypatch.setattr(OpsMCPInstallerService, "_fetch_github_readme", fake_readme)
    response = client.post(
        "/api/ops/mcp/install/preview",
        json={"link": "https://github.com/modelcontextprotocol/servers"},
    )
    assert response.status_code == HTTPStatus.OK
    payload = response.json()["data"]["session"]["parsedConfig"]
    assert payload["transportType"] == "stdio"
    assert payload["endpointOrCommand"] == "npx"
    assert payload["advancedConfig"]["args"] == [
        "-y",
        "@modelcontextprotocol/server-fetch",
        "--transport",
        "stdio",
    ]


def test_ops_mcp_install_preview_with_github_link_returns_parse_error_when_not_mcp_repo(
    client,
    monkeypatch: pytest.MonkeyPatch,
):
    async def fake_readme(self, owner: str, repo: str):
        assert owner == "example"
        assert repo == "not-mcp"
        return "# Not MCP\nThis repo has no MCP config."

    monkeypatch.setattr(OpsMCPInstallerService, "_fetch_github_readme", fake_readme)
    response = client.post(
        "/api/ops/mcp/install/preview",
        json={"link": "https://github.com/example/not-mcp"},
    )
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    body = response.json()
    assert body["success"] is False
    assert body["data"]["code"] == "github_readme_parse_failed"


def test_ops_mcp_install_execute_step_requires_order(client):
    preview = client.post(
        "/api/ops/mcp/install/preview",
        json={"link": "https://example.com/mcp"},
    )
    assert preview.status_code == HTTPStatus.OK
    session_id = preview.json()["data"]["session"]["id"]

    execute = client.post(
        "/api/ops/mcp/install/execute",
        json={"sessionId": session_id, "stepId": "smoke_server"},
    )
    assert execute.status_code == HTTPStatus.CONFLICT
    body = execute.json()
    assert body["success"] is False
    assert body["data"]["code"] == "conflict"


def test_ops_mcp_install_execute_flow_success(client, monkeypatch: pytest.MonkeyPatch):
    async def fake_check(self, server_id: str):
        return {
            "ok": True,
            "status": "connected",
            "tool_count": 1,
            "resource_count": 0,
            "prompt_count": 0,
            "detail": "check ok",
            "used_cache": False,
        }

    async def fake_smoke(self, server_id: str, payload=None):
        return {
            "ok": True,
            "status": "connected",
            "steps": [
                {"name": "initialize", "ok": True, "status": "passed", "detail": "initialize ok"},
                {"name": "tools/list", "ok": True, "status": "passed", "detail": "found 1 tool"},
                {"name": "tools/call", "ok": True, "status": "passed", "detail": "tool call completed"},
            ],
            "used_tool_name": "echo",
            "summary": "smoke passed",
        }

    monkeypatch.setattr(MCPServerService, "check_server", fake_check)
    monkeypatch.setattr(MCPServerService, "smoke_server", fake_smoke)

    preview = client.post(
        "/api/ops/mcp/install/preview",
        json={"link": "https://example.com/mcp"},
    )
    assert preview.status_code == HTTPStatus.OK
    session_id = preview.json()["data"]["session"]["id"]

    for step_id in ("create_or_update_server", "check_server", "smoke_server", "enable_server"):
        execute = client.post(
            "/api/ops/mcp/install/execute",
            json={"sessionId": session_id, "stepId": step_id},
        )
        assert execute.status_code == HTTPStatus.OK, execute.json()
        body = execute.json()["data"]
        assert body["step"]["id"] == step_id
        assert body["step"]["status"] == "passed"

    final_state = client.get(f"/api/ops/mcp/install/{session_id}")
    assert final_state.status_code == HTTPStatus.OK
    session = final_state.json()["data"]["session"]
    assert session["status"] == "completed"
    assert session["serverId"]


def test_ops_mcp_install_get_missing_session_returns_not_found(client):
    response = client.get("/api/ops/mcp/install/not-exist-session")
    assert response.status_code == HTTPStatus.NOT_FOUND
    body = response.json()
    assert body["success"] is False
    assert body["data"]["code"] == "not_found"


def test_ops_mcp_install_builtin_chrome_devtools_seeded_on_startup(client):
    response = client.get("/api/mcp/servers")
    assert response.status_code == HTTPStatus.OK
    items = response.json()["data"]["items"]

    seeded = next(item for item in items if item["name"] == "chrome-devtools")
    assert seeded["transportType"] == "stdio"
    assert seeded["endpointOrCommand"] == "npx"
    assert seeded["enabled"] is False
    assert seeded["description"]
    assert seeded["advancedConfig"]["args"] == ["-y", "chrome-devtools-mcp@latest"]
    assert seeded["advancedConfig"] == seeded["capabilities"]["config"]


def test_init_db_seeds_builtin_chrome_devtools_only_once(tmp_path):
    async def run() -> int:
        engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'seed.db'}")
        try:
            await init_db(engine)
            await init_db(engine)

            session_factory = async_sessionmaker(engine, expire_on_commit=False)
            async with session_factory() as session:
                result = await session.execute(select(MCPServer).where(MCPServer.name == "chrome-devtools"))
                items = list(result.scalars().all())
                assert len(items) == 1
                seeded = items[0]
                assert seeded.transport_type == "stdio"
                assert seeded.endpoint_or_command == "npx"
                assert seeded.enabled is False
                assert seeded.capabilities["config"]["args"] == ["-y", "chrome-devtools-mcp@latest"]
                return len(items)
        finally:
            await engine.dispose()

    assert asyncio.run(run()) == 1


def test_mcp_list_self_heals_builtin_chrome_devtools(client):
    listed = client.get("/api/mcp/servers")
    assert listed.status_code == HTTPStatus.OK
    items = listed.json()["data"]["items"]
    seeded = next(item for item in items if item["name"] == "chrome-devtools")

    deleted = client.delete(f"/api/mcp/servers/{seeded['id']}")
    assert deleted.status_code == HTTPStatus.OK

    listed_again = client.get("/api/mcp/servers")
    assert listed_again.status_code == HTTPStatus.OK
    repaired_items = listed_again.json()["data"]["items"]
    repaired = next(item for item in repaired_items if item["name"] == "chrome-devtools")
    assert repaired["enabled"] is False
    assert repaired["endpointOrCommand"] == "npx"
