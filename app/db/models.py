from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


conversation_skills = Table(
    "conversation_skills",
    Base.metadata,
    Column("conversation_id", ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True),
    Column("skill_id", ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True),
)


conversation_mcp_servers = Table(
    "conversation_mcp_servers",
    Base.metadata,
    Column("conversation_id", ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True),
    Column("mcp_server_id", ForeignKey("mcp_servers.id", ondelete="CASCADE"), primary_key=True),
)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )


class Persona(TimestampMixin, Base):
    __tablename__ = "personas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    avatar: Mapped[str] = mapped_column(String(512))
    description: Mapped[str] = mapped_column(Text)
    personality_tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    speaking_style: Mapped[str] = mapped_column(Text)
    background_story: Mapped[str] = mapped_column(Text)
    opening_message: Mapped[str] = mapped_column(Text)
    long_term_memory_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    live2d_model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    default_layout_mode: Mapped[str] = mapped_column(String(32), default="chat")
    system_prompt_template: Mapped[str] = mapped_column(Text)

    conversations: Mapped[list[Conversation]] = relationship(back_populates="persona")


class ModelConfig(TimestampMixin, Base):
    __tablename__ = "model_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    provider: Mapped[str] = mapped_column(String(64))
    base_url: Mapped[str] = mapped_column(String(512))
    api_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    model: Mapped[str] = mapped_column(String(128))
    stream_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    tool_call_supported: Mapped[bool] = mapped_column(Boolean, default=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    extra_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    conversations: Mapped[list[Conversation]] = relationship(back_populates="model_config")


class Skill(TimestampMixin, Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    description: Mapped[str] = mapped_column(Text)
    version: Mapped[str] = mapped_column(String(32))
    author: Mapped[str] = mapped_column(String(128))
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    scope: Mapped[list[str]] = mapped_column(JSON, default=list)
    config_schema: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    runtime_type: Mapped[str] = mapped_column(String(64))

    conversations: Mapped[list[Conversation]] = relationship(
        secondary=conversation_skills,
        back_populates="skills",
    )


class MCPServer(TimestampMixin, Base):
    __tablename__ = "mcp_servers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    description: Mapped[str] = mapped_column(Text)
    transport_type: Mapped[str] = mapped_column(String(32))
    endpoint_or_command: Mapped[str] = mapped_column(String(1024))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(32), default="disconnected")
    tool_count: Mapped[int] = mapped_column(Integer, default=0)
    resource_count: Mapped[int] = mapped_column(Integer, default=0)
    prompt_count: Mapped[int] = mapped_column(Integer, default=0)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    capabilities: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    conversations: Mapped[list[Conversation]] = relationship(
        secondary=conversation_mcp_servers,
        back_populates="mcp_servers",
    )


class Conversation(TimestampMixin, Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(255))
    persona_id: Mapped[str] = mapped_column(ForeignKey("personas.id"))
    model_config_id: Mapped[str] = mapped_column(ForeignKey("model_configs.id"))
    layout_mode: Mapped[str] = mapped_column(String(32))
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)

    persona: Mapped[Persona] = relationship(back_populates="conversations")
    model_config: Mapped[ModelConfig] = relationship(back_populates="conversations")
    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )
    skills: Mapped[list[Skill]] = relationship(
        secondary=conversation_skills,
        back_populates="conversations",
    )
    mcp_servers: Mapped[list[MCPServer]] = relationship(
        secondary=conversation_mcp_servers,
        back_populates="conversations",
    )
    summaries: Mapped[list[MemorySummary]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(32))
    sender_type: Mapped[str] = mapped_column(String(32))
    sender_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    tool_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tool_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    attachments: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class MemorySummary(TimestampMixin, Base):
    __tablename__ = "memory_summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    summary: Mapped[str] = mapped_column(Text)
    source_message_count: Mapped[int] = mapped_column(Integer, default=0)

    conversation: Mapped[Conversation] = relationship(back_populates="summaries")


class LongTermMemory(TimestampMixin, Base):
    __tablename__ = "long_term_memories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    conversation_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"),
        nullable=True,
    )
    persona_id: Mapped[str | None] = mapped_column(
        ForeignKey("personas.id", ondelete="SET NULL"),
        nullable=True,
    )
    memory_scope: Mapped[str] = mapped_column(String(64), default="persona")
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    vector_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    agent_name: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    inputs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    outputs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )
