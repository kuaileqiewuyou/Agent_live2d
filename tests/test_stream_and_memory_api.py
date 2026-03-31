def _bootstrap_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "流式人设",
            "avatar": "avatar.png",
            "description": "用于流式测试",
            "personalityTags": ["冷静"],
            "speakingStyle": "自然",
            "backgroundStory": "测试背景",
            "openingMessage": "你好",
            "longTermMemoryEnabled": True,
            "live2dModel": "stream.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "你是流式测试助手",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "流式测试模型",
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
            "title": "流式会话",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [],
            "enabledMcpServerIds": [],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"], persona["id"]


def test_stream_endpoint_emits_final_answer_and_memory_search_works(client):
    conversation_id, persona_id = _bootstrap_conversation(client)

    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json={"content": "请记住我喜欢爵士乐"},
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: final_answer" in body

    create_memory = client.post(
        "/api/memory/long-term",
        json={
            "conversationId": conversation_id,
            "personaId": persona_id,
            "memoryScope": "persona",
            "content": "用户偏好：喜欢爵士乐和深夜对话",
            "tags": ["preference", "music"],
            "metadata": {"source": "test"},
        },
    )
    assert create_memory.status_code == 201

    search_response = client.post(
        "/api/memory/search",
        json={
            "query": "爵士乐",
            "personaId": persona_id,
            "memoryScope": "persona",
            "limit": 3,
        },
    )
    assert search_response.status_code == 200
    items = search_response.json()["data"]["items"]
    assert len(items) >= 1
    assert "爵士乐" in items[0]["content"]
