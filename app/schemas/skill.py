from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.common import TimestampedSchema


class SkillBase(CamelModel):
    name: str
    description: str
    version: str
    author: str
    tags: list[str] = Field(default_factory=list)
    enabled: bool = True
    scope: list[str] = Field(default_factory=list)
    config_schema: dict = Field(default_factory=dict)
    runtime_type: str


class SkillCreate(SkillBase):
    pass


class SkillUpdate(CamelModel):
    name: str | None = None
    description: str | None = None
    version: str | None = None
    author: str | None = None
    tags: list[str] | None = None
    enabled: bool | None = None
    scope: list[str] | None = None
    config_schema: dict | None = None
    runtime_type: str | None = None


class SkillRead(SkillBase, TimestampedSchema):
    id: str


class SkillToggleRequest(CamelModel):
    enabled: bool
