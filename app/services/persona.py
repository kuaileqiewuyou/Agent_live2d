from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import PersonaRepository


class PersonaService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = PersonaRepository(session)

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
        await self.repo.delete(persona)
        await self.session.commit()

