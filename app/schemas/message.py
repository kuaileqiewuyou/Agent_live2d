from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel


class MessageAttachment(CamelModel):
    id: str
    name: str
    type: str
    url: str
    size: int


class MessageBase(CamelModel):
    conversation_id: str
    role: str
    sender_type: str
    sender_name: str | None = None
    agent_name: str | None = None
    content: str
    reasoning: str | None = None
    tool_name: str | None = None
    tool_status: str | None = None
    metadata: dict = Field(default_factory=dict, validation_alias="metadata_")
    attachments: list[MessageAttachment] = Field(default_factory=list)


class ManualToolRequest(CamelModel):
    id: str
    type: Literal["skill", "mcp"]
    target_id: str
    label: str
    input_text: str | None = None
    input_params: dict[str, str] = Field(default_factory=dict)
    auto_execute: bool = False


class MessageCreateRequest(CamelModel):
    content: str
    attachments: list[MessageAttachment] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    manual_tool_requests: list[ManualToolRequest] = Field(default_factory=list)
    model_config_id: str | None = None


class MessageRegenerateRequest(CamelModel):
    message_id: str | None = None


class MessageRead(MessageBase):
    id: str
    created_at: datetime


class MessageListData(CamelModel):
    items: list[MessageRead]
    total: int


class ChatTurnResult(CamelModel):
    user_message: MessageRead
    assistant_message: MessageRead


class StreamEvent(CamelModel):
    event: str
    data: dict


class MessageDedupeResult(CamelModel):
    conversation_id: str
    total_before: int
    total_after: int
    deleted_count: int
    deleted_turn_count: int
    deleted_message_ids: list[str] = Field(default_factory=list)
