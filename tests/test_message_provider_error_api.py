from app.services import message as message_module


def _bootstrap_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "Provider Error Persona",
            "avatar": "avatar.png",
            "description": "provider error mapping test",
            "personalityTags": ["calm"],
            "speakingStyle": "natural",
            "backgroundStory": "test",
            "openingMessage": "hi",
            "longTermMemoryEnabled": True,
            "live2dModel": "provider.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are a test assistant",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "Provider Error Model",
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
    conversation = client.post(
        "/api/conversations",
        json={
            "title": "Provider Error Conversation",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [],
            "enabledMcpServerIds": [],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"]


def _bootstrap_tool_enabled_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "Provider Fallback Persona",
            "avatar": "avatar.png",
            "description": "provider fallback test",
            "personalityTags": ["calm"],
            "speakingStyle": "natural",
            "backgroundStory": "test",
            "openingMessage": "hi",
            "longTermMemoryEnabled": True,
            "live2dModel": "provider-fallback.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are a test assistant",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "Provider Fallback Model",
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
            "description": "summary helper",
            "version": "0.1.0",
            "author": "backend",
            "tags": ["summary"],
            "enabled": True,
            "scope": ["conversation"],
            "configSchema": {"type": "object"},
            "runtimeType": "workflow",
        },
    ).json()["data"]
    conversation = client.post(
        "/api/conversations",
        json={
            "title": "Provider Fallback Conversation",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [skill["id"]],
            "enabledMcpServerIds": [],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"], skill["id"]


class _BrokenProvider:
    async def chat(self, _prompt_messages):
        raise RuntimeError("upstream timeout")


class _BrokenToolProvider:
    async def chat(self, _prompt_messages):
        raise RuntimeError("upstream timeout")

    async def chat_with_tools(self, _prompt_messages, *, tools, tool_choice="auto"):
        raise RuntimeError("upstream timeout")

    async def stream_chat(self, _prompt_messages):
        if False:  # pragma: no cover - async generator shape for tests
            yield {}
        raise RuntimeError("upstream timeout")

    async def stream_chat_with_tools(self, _prompt_messages, *, tools, tool_choice="auto"):
        if False:  # pragma: no cover - async generator shape for tests
            yield {}
        raise RuntimeError("upstream timeout")


def test_send_message_maps_provider_failure_to_provider_error(client, monkeypatch):
    conversation_id = _bootstrap_conversation(client)

    monkeypatch.setattr(
        message_module.ProviderFactory,
        "from_model_config",
        lambda _model_config: _BrokenProvider(),
    )

    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"content": "hello", "metadata": {"strictProvider": True}},
    )

    assert response.status_code == 502
    payload = response.json()
    assert payload["success"] is False
    assert payload["data"]["code"] == "provider_error"
    assert "provider call failed" in payload["message"]


def test_send_message_with_manual_tools_falls_back_when_provider_unavailable(client, monkeypatch):
    conversation_id, skill_id = _bootstrap_tool_enabled_conversation(client)

    monkeypatch.setattr(
        message_module.ProviderFactory,
        "from_model_config",
        lambda _model_config: _BrokenToolProvider(),
    )

    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={
            "content": "run selected tool first",
            "manualToolRequests": [
                {
                    "id": "manual-skill-1",
                    "type": "skill",
                    "targetId": skill_id,
                    "label": "summary skill",
                    "inputParams": {"goal": "summarize"},
                }
            ],
        },
    )

    assert response.status_code == 201
    assistant = response.json()["data"]["assistantMessage"]
    metadata = assistant["metadata"]
    assert "local fallback" in assistant["content"].lower()
    assert metadata["providerFallback"]["used"] is True
    assert metadata["providerFallback"]["code"] == "provider_error"
    assert metadata["toolUsage"]["manualCount"] == 1
    assert len(metadata["manualToolRequests"]) == 1


def test_stream_message_with_manual_tools_falls_back_when_provider_unavailable(client, monkeypatch):
    conversation_id, skill_id = _bootstrap_tool_enabled_conversation(client)

    monkeypatch.setattr(
        message_module.ProviderFactory,
        "from_model_config",
        lambda _model_config: _BrokenToolProvider(),
    )

    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json={
            "content": "run selected tool first",
            "manualToolRequests": [
                {
                    "id": "manual-skill-1",
                    "type": "skill",
                    "targetId": skill_id,
                    "label": "summary skill",
                    "inputParams": {"goal": "summarize"},
                }
            ],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: tool_result" in body
    assert "event: final_answer" in body
    assert "local fallback" in body.lower()
