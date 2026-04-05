def _bootstrap_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "StopRegenerate Persona",
            "avatar": "avatar.png",
            "description": "stop regenerate consistency test",
            "personalityTags": ["calm"],
            "speakingStyle": "natural",
            "backgroundStory": "test",
            "openingMessage": "hi",
            "longTermMemoryEnabled": True,
            "live2dModel": "consistency.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are a test assistant",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "StopRegenerate Model",
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
            "title": "StopRegenerate Conversation",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [],
            "enabledMcpServerIds": [],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"]


def test_stop_generation_requires_existing_conversation(client):
    response = client.post("/api/conversations/not-found/messages/stop")

    assert response.status_code == 404
    payload = response.json()
    assert payload["success"] is False
    assert payload["data"]["code"] == "not_found"


def test_stop_generation_returns_expected_payload_for_existing_conversation(client):
    conversation_id = _bootstrap_conversation(client)

    response = client.post(f"/api/conversations/{conversation_id}/messages/stop")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["stopped"] is True
    assert payload["data"]["conversationId"] == conversation_id


def test_regenerate_requires_existing_conversation(client):
    response = client.post("/api/conversations/not-found/messages/regenerate")

    assert response.status_code == 404
    payload = response.json()
    assert payload["success"] is False
    assert payload["data"]["code"] == "not_found"


def test_regenerate_without_user_message_returns_regenerate_not_available(client):
    conversation_id = _bootstrap_conversation(client)

    response = client.post(f"/api/conversations/{conversation_id}/messages/regenerate")

    assert response.status_code == 409
    payload = response.json()
    assert payload["success"] is False
    assert payload["data"]["code"] == "regenerate_not_available"
    assert "No user message found" in payload["message"]
