from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.common import TimestampedSchema


class LongTermMemoryBase(CamelModel):
    conversation_id: str | None = None
    persona_id: str | None = None
    memory_scope: str = "persona"
    content: str
    tags: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict, validation_alias="metadata_")


class LongTermMemoryCreate(LongTermMemoryBase):
    pass


class LongTermMemoryRead(LongTermMemoryBase, TimestampedSchema):
    id: str
    vector_id: str | None = None


class MemorySearchRequest(CamelModel):
    query: str
    conversation_id: str | None = None
    persona_id: str | None = None
    memory_scope: str | None = None
    tags: list[str] | None = None
    limit: int = 5


class MemorySummarizeRequest(CamelModel):
    conversation_id: str
    force: bool = False


class MemorySummaryRead(TimestampedSchema):
    id: str
    conversation_id: str
    summary: str
    source_message_count: int
