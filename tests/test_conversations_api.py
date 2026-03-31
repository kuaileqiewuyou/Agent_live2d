def test_conversation_crud_and_message_history(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "默认人设",
            "avatar": "avatar.png",
            "description": "默认测试人设",
            "personalityTags": ["理性"],
            "speakingStyle": "清晰",
            "backgroundStory": "默认背景",
            "openingMessage": "你好",
            "longTermMemoryEnabled": True,
            "live2dModel": "default.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "你是测试助手",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "本地测试模型",
            "provider": "openai-compatible",
            "baseUrl": "http://localhost:11434/v1",
            "apiKey": "local-key",
            "model": "gpt-test",
            "streamEnabled": True,
            "toolCallSupported": True,
            "isDefault": True,
            "extraConfig": {"temperature": 0.7},
        },
    ).json()["data"]
    skill = client.post(
        "/api/skills",
        json={
            "name": "总结助手",
            "description": "生成阶段性总结",
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
            "name": "Local MCP",
            "description": "本地 MCP 测试服务",
            "transportType": "http",
            "endpointOrCommand": "http://localhost:3001",
            "enabled": True,
        },
    ).json()["data"]

    create_response = client.post(
        "/api/conversations",
        json={
            "title": "新的测试会话",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [skill["id"]],
            "enabledMcpServerIds": [mcp["id"]],
            "pinned": False,
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()["data"]
    conversation_id = created["id"]

    list_response = client.get("/api/conversations")
    assert list_response.status_code == 200
    assert any(item["id"] == conversation_id for item in list_response.json()["data"]["items"])

    message_response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"content": "你好，今天心情如何？"},
    )
    assert message_response.status_code == 201

    history_response = client.get(f"/api/conversations/{conversation_id}/messages")
    assert history_response.status_code == 200
    messages = history_response.json()["data"]["items"]
    assert len(messages) >= 2
    assert messages[0]["role"] == "user"
    assert messages[-1]["role"] == "assistant"
