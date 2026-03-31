from sqlalchemy import select

from app.db.models import LongTermMemory, MemorySummary
from app.repositories.base import SQLAlchemyRepository


class LongTermMemoryRepository(SQLAlchemyRepository[LongTermMemory]):
    def __init__(self, session):
        super().__init__(session, LongTermMemory)

    async def search(
        self,
        *,
        conversation_id: str | None = None,
        persona_id: str | None = None,
        memory_scope: str | None = None,
        tags: list[str] | None = None,
    ) -> list[LongTermMemory]:
        query = select(LongTermMemory)
        if conversation_id:
            query = query.where(LongTermMemory.conversation_id == conversation_id)
        if persona_id:
            query = query.where(LongTermMemory.persona_id == persona_id)
        if memory_scope:
            query = query.where(LongTermMemory.memory_scope == memory_scope)
        result = await self.session.execute(query.order_by(LongTermMemory.updated_at.desc()))
        items = list(result.scalars().all())
        if tags:
            tag_set = set(tags)
            items = [item for item in items if tag_set.intersection(item.tags)]
        return items


class MemorySummaryRepository(SQLAlchemyRepository[MemorySummary]):
    def __init__(self, session):
        super().__init__(session, MemorySummary)

    async def list_by_conversation(self, conversation_id: str) -> list[MemorySummary]:
        result = await self.session.execute(
            select(MemorySummary)
            .where(MemorySummary.conversation_id == conversation_id)
            .order_by(MemorySummary.created_at.desc())
        )
        return list(result.scalars().all())
