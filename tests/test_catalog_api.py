from __future__ import annotations

from datetime import datetime, timezone


def test_model_config_default_switch_and_test_connection(client):
    first = client.post(
        "/api/models/configs",
        json={
            "name": "model-default-a",
            "provider": "openai-compatible",
            "baseUrl": "http://127.0.0.1:11434/v1",
            "apiKey": "local-key",
            "model": "gpt-a",
            "streamEnabled": True,
            "toolCallSupported": True,
            "isDefault": True,
            "extraConfig": {},
        },
    )
    assert first.status_code == 201
    first_id = first.json()["data"]["id"]

    second = client.post(
        "/api/models/configs",
        json={
            "name": "model-default-b",
            "provider": "openai-compatible",
            "baseUrl": "http://127.0.0.1:11434/v1",
            "apiKey": "local-key",
            "model": "gpt-b",
            "streamEnabled": True,
            "toolCallSupported": True,
            "isDefault": True,
            "extraConfig": {},
        },
    )
    assert second.status_code == 201
    second_id = second.json()["data"]["id"]

    first_after_second = client.get(f"/api/models/configs/{first_id}")
    second_after_second = client.get(f"/api/models/configs/{second_id}")
    assert first_after_second.status_code == 200
    assert second_after_second.status_code == 200
    assert first_after_second.json()["data"]["isDefault"] is False
    assert second_after_second.json()["data"]["isDefault"] is True

    promote_first = client.patch(
        f"/api/models/configs/{first_id}",
        json={"isDefault": True},
    )
    assert promote_first.status_code == 200
    assert promote_first.json()["data"]["isDefault"] is True

    second_after_promote = client.get(f"/api/models/configs/{second_id}")
    assert second_after_promote.status_code == 200
    assert second_after_promote.json()["data"]["isDefault"] is False

    test_result = client.post(f"/api/models/configs/{first_id}/test")
    assert test_result.status_code == 200
    payload = test_result.json()["data"]
    assert payload["provider"] == "openai-compatible"
    assert payload["model"] == "gpt-a"
    assert isinstance(payload["ok"], bool)
    assert isinstance(payload["detail"], str)


def test_skill_toggle_and_delete_flow(client):
    create = client.post(
        "/api/skills",
        json={
            "name": "summary-skill",
            "description": "Generate concise summary",
            "version": "0.1.0",
            "author": "backend",
            "tags": ["summary"],
            "enabled": True,
            "scope": ["conversation"],
            "configSchema": {"type": "object"},
            "runtimeType": "workflow",
        },
    )
    assert create.status_code == 201
    skill_id = create.json()["data"]["id"]

    toggled = client.post(f"/api/skills/{skill_id}/toggle", json={"enabled": False})
    assert toggled.status_code == 200
    assert toggled.json()["data"]["enabled"] is False

    listed = client.get("/api/skills")
    assert listed.status_code == 200
    items = listed.json()["data"]["items"]
    assert any(item["id"] == skill_id and item["enabled"] is False for item in items)

    deleted = client.delete(f"/api/skills/{skill_id}")
    assert deleted.status_code == 200
    assert deleted.json()["data"]["deleted"] is True

    after_delete = client.get(f"/api/skills/{skill_id}")
    assert after_delete.status_code == 404
    assert after_delete.json()["success"] is False


def test_mcp_check_and_capabilities_roundtrip(client):
    create = client.post(
        "/api/mcp/servers",
        json={
            "name": "local-mcp-check",
            "description": "MCP health probe",
            "transportType": "http",
            "endpointOrCommand": "http://127.0.0.1:1",
            "enabled": True,
        },
    )
    assert create.status_code == 201
    server_id = create.json()["data"]["id"]

    check = client.post(f"/api/mcp/servers/{server_id}/check")
    assert check.status_code == 200
    check_data = check.json()["data"]
    assert check_data["status"] in ("connected", "error")
    assert isinstance(check_data["toolCount"], int)
    assert isinstance(check_data["resourceCount"], int)
    assert isinstance(check_data["promptCount"], int)
    assert isinstance(check_data["detail"], str)
    assert isinstance(check_data["usedCache"], bool)

    capabilities = client.get(f"/api/mcp/servers/{server_id}/capabilities")
    assert capabilities.status_code == 200
    cap_data = capabilities.json()["data"]
    assert isinstance(cap_data, dict)
    assert {
        "tools",
        "resources",
        "prompts",
        "detail",
        "source",
        "status",
        "lastCheckedAt",
        "lastSuccessAt",
        "lastError",
    }.issubset(cap_data.keys())


def test_mcp_check_falls_back_to_cached_capabilities_when_probe_fails(client, monkeypatch):
    create = client.post(
        "/api/mcp/servers",
        json={
            "name": "mcp-fallback-check",
            "description": "MCP fallback probe",
            "transportType": "http",
            "endpointOrCommand": "http://127.0.0.1:9999",
            "enabled": True,
        },
    )
    assert create.status_code == 201
    server_id = create.json()["data"]["id"]

    responses = [
        {
            "ok": True,
            "status": "connected",
            "detail": "probe ok",
            "tools": [{"name": "echo", "description": "echo tool"}],
            "resources": [{"name": "docs", "uri": "memory://docs", "description": "doc"}],
            "prompts": [{"name": "hello", "description": "prompt"}],
            "checked_at": datetime.now(timezone.utc),
        },
        {
            "ok": False,
            "status": "error",
            "detail": "probe timeout",
            "tools": [],
            "resources": [],
            "prompts": [],
            "checked_at": datetime.now(timezone.utc),
        },
    ]

    async def fake_inspect_server(self, *, transport_type: str, endpoint_or_command: str):
        assert transport_type == "http"
        assert endpoint_or_command == "http://127.0.0.1:9999"
        return responses.pop(0)

    monkeypatch.setattr(
        "app.services.mcp.MCPClientManager.inspect_server",
        fake_inspect_server,
    )

    first_check = client.post(f"/api/mcp/servers/{server_id}/check")
    assert first_check.status_code == 200
    first_data = first_check.json()["data"]
    assert first_data["ok"] is True
    assert first_data["usedCache"] is False
    assert first_data["toolCount"] == 1
    assert first_data["resourceCount"] == 1
    assert first_data["promptCount"] == 1

    second_check = client.post(f"/api/mcp/servers/{server_id}/check")
    assert second_check.status_code == 200
    second_data = second_check.json()["data"]
    assert second_data["ok"] is False
    assert second_data["status"] == "error"
    assert second_data["usedCache"] is True
    assert second_data["toolCount"] == 1
    assert second_data["resourceCount"] == 1
    assert second_data["promptCount"] == 1
    assert "using cached capabilities" in second_data["detail"]

    capabilities = client.get(f"/api/mcp/servers/{server_id}/capabilities")
    assert capabilities.status_code == 200
    cap_data = capabilities.json()["data"]
    assert cap_data["source"] == "cache"
    assert cap_data["status"] == "error"
    assert cap_data["lastError"] == "probe timeout"
    assert len(cap_data["tools"]) == 1
    assert len(cap_data["resources"]) == 1
    assert len(cap_data["prompts"]) == 1


def test_meta_catalog_endpoints(client):
    providers = client.get("/api/meta/providers")
    assert providers.status_code == 200
    provider_items = providers.json()["data"]["items"]
    assert "openai-compatible" in provider_items
    assert "ollama" in provider_items

    layout_modes = client.get("/api/meta/layout-modes")
    assert layout_modes.status_code == 200
    assert layout_modes.json()["data"]["items"] == ["chat", "companion"]

    live2d_states = client.get("/api/meta/live2d-states")
    assert live2d_states.status_code == 200
    assert "thinking" in live2d_states.json()["data"]["items"]
