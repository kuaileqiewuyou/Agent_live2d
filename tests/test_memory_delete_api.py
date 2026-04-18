import asyncio
import logging
from types import SimpleNamespace

from app.memory.service import MemoryService


def _bootstrap_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "Memory Delete Persona",
            "avatar": "avatar.png",
            "description": "memory delete test",
            "personalityTags": ["calm"],
            "speakingStyle": "natural",
            "backgroundStory": "test",
            "openingMessage": "hi",
            "longTermMemoryEnabled": True,
            "live2dModel": "memory.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are a memory delete assistant",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "Memory Delete Model",
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
            "title": "Memory Delete Conversation",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [],
            "enabledMcpServerIds": [],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"], persona["id"]


def test_delete_long_term_memory_success(client):
    conversation_id, persona_id = _bootstrap_conversation(client)

    created = client.post(
        "/api/memory/long-term",
        json={
            "conversationId": conversation_id,
            "personaId": persona_id,
            "memoryScope": "persona",
            "content": "memory to be deleted",
            "tags": ["delete"],
            "metadata": {"source": "test"},
        },
    )
    assert created.status_code == 201
    memory_id = created.json()["data"]["id"]

    response = client.delete(f"/api/memory/long-term/{memory_id}")
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload == {"deleted": True, "id": memory_id}

    listed = client.get("/api/memory/long-term")
    assert listed.status_code == 200
    ids = [item["id"] for item in listed.json()["data"]["items"]]
    assert memory_id not in ids


def test_delete_long_term_memory_not_found(client):
    response = client.delete("/api/memory/long-term/not-existing")
    assert response.status_code == 404
    data = response.json()["data"]
    assert data["code"] == "not_found"


def test_delete_long_term_memory_keeps_sqlite_flow_when_qdrant_delete_fails(caplog):
    class _LongTermRepo:
        def __init__(self):
            self.deleted_ids = []

        async def delete(self, memory):
            self.deleted_ids.append(memory.id)

    class _SummaryRepo:
        async def create(self, payload):
            return payload

        async def list_by_conversation(self, _conversation_id):
            return []

    repo = _LongTermRepo()
    service = MemoryService(
        long_term_repo=repo,
        summary_repo=_SummaryRepo(),
    )

    async def _broken_delete_memory(*, memory_id):  # noqa: ARG001
        raise RuntimeError("qdrant unavailable")

    service.vector_store.delete_memory = _broken_delete_memory

    with caplog.at_level(logging.WARNING, logger="app.memory.service"):
        asyncio.run(
            service.delete_long_term_memory(
                SimpleNamespace(id="mem-1", vector_id="vec-1"),
            )
        )

    assert repo.deleted_ids == ["mem-1"]
    warning_messages = [
        record.getMessage()
        for record in caplog.records
        if "Qdrant delete degraded; sqlite memory already deleted" in record.getMessage()
    ]
    assert len(warning_messages) == 1
    assert "RuntimeError: qdrant unavailable" in warning_messages[0]
