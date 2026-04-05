from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.db.models import Conversation
from app.repositories.base import SQLAlchemyRepository


class ConversationRepository(SQLAlchemyRepository[Conversation]):
    def __init__(self, session):
        super().__init__(session, Conversation)

    async def list_with_relations(self) -> list[Conversation]:
        result = await self.session.execute(
            select(Conversation)
            .options(
                selectinload(Conversation.persona),
                selectinload(Conversation.model_config),
                selectinload(Conversation.skills),
                selectinload(Conversation.mcp_servers),
                selectinload(Conversation.messages),
            )
            .order_by(Conversation.updated_at.desc())
        )
        return list(result.scalars().unique().all())

    async def get_with_relations(self, conversation_id: str) -> Conversation:
        result = await self.session.execute(
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .options(
                selectinload(Conversation.persona),
                selectinload(Conversation.model_config),
                selectinload(Conversation.skills),
                selectinload(Conversation.mcp_servers),
                selectinload(Conversation.messages),
                selectinload(Conversation.summaries),
            )
        )
        conversation = result.scalars().unique().first()
        if conversation is None:
            from app.core.errors import NotFoundError

            raise NotFoundError("conversation")
        return conversation

    async def count_by_persona_id(self, persona_id: str) -> int:
        result = await self.session.execute(
            select(func.count(Conversation.id)).where(Conversation.persona_id == persona_id)
        )
        return int(result.scalar_one())

    async def list_titles_by_persona_id(self, persona_id: str, limit: int = 3) -> list[str]:
        result = await self.session.execute(
            select(Conversation.title)
            .where(Conversation.persona_id == persona_id)
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
        )
        return [title for title in result.scalars().all() if title]
