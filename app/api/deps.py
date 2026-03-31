from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.services import (
    ConversationService,
    MCPServerService,
    MemoryApplicationService,
    MessageService,
    ModelConfigService,
    PersonaService,
    SkillService,
)


async def get_persona_service(session: AsyncSession = get_db_session):
    return PersonaService(session)


async def get_model_service(session: AsyncSession = get_db_session):
    return ModelConfigService(session)


async def get_skill_service(session: AsyncSession = get_db_session):
    return SkillService(session)


async def get_mcp_service(session: AsyncSession = get_db_session):
    return MCPServerService(session)


async def get_conversation_service(session: AsyncSession = get_db_session):
    return ConversationService(session)


async def get_message_service(session: AsyncSession = get_db_session):
    return MessageService(session)


async def get_memory_service(session: AsyncSession = get_db_session):
    return MemoryApplicationService(session)

