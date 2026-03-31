from datetime import datetime

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


class MessageCreateRequest(CamelModel):
    content: str
    attachments: list[MessageAttachment] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


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
