from __future__ import annotations

from app.providers.base import ChatChunk
from app.services import message as message_module


def _bootstrap_tool_enabled_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "Provider Tool Persona",
            "avatar": "avatar.png",
            "description": "provider tool call test",
            "personalityTags": ["calm"],
            "speakingStyle": "natural",
            "backgroundStory": "test",
            "openingMessage": "hi",
            "longTermMemoryEnabled": True,
            "live2dModel": "provider-tool.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are a test assistant",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "Provider Tool Model",
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
            "description": "for provider tool test",
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
            "title": "Provider Tool Conversation",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [skill["id"]],
            "enabledMcpServerIds": [],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"]


class _ToolAwareProvider:
    def __init__(self) -> None:
        self.chat_called = False
        self.chat_with_tools_called = False
        self.stream_with_tools_called = False

    async def chat(self, _messages, **_kwargs):
        self.chat_called = True
        return {"content": "fallback", "tool_calls": []}

    async def chat_with_tools(self, _messages, *, tools, tool_choice="auto", **_kwargs):
        self.chat_with_tools_called = True
        assert isinstance(tools, list) and len(tools) > 0
        return {
            "content": "tool aware response",
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "name": "summary_helper",
                    "arguments": "{\"goal\":\"summary\"}",
                }
            ],
        }

    async def stream_chat(self, _messages, **_kwargs):
        yield ChatChunk(type="token", content="fallback-stream")

    async def stream_chat_with_tools(self, _messages, *, tools, tool_choice="auto", **_kwargs):
        self.stream_with_tools_called = True
        assert isinstance(tools, list) and len(tools) > 0
        yield ChatChunk(type="token", content="tool-stream")


def test_send_message_uses_provider_chat_with_tools_when_supported(client, monkeypatch):
    conversation_id = _bootstrap_tool_enabled_conversation(client)
    provider = _ToolAwareProvider()

    monkeypatch.setattr(
        message_module.ProviderFactory,
        "from_model_config",
        lambda _model_config: provider,
    )

    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"content": "please answer"},
    )

    assert response.status_code == 201
    payload = response.json()["data"]["assistantMessage"]
    assert provider.chat_with_tools_called is True
    assert provider.chat_called is False
    metadata = payload["metadata"]
    assert "providerToolCalls" in metadata
    assert len(metadata["providerToolCalls"]) == 1


def test_stream_message_uses_provider_stream_chat_with_tools_when_supported(client, monkeypatch):
    conversation_id = _bootstrap_tool_enabled_conversation(client)
    provider = _ToolAwareProvider()

    monkeypatch.setattr(
        message_module.ProviderFactory,
        "from_model_config",
        lambda _model_config: provider,
    )

    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json={"content": "please stream"},
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert provider.stream_with_tools_called is True
    assert "event: token" in body
    assert "tool-stream" in body
