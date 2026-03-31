from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation
from app.repositories import (
    ConversationRepository,
    MCPServerRepository,
    MessageRepository,
    ModelConfigRepository,
    PersonaRepository,
    SkillRepository,
)


class ConversationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ConversationRepository(session)
        self.persona_repo = PersonaRepository(session)
        self.model_repo = ModelConfigRepository(session)
        self.skill_repo = SkillRepository(session)
        self.mcp_repo = MCPServerRepository(session)
        self.message_repo = MessageRepository(session)

    async def list_conversations(self):
        return await self.repo.list_with_relations()

    async def get_conversation(self, conversation_id: str):
        return await self.repo.get_with_relations(conversation_id)

    async def create_conversation(self, payload: dict):
        await self.persona_repo.get(payload["persona_id"], resource_name="persona")
        await self.model_repo.get(payload["model_config_id"], resource_name="model config")
        skills = []
        for skill_id in payload.pop("enabled_skill_ids", []):
            skills.append(await self.skill_repo.get(skill_id, resource_name="skill"))
        mcp_servers = []
        for server_id in payload.pop("enabled_mcp_server_ids", []):
            mcp_servers.append(await self.mcp_repo.get(server_id, resource_name="mcp server"))

        entity = Conversation(**payload)
        entity.skills = skills
        entity.mcp_servers = mcp_servers
        self.session.add(entity)
        await self.session.flush()
        await self.session.commit()
        return await self.get_conversation(entity.id)

    async def update_conversation(self, conversation_id: str, payload: dict):
        entity = await self.get_conversation(conversation_id)
        if "enabled_skill_ids" in payload and payload["enabled_skill_ids"] is not None:
            entity.skills = [
                await self.skill_repo.get(skill_id, resource_name="skill")
                for skill_id in payload.pop("enabled_skill_ids")
            ]
        if "enabled_mcp_server_ids" in payload and payload["enabled_mcp_server_ids"] is not None:
            entity.mcp_servers = [
                await self.mcp_repo.get(server_id, resource_name="mcp server")
                for server_id in payload.pop("enabled_mcp_server_ids")
            ]
        entity = await self.repo.update(entity, payload)
        await self.session.commit()
        return await self.get_conversation(entity.id)

    async def delete_conversation(self, conversation_id: str):
        entity = await self.get_conversation(conversation_id)
        await self.repo.delete(entity)
        await self.session.commit()
