from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.models import Message
from app.repositories.base import SQLAlchemyRepository


class MessageRepository(SQLAlchemyRepository[Message]):
    def __init__(self, session):
        super().__init__(session, Message)

    async def list_by_conversation(self, conversation_id: str) -> list[Message]:
        result = await self.session.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .options(selectinload(Message.conversation))
            .order_by(Message.created_at.asc())
        )
        return list(result.scalars().all())

    async def get_last_assistant_message(self, conversation_id: str) -> Message | None:
        result = await self.session.execute(
            select(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.role == "assistant",
            )
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        return result.scalars().first()

