from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.common import TimestampedSchema


class ModelConfigBase(CamelModel):
    name: str
    provider: str
    base_url: str
    api_key: str | None = None
    model: str
    stream_enabled: bool = True
    tool_call_supported: bool = False
    is_default: bool = False
    extra_config: dict = Field(default_factory=dict)


class ModelConfigCreate(ModelConfigBase):
    pass


class ModelConfigUpdate(CamelModel):
    name: str | None = None
    provider: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    model: str | None = None
    stream_enabled: bool | None = None
    tool_call_supported: bool | None = None
    is_default: bool | None = None
    extra_config: dict | None = None


class ModelConfigRead(ModelConfigBase, TimestampedSchema):
    id: str


class ModelConnectionTestResult(CamelModel):
    ok: bool
    provider: str
    model: str
    detail: str
