from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.common import TimestampedSchema
from app.schemas.model_config import ModelConfigRead
from app.schemas.persona import PersonaRead
from app.schemas.skill import SkillRead
from app.schemas.mcp import MCPServerRead


class ConversationBase(CamelModel):
    title: str
    persona_id: str
    model_config_id: str
    layout_mode: str
    enabled_skill_ids: list[str] = Field(default_factory=list)
    enabled_mcp_server_ids: list[str] = Field(default_factory=list)
    pinned: bool = False


class ConversationCreate(ConversationBase):
    inherit_persona_long_term_memory: bool = True


class ConversationUpdate(CamelModel):
    title: str | None = None
    persona_id: str | None = None
    model_config_id: str | None = None
    layout_mode: str | None = None
    enabled_skill_ids: list[str] | None = None
    enabled_mcp_server_ids: list[str] | None = None
    pinned: bool | None = None


class ConversationRead(ConversationBase, TimestampedSchema):
    id: str
    last_message: str | None = None
    persona: PersonaRead | None = None
    model_config_detail: ModelConfigRead | None = None
    skills: list[SkillRead] = Field(default_factory=list)
    mcp_servers: list[MCPServerRead] = Field(default_factory=list)
