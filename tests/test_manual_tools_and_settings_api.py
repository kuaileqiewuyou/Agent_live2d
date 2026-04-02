def _bootstrap_tool_enabled_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "tool persona",
            "avatar": "avatar.png",
            "description": "for tool tests",
            "personalityTags": ["calm"],
            "speakingStyle": "natural",
            "backgroundStory": "test background",
            "openingMessage": "hello",
            "longTermMemoryEnabled": True,
            "live2dModel": "tool.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are a tool test assistant",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "tool model",
            "provider": "openai-compatible",
            "baseUrl": "http://localhost:11434/v1",
            "apiKey": "local-key",
            "model": "gpt-test",
            "streamEnabled": True,
            "toolCallSupported": True,
            "isDefault": True,
            "extraConfig": {},
        },
    ).json()["data"]
    skill = client.post(
        "/api/skills",
        json={
            "name": "summary skill",
            "description": "for manual skill trigger",
            "version": "0.1.0",
            "author": "backend",
            "tags": ["summary"],
            "enabled": True,
            "scope": ["conversation"],
            "configSchema": {"type": "object"},
            "runtimeType": "workflow",
        },
    ).json()["data"]
    mcp = client.post(
        "/api/mcp/servers",
        json={
            "name": "Tool MCP",
            "description": "for manual MCP trigger",
            "transportType": "http",
            "endpointOrCommand": "http://localhost:3001",
            "enabled": True,
        },
    ).json()["data"]
    conversation = client.post(
        "/api/conversations",
        json={
            "title": "tool session",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [skill["id"]],
            "enabledMcpServerIds": [mcp["id"]],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"], skill["id"], mcp["id"]


def _apply_typed_skill_schema(client, skill_id: str):
    response = client.patch(
        f"/api/skills/{skill_id}",
        json={
            "configSchema": {
                "type": "object",
                "required": ["budget", "format"],
                "properties": {
                    "budget": {"type": "number"},
                    "format": {"type": "string", "enum": ["json", "markdown"]},
                    "includeRaw": {"type": "boolean"},
                },
            }
        },
    )
    assert response.status_code == 200


def test_send_message_persists_manual_tool_requests_metadata(client):
    conversation_id, skill_id, _ = _bootstrap_tool_enabled_conversation(client)
    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={
            "content": "please run my selected tool first",
            "manualToolRequests": [
                {
                    "id": "manual-skill-1",
                    "type": "skill",
                    "targetId": skill_id,
                    "label": "summary skill",
                    "inputParams": {
                        "goal": "extract key points",
                        "output": "bullet list",
                        "region": "cn-shanghai",
                    },
                    "autoExecute": True,
                }
            ],
        },
    )

    assert response.status_code == 201
    assistant = response.json()["data"]["assistantMessage"]
    metadata = assistant["metadata"]
    assert len(metadata["manualToolRequests"]) == 1
    assert metadata["manualToolRequests"][0]["label"] == "summary skill"
    assert metadata["manualToolRequests"][0]["inputParams"]["goal"] == "extract key points"
    assert metadata["manualToolRequests"][0]["inputParams"]["region"] == "cn-shanghai"

    tool_results = metadata["toolResults"]
    assert len(tool_results) == 1
    assert tool_results[0]["manual"] is True
    assert tool_results[0]["type"] == "skill"
    assert metadata["toolUsage"]["manualCount"] == 1
    assert metadata["toolUsage"]["automaticCount"] == 0
    assert metadata["toolUsage"]["totalCount"] == 1


def test_stream_message_emits_manual_tool_event_markers(client):
    conversation_id, _, mcp_id = _bootstrap_tool_enabled_conversation(client)
    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json={
            "content": "manual mcp only",
            "manualToolRequests": [
                {
                    "id": "manual-mcp-1",
                    "type": "mcp",
                    "targetId": mcp_id,
                    "label": "Tool MCP",
                    "inputParams": {
                        "goal": "fetch summary",
                        "scope": "latest data",
                        "region": "cn-east",
                    },
                    "autoExecute": False,
                }
            ],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: tool_calling" in body
    assert "event: tool_result" in body
    assert "event: final_answer" in body
    assert '"manual": true' in body
    assert '"manualCount": 1' in body
    assert '"toolUsage"' in body
    assert '"manualToolRequests"' in body
    assert "goal: fetch summary" in body
    assert "region: cn-east" in body


def test_settings_get_patch_roundtrip(client):
    initial = client.get("/api/settings")
    assert initial.status_code == 200
    initial_data = initial.json()["data"]
    assert initial_data["theme"] in ("light", "dark", "system")

    patch = client.patch(
        "/api/settings",
        json={
            "theme": "dark",
            "backgroundImage": "linear-gradient(135deg, #111111 0%, #222222 100%)",
            "backgroundBlur": 6,
            "backgroundOverlayOpacity": 0.2,
            "defaultLayoutMode": "companion",
        },
    )
    assert patch.status_code == 200

    updated = client.get("/api/settings")
    assert updated.status_code == 200
    data = updated.json()["data"]
    assert data["theme"] == "dark"
    assert data["backgroundImage"].startswith("linear-gradient")
    assert data["backgroundBlur"] == 6
    assert data["backgroundOverlayOpacity"] == 0.2
    assert data["defaultLayoutMode"] == "companion"


def test_regenerate_without_user_message_returns_400(client):
    conversation_id, _, _ = _bootstrap_tool_enabled_conversation(client)
    regenerate = client.post(f"/api/conversations/{conversation_id}/messages/regenerate")

    assert regenerate.status_code == 400
    payload = regenerate.json()
    assert payload["success"] is False
    assert "No user message found to regenerate" in payload["message"]

def test_send_message_rejects_invalid_typed_manual_tool_params(client):
    conversation_id, skill_id, _ = _bootstrap_tool_enabled_conversation(client)
    _apply_typed_skill_schema(client, skill_id)

    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={
            "content": "typed invalid send",
            "manualToolRequests": [
                {
                    "id": "manual-typed-invalid-1",
                    "type": "skill",
                    "targetId": skill_id,
                    "label": "summary skill",
                    "inputParams": {
                        "budget": "abc",
                        "format": "json",
                    },
                }
            ],
        },
    )

    assert response.status_code == 422
    payload = response.json()
    assert payload["success"] is False
    assert "manualToolRequests[0] invalid params" in payload["message"]
    assert "budget should be a number" in payload["message"]

    messages = client.get(f"/api/conversations/{conversation_id}/messages")
    assert messages.status_code == 200
    assert messages.json()["data"]["total"] == 0


def test_stream_message_rejects_invalid_typed_manual_tool_params(client):
    conversation_id, skill_id, _ = _bootstrap_tool_enabled_conversation(client)
    _apply_typed_skill_schema(client, skill_id)

    response = client.post(
        f"/api/conversations/{conversation_id}/messages/stream",
        json={
            "content": "typed invalid stream",
            "manualToolRequests": [
                {
                    "id": "manual-typed-invalid-stream-1",
                    "type": "skill",
                    "targetId": skill_id,
                    "label": "summary skill",
                    "inputParams": {
                        "budget": "42",
                        "format": "json",
                        "includeRaw": "not-bool",
                    },
                }
            ],
        },
    )

    assert response.status_code == 422
    payload = response.json()
    assert payload["success"] is False
    assert "manualToolRequests[0] invalid params" in payload["message"]
    assert "includeRaw should be true/false" in payload["message"]

