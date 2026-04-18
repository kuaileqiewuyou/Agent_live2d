from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas.base import CamelModel


class OpsMCPInstallPreviewRequest(CamelModel):
    link: str
    conversation_id: str | None = None


class OpsMCPInstallExecuteRequest(CamelModel):
    session_id: str
    step_id: str


class OpsMCPInstallStep(CamelModel):
    id: str
    name: str
    title: str
    status: str
    requires_confirm: bool = True
    detail: str = ""
    result: dict[str, Any] = Field(default_factory=dict)
    error_category: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class OpsMCPParsedConfig(CamelModel):
    source_type: str
    name: str
    description: str
    transport_type: str
    endpoint_or_command: str
    advanced_config: dict[str, Any] = Field(default_factory=dict)
    raw: dict[str, Any] = Field(default_factory=dict)


class OpsMCPEnvProbeItem(CamelModel):
    command: str
    available: bool
    path: str | None = None
    version: str | None = None
    detail: str = ""


class OpsMCPInstallSession(CamelModel):
    id: str
    link: str
    conversation_id: str | None = None
    status: str
    summary: str = ""
    parsed_config: OpsMCPParsedConfig
    env_report: list[OpsMCPEnvProbeItem] = Field(default_factory=list)
    steps: list[OpsMCPInstallStep] = Field(default_factory=list)
    server_id: str | None = None
    created_at: datetime
    updated_at: datetime


class OpsMCPInstallPreviewResponse(CamelModel):
    session: OpsMCPInstallSession


class OpsMCPInstallExecuteResponse(CamelModel):
    session: OpsMCPInstallSession
    step: OpsMCPInstallStep

