from sqlalchemy.ext.asyncio import AsyncSession

from app.memory import MemoryService
from app.repositories import LongTermMemoryRepository, MemorySummaryRepository


class MemoryApplicationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.long_term_repo = LongTermMemoryRepository(session)
        self.summary_repo = MemorySummaryRepository(session)
        self.memory_service = MemoryService(
            long_term_repo=self.long_term_repo,
            summary_repo=self.summary_repo,
        )

    async def list_long_term(self):
        return await self.long_term_repo.list()

    async def create_long_term(self, payload: dict):
        entity = await self.memory_service.create_long_term_memory(payload)
        await self.session.commit()
        return entity

    async def delete_long_term(self, memory_id: str):
        entity = await self.long_term_repo.get(memory_id, resource_name="long term memory")
        await self.memory_service.delete_long_term_memory(entity)
        await self.session.commit()
        return {"deleted": True, "id": memory_id}

    async def search(self, payload: dict):
        return await self.memory_service.search_memories(payload)

    async def summarize(self, *, conversation_id: str, messages: list):
        summary = await self.memory_service.summarize_conversation(
            conversation_id=conversation_id,
            messages=messages,
        )
        await self.session.commit()
        return summary

    async def list_summaries(self, conversation_id: str):
        return await self.memory_service.list_summaries(conversation_id)
