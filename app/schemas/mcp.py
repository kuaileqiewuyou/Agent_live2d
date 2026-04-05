from datetime import datetime

from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.common import TimestampedSchema


class MCPServerBase(CamelModel):
    name: str
    description: str
    transport_type: str
    endpoint_or_command: str
    enabled: bool = True


class MCPServerCreate(MCPServerBase):
    pass


class MCPServerUpdate(CamelModel):
    name: str | None = None
    description: str | None = None
    transport_type: str | None = None
    endpoint_or_command: str | None = None
    enabled: bool | None = None


class MCPServerRead(MCPServerBase, TimestampedSchema):
    id: str
    status: str
    tool_count: int
    resource_count: int
    prompt_count: int
    last_checked_at: datetime | None = None
    capabilities: dict = Field(default_factory=dict)


class MCPServerCheckResult(CamelModel):
    ok: bool
    status: str
    tool_count: int
    resource_count: int
    prompt_count: int
    detail: str
    used_cache: bool = False
