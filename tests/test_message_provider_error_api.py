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


class _BrokenProvider:
    async def chat(self, _prompt_messages):
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
        json={"content": "hello"},
    )

    assert response.status_code == 502
    payload = response.json()
    assert payload["success"] is False
    assert payload["data"]["code"] == "provider_error"
    assert "provider call failed" in payload["message"]
