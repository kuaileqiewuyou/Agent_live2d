from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import SkillRepository
from app.skills import SkillRegistry


class SkillService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = SkillRepository(session)
        self.registry = SkillRegistry()

    async def list_skills(self):
        return await self.repo.list()

    async def create_skill(self, payload: dict):
        skill = await self.repo.create(payload)
        await self.session.commit()
        return skill

    async def get_skill(self, skill_id: str):
        return await self.repo.get(skill_id, resource_name="skill")

    async def update_skill(self, skill_id: str, payload: dict):
        skill = await self.get_skill(skill_id)
        skill = await self.repo.update(skill, payload)
        await self.session.commit()
        return skill

    async def delete_skill(self, skill_id: str):
        skill = await self.get_skill(skill_id)
        await self.repo.delete(skill)
        await self.session.commit()

    async def toggle_skill(self, skill_id: str, enabled: bool):
        skill = await self.get_skill(skill_id)
        skill = await self.repo.update(skill, {"enabled": enabled})
        await self.session.commit()
        return skill

