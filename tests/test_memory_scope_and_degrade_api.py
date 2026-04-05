import asyncio
import logging
from types import SimpleNamespace

from app.memory.service import MemoryService
from app.services.memory import MemoryApplicationService


def _bootstrap_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "Memory Scope Persona",
            "avatar": "avatar.png",
            "description": "memory scope boundary test",
            "personalityTags": ["calm"],
            "speakingStyle": "natural",
            "backgroundStory": "test",
            "openingMessage": "hi",
            "longTermMemoryEnabled": True,
            "live2dModel": "memory.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are a memory scope test assistant",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "Memory Scope Model",
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
            "title": "Memory Scope Conversation",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [],
            "enabledMcpServerIds": [],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"], persona["id"]


def test_message_memory_scope_boundary_between_persona_and_conversation(client):
    conversation_id, persona_id = _bootstrap_conversation(client)
    persona_content = "persona memory only: likes coffee"
    conversation_content = "conversation memory only: project codename aurora"

    create_persona_memory = client.post(
        "/api/memory/long-term",
        json={
            "conversationId": conversation_id,
            "personaId": persona_id,
            "memoryScope": "persona",
            "content": persona_content,
            "tags": ["persona"],
            "metadata": {"source": "test"},
        },
    )
    assert create_persona_memory.status_code == 201

    send_response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"content": conversation_content},
    )
    assert send_response.status_code == 201

    conversation_search = client.post(
        "/api/memory/search",
        json={
            "query": "aurora",
            "conversationId": conversation_id,
            "memoryScope": "conversation",
            "limit": 5,
        },
    )
    assert conversation_search.status_code == 200
    conversation_items = conversation_search.json()["data"]["items"]
    assert any(conversation_content in item["content"] for item in conversation_items)
    assert all(item["memoryScope"] == "conversation" for item in conversation_items)

    persona_search = client.post(
        "/api/memory/search",
        json={
            "query": "coffee",
            "personaId": persona_id,
            "memoryScope": "persona",
            "limit": 5,
        },
    )
    assert persona_search.status_code == 200
    persona_items = persona_search.json()["data"]["items"]
    assert any(persona_content in item["content"] for item in persona_items)
    assert all(item["memoryScope"] == "persona" for item in persona_items)


def test_send_message_does_not_fail_when_memory_sync_degrades(client, monkeypatch):
    conversation_id, _ = _bootstrap_conversation(client)

    async def _broken_create_long_term(self, payload):  # noqa: ARG001
        raise RuntimeError("qdrant unavailable")

    monkeypatch.setattr(
        MemoryApplicationService,
        "create_long_term",
        _broken_create_long_term,
    )

    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"content": "degrade send should still return"},
    )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["userMessage"]["role"] == "user"
    assert payload["assistantMessage"]["role"] == "assistant"


def test_stream_message_does_not_fail_when_memory_sync_degrades(client, monkeypatch):
    conversation_id, _ = _bootstrap_conversation(client)

    async def _broken_create_long_term(self, payload):  # noqa: ARG001
        raise RuntimeError("qdrant unavailable")

    monkeypatch.setattr(
        MemoryApplicationService,
        "create_long_term",
        _broken_create_long_term,
    )

    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json={"content": "degrade stream should still return"},
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: final_answer" in body


def test_memory_service_qdrant_warning_is_throttled(monkeypatch, caplog):
    class _LongTermRepo:
        async def create(self, payload):
            return SimpleNamespace(
                id="mem-1",
                conversation_id=payload.get("conversation_id"),
                persona_id=payload.get("persona_id"),
                memory_scope=payload.get("memory_scope"),
                tags=payload.get("tags") or [],
                content=payload["content"],
            )

        async def update(self, _memory, _payload):
            return None

        async def search(self, **_kwargs):
            return []

    class _SummaryRepo:
        async def create(self, payload):
            return payload

        async def list_by_conversation(self, _conversation_id):
            return []

    service = MemoryService(
        long_term_repo=_LongTermRepo(),
        summary_repo=_SummaryRepo(),
    )
    service._qdrant_warning_cooldown_seconds = 30

    async def _broken_upsert_memory(**_kwargs):
        raise RuntimeError()

    async def _fake_embeddings(_texts):
        return [[0.1] * 64]

    service.vector_store.upsert_memory = _broken_upsert_memory
    service.embedding_provider.embed_texts = _fake_embeddings

    timeline = iter([0.0, 5.0, 35.0])
    service._time_monotonic = lambda: next(timeline)

    with caplog.at_level(logging.WARNING, logger="app.memory.service"):
        for _ in range(3):
            asyncio.run(
                service.create_long_term_memory(
                    {
                        "conversation_id": "conv-1",
                        "persona_id": "persona-1",
                        "memory_scope": "conversation",
                        "tags": ["test"],
                        "content": "qdrant throttle verify",
                    }
                )
            )

    warning_messages = [
        record.getMessage()
        for record in caplog.records
        if "Qdrant upsert degraded; keep sqlite-only memory flow" in record.getMessage()
    ]
    assert len(warning_messages) == 2
    assert "RuntimeError: <empty error message>" in warning_messages[0]
    assert "suppressed=1 within 30s" in warning_messages[1]
