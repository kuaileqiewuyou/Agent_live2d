from datetime import datetime

from pydantic import Field, computed_field

from app.schemas.base import CamelModel
from app.schemas.common import TimestampedSchema


class MCPServerBase(CamelModel):
    name: str
    description: str
    transport_type: str
    endpoint_or_command: str
    enabled: bool = True


class MCPServerCreate(MCPServerBase):
    advanced_config: dict | None = None


class MCPServerUpdate(CamelModel):
    name: str | None = None
    description: str | None = None
    transport_type: str | None = None
    endpoint_or_command: str | None = None
    enabled: bool | None = None
    advanced_config: dict | None = None


class MCPServerRead(MCPServerBase, TimestampedSchema):
    id: str
    status: str
    tool_count: int
    resource_count: int
    prompt_count: int
    last_checked_at: datetime | None = None
    capabilities: dict = Field(default_factory=dict)

    @computed_field(alias="advancedConfig")
    @property
    def advanced_config(self) -> dict | None:
        if not isinstance(self.capabilities, dict):
            return None
        config = self.capabilities.get("config")
        return config if isinstance(config, dict) and config else None


class MCPServerCheckResult(CamelModel):
    ok: bool
    status: str
    tool_count: int
    resource_count: int
    prompt_count: int
    detail: str
    used_cache: bool = False


class MCPServerSmokeRequest(CamelModel):
    tool_name: str | None = None
    tool_arguments: dict | None = None


class MCPServerSmokeStep(CamelModel):
    name: str
    ok: bool
    status: str
    detail: str
    error_category: str | None = None
    details: dict | None = None


class MCPServerSmokeResult(CamelModel):
    ok: bool
    status: str
    steps: list[MCPServerSmokeStep] = Field(default_factory=list)
    used_tool_name: str | None = None
    summary: str = ""
