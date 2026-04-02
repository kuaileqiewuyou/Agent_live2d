from __future__ import annotations


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

    capabilities = client.get(f"/api/mcp/servers/{server_id}/capabilities")
    assert capabilities.status_code == 200
    cap_data = capabilities.json()["data"]
    assert isinstance(cap_data, dict)
    assert {"tools", "resources", "prompts", "detail"}.issubset(cap_data.keys())


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
