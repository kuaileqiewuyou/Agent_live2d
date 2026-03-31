def test_persona_crud_flow(client):
    create_response = client.post(
        "/api/personas",
        json={
            "name": "测试人设",
            "avatar": "avatar.png",
            "description": "温柔陪伴型角色",
            "personalityTags": ["温柔", "陪伴"],
            "speakingStyle": "轻柔、简洁",
            "backgroundStory": "来自晨光小镇",
            "openingMessage": "今天想聊点什么？",
            "longTermMemoryEnabled": True,
            "live2dModel": "haru.model3.json",
            "defaultLayoutMode": "companion",
            "systemPromptTemplate": "你是 {{persona_name }}",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()["data"]
    persona_id = created["id"]
    assert created["name"] == "测试人设"

    get_response = client.get(f"/api/personas/{persona_id}")
    assert get_response.status_code == 200
    assert get_response.json()["data"]["id"] == persona_id

    patch_response = client.patch(
        f"/api/personas/{persona_id}",
        json={"description": "更新后的人设说明"},
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["data"]["description"] == "更新后的人设说明"

    delete_response = client.delete(f"/api/personas/{persona_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["success"] is True

