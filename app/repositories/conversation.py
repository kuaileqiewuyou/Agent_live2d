from sqlalchemy import select
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

