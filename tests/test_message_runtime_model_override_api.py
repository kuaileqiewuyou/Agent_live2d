from __future__ import annotations

from app.providers import ProviderFactory


class _DummyProvider:
    def __init__(self, config, calls: list[str]) -> None:
        self._config = config
        self._calls = calls

    async def chat(self, _messages):
        self._calls.append(self._config.id)
        return {"content": f"chat:{self._config.model}"}

    async def chat_with_tools(self, _messages, tools):
        self._calls.append(self._config.id)
        return {"content": f"chat:{self._config.model}", "tool_calls": []}

    async def stream_chat(self, _messages):
        self._calls.append(self._config.id)
        yield {"type": "token", "content": f"stream:{self._config.model}"}

    async def stream_chat_with_tools(self, _messages, tools):
        self._calls.append(self._config.id)
        yield {"type": "token", "content": f"stream:{self._config.model}"}


def _patch_provider_factory(monkeypatch, calls: list[str]) -> None:
    def _fake_from_model_config(cls, config):
        return _DummyProvider(config, calls)

    monkeypatch.setattr(ProviderFactory, "from_model_config", classmethod(_fake_from_model_config))


def _bootstrap_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "RuntimeModel Persona",
            "avatar": "avatar.png",
            "description": "runtime model test persona",
            "personalityTags": ["calm"],
            "speakingStyle": "natural",
            "backgroundStory": "test",
            "openingMessage": "hi",
            "longTermMemoryEnabled": True,
            "live2dModel": "runtime.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are a test assistant",
        },
    ).json()["data"]
    model_default = client.post(
        "/api/models/configs",
        json={
            "name": "Runtime Default Model",
            "provider": "openai-compatible",
            "baseUrl": "http://localhost:11434/v1",
            "apiKey": "local-key",
            "model": "model-default",
            "streamEnabled": True,
            "toolCallSupported": True,
            "isDefault": True,
            "extraConfig": {},
        },
    ).json()["data"]
    model_override = client.post(
        "/api/models/configs",
        json={
            "name": "Runtime Override Model",
            "provider": "openai-compatible",
            "baseUrl": "http://localhost:11434/v1",
            "apiKey": "local-key",
            "model": "model-override",
            "streamEnabled": True,
            "toolCallSupported": True,
            "isDefault": False,
            "extraConfig": {},
        },
    ).json()["data"]
    conversation = client.post(
        "/api/conversations",
        json={
            "title": "RuntimeModel Conversation",
            "personaId": persona["id"],
            "modelConfigId": model_default["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [],
            "enabledMcpServerIds": [],
            "pinned": False,
        },
    ).json()["data"]
    return {
        "conversation_id": conversation["id"],
        "default_model": model_default,
        "override_model": model_override,
    }


def test_send_message_uses_runtime_model_override_and_keeps_conversation_default(client, monkeypatch):
    ids = _bootstrap_conversation(client)
    calls: list[str] = []
    _patch_provider_factory(monkeypatch, calls)

    response = client.post(
        f"/api/conversations/{ids['conversation_id']}/messages",
        json={
            "content": "hello",
            "modelConfigId": ids["override_model"]["id"],
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["assistantMessage"]["content"] == "chat:model-override"
    assert calls[-1] == ids["override_model"]["id"]

    messages = client.get(f"/api/conversations/{ids['conversation_id']}/messages").json()["data"]["items"]
    user_message = next(item for item in messages if item["role"] == "user")
    assistant_message = next(item for item in messages if item["role"] == "assistant")
    assert user_message["metadata"]["runtimeModelConfigId"] == ids["override_model"]["id"]
    assert assistant_message["metadata"]["runtimeModelConfigId"] == ids["override_model"]["id"]
    assert assistant_message["metadata"]["runtimeModelName"] == ids["override_model"]["name"]

    conversation = client.get(f"/api/conversations/{ids['conversation_id']}").json()["data"]
    assert conversation["modelConfigId"] == ids["default_model"]["id"]


def test_send_message_with_invalid_runtime_model_returns_not_found(client, monkeypatch):
    ids = _bootstrap_conversation(client)
    calls: list[str] = []
    _patch_provider_factory(monkeypatch, calls)

    response = client.post(
        f"/api/conversations/{ids['conversation_id']}/messages",
        json={
            "content": "hello",
            "modelConfigId": "not-found-model",
        },
    )

    assert response.status_code == 404
    payload = response.json()
    assert payload["success"] is False
    assert payload["data"]["code"] == "not_found"
    assert calls == []


def test_stream_message_uses_runtime_model_override(client, monkeypatch):
    ids = _bootstrap_conversation(client)
    calls: list[str] = []
    _patch_provider_factory(monkeypatch, calls)

    with client.stream(
        "POST",
        f"/api/conversations/{ids['conversation_id']}/messages/stream",
        json={
            "content": "hello",
            "modelConfigId": ids["override_model"]["id"],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: final_answer" in body
    assert "stream:model-override" in body
    assert calls[-1] == ids["override_model"]["id"]


def test_regenerate_prefers_runtime_model_from_latest_user_message(client, monkeypatch):
    ids = _bootstrap_conversation(client)
    calls: list[str] = []
    _patch_provider_factory(monkeypatch, calls)

    first = client.post(
        f"/api/conversations/{ids['conversation_id']}/messages",
        json={"content": "hello", "modelConfigId": ids["override_model"]["id"]},
    )
    assert first.status_code == 201
    calls.clear()

    regenerate = client.post(f"/api/conversations/{ids['conversation_id']}/messages/regenerate")
    assert regenerate.status_code == 200
    assert regenerate.json()["data"]["assistantMessage"]["content"] == "chat:model-override"
    assert calls[-1] == ids["override_model"]["id"]


def test_regenerate_falls_back_to_conversation_default_when_runtime_model_missing(client, monkeypatch):
    ids = _bootstrap_conversation(client)
    calls: list[str] = []
    _patch_provider_factory(monkeypatch, calls)

    first = client.post(
        f"/api/conversations/{ids['conversation_id']}/messages",
        json={"content": "hello", "modelConfigId": ids["override_model"]["id"]},
    )
    assert first.status_code == 201

    delete_response = client.delete(f"/api/models/configs/{ids['override_model']['id']}")
    assert delete_response.status_code == 200

    calls.clear()
    regenerate = client.post(f"/api/conversations/{ids['conversation_id']}/messages/regenerate")
    assert regenerate.status_code == 200
    assert regenerate.json()["data"]["assistantMessage"]["content"] == "chat:model-default"
    assert calls[-1] == ids["default_model"]["id"]
