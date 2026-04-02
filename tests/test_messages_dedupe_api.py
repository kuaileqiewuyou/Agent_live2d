def _bootstrap_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "dedupe persona",
            "avatar": "avatar.png",
            "description": "for dedupe tests",
            "personalityTags": ["calm"],
            "speakingStyle": "natural",
            "backgroundStory": "test background",
            "openingMessage": "hello",
            "longTermMemoryEnabled": True,
            "live2dModel": "dedupe.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are a dedupe test assistant",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "dedupe model",
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
            "title": "dedupe session",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [],
            "enabledMcpServerIds": [],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"]


def test_dedupe_messages_removes_adjacent_duplicate_turns(client):
    conversation_id = _bootstrap_conversation(client)

    first = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"content": "dedupe check payload"},
    )
    second = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"content": "dedupe check payload"},
    )
    assert first.status_code == 201
    assert second.status_code == 201

    before_messages = client.get(f"/api/conversations/{conversation_id}/messages").json()["data"]["items"]
    assert len(before_messages) == 4

    dedupe = client.post(f"/api/conversations/{conversation_id}/messages/dedupe")
    assert dedupe.status_code == 200
    result = dedupe.json()["data"]
    assert result["conversationId"] == conversation_id
    assert result["totalBefore"] == 4
    assert result["deletedCount"] == 2
    assert result["deletedTurnCount"] == 1
    assert result["totalAfter"] == 2
    assert len(result["deletedMessageIds"]) == 2

    after_messages = client.get(f"/api/conversations/{conversation_id}/messages").json()["data"]["items"]
    assert len(after_messages) == 2
    assert after_messages[0]["role"] == "user"
    assert after_messages[1]["role"] == "assistant"
    assert after_messages[0]["content"] == "dedupe check payload"
    assert "dedupe check payload" in after_messages[1]["content"]


def test_dedupe_messages_noop_when_no_duplicates(client):
    conversation_id = _bootstrap_conversation(client)
    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"content": "single turn should not be deduped"},
    )
    assert response.status_code == 201

    dedupe = client.post(f"/api/conversations/{conversation_id}/messages/dedupe")
    assert dedupe.status_code == 200
    result = dedupe.json()["data"]
    assert result["conversationId"] == conversation_id
    assert result["totalBefore"] == 2
    assert result["totalAfter"] == 2
    assert result["deletedCount"] == 0
    assert result["deletedTurnCount"] == 0
    assert result["deletedMessageIds"] == []
