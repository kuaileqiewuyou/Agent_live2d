from __future__ import annotations

import logging

from app.config import get_settings
from app.memory.embeddings import SimpleEmbeddingProvider
from app.memory.qdrant_store import QdrantMemoryStore
from app.repositories import LongTermMemoryRepository, MemorySummaryRepository

logger = logging.getLogger(__name__)


class MemoryService:
    def __init__(
        self,
        *,
        long_term_repo: LongTermMemoryRepository,
        summary_repo: MemorySummaryRepository,
    ) -> None:
        self.long_term_repo = long_term_repo
        self.summary_repo = summary_repo
        settings = get_settings()
        self.embedding_provider = SimpleEmbeddingProvider(settings.embedding_dimensions)
        self.vector_store = QdrantMemoryStore()

    async def create_long_term_memory(self, payload: dict):
        memory = await self.long_term_repo.create(payload)
        try:
            vector = (await self.embedding_provider.embed_texts([memory.content]))[0]
            vector_id = await self.vector_store.upsert_memory(
                memory_id=memory.id,
                vector=vector,
                payload={
                    "conversation_id": memory.conversation_id,
                    "persona_id": memory.persona_id,
                    "memory_scope": memory.memory_scope,
                    "tags": memory.tags,
                    "content": memory.content,
                },
            )
            await self.long_term_repo.update(memory, {"vector_id": vector_id})
        except Exception as exc:  # pragma: no cover - integration path
            logger.warning("Qdrant upsert skipped: %s", exc)
        return memory

    async def search_memories(self, payload: dict) -> list:
        db_items = await self.long_term_repo.search(
            conversation_id=payload.get("conversation_id"),
            persona_id=payload.get("persona_id"),
            memory_scope=payload.get("memory_scope"),
            tags=payload.get("tags"),
        )
        try:
            vector = (await self.embedding_provider.embed_texts([payload["query"]]))[0]
            vector_items = await self.vector_store.search(
                vector=vector,
                limit=payload.get("limit", 5),
                filters={
                    "conversation_id": payload.get("conversation_id"),
                    "persona_id": payload.get("persona_id"),
                    "memory_scope": payload.get("memory_scope"),
                },
            )
            vector_ids = {item["id"] for item in vector_items}
            preferred = [item for item in db_items if item.id in vector_ids]
            if preferred:
                return preferred[: payload.get("limit", 5)]
        except Exception as exc:  # pragma: no cover - integration path
            logger.warning("Qdrant search fallback to sqlite: %s", exc)
        query = payload["query"].lower()
        matched = [item for item in db_items if query in item.content.lower()]
        return (matched or db_items)[: payload.get("limit", 5)]

    async def summarize_conversation(self, *, conversation_id: str, messages: list) -> object:
        summary_text = "\n".join(f"[{message.role}] {message.content}" for message in messages[-8:])
        return await self.summary_repo.create(
            {
                "conversation_id": conversation_id,
                "summary": summary_text[:4000],
                "source_message_count": len(messages),
            }
        )

    async def list_summaries(self, conversation_id: str) -> list:
        return await self.summary_repo.list_by_conversation(conversation_id)
