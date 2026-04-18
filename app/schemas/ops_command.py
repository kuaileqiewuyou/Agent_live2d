from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas.base import CamelModel


class OpsCommandPreviewRequest(CamelModel):
    command: str
    cwd: str | None = None
    conversation_id: str | None = None


class OpsCommandExecuteRequest(CamelModel):
    session_id: str


class OpsCommandPreview(CamelModel):
    command: str
    argv: list[str] = Field(default_factory=list)
    cwd: str
    risk_level: str
    requires_confirm: bool = True
    notes: list[str] = Field(default_factory=list)


class OpsCommandResult(CamelModel):
    exit_code: int
    stdout: str = ""
    stderr: str = ""
    duration_ms: int


class OpsCommandSession(CamelModel):
    id: str
    conversation_id: str | None = None
    status: str
    summary: str
    preview: OpsCommandPreview
    result: OpsCommandResult | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_category: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class OpsCommandPreviewResponse(CamelModel):
    session: OpsCommandSession


class OpsCommandExecuteResponse(CamelModel):
    session: OpsCommandSession

