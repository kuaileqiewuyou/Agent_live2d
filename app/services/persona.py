from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError
from app.repositories import ConversationRepository, PersonaRepository


class PersonaService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = PersonaRepository(session)
        self.conversation_repo = ConversationRepository(session)

    async def list_personas(self):
        return await self.repo.list()

    async def create_persona(self, payload: dict):
        persona = await self.repo.create(payload)
        await self.session.commit()
        return persona

    async def get_persona(self, persona_id: str):
        return await self.repo.get(persona_id, resource_name="persona")

    async def update_persona(self, persona_id: str, payload: dict):
        persona = await self.get_persona(persona_id)
        persona = await self.repo.update(persona, payload)
        await self.session.commit()
        return persona

    async def delete_persona(self, persona_id: str):
        persona = await self.get_persona(persona_id)
        linked_conversation_count = await self.conversation_repo.count_by_persona_id(persona_id)
        if linked_conversation_count > 0:
            sample_titles = await self.conversation_repo.list_titles_by_persona_id(persona_id, limit=3)
            sample_text = " / ".join(sample_titles) if sample_titles else "N/A"
            suffix = " ..." if linked_conversation_count > len(sample_titles) else ""
            raise ConflictError(
                f"Persona is used by {linked_conversation_count} Conversation(s): "
                f"{sample_text}{suffix}. "
                "Please switch Persona in those Conversations before deleting."
            )
        await self.repo.delete(persona)
        await self.session.commit()
