from __future__ import annotations

import asyncio
import os
import shlex
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http import HTTPStatus
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.errors import AppError
from app.schemas.ops_command import (
    OpsCommandPreview,
    OpsCommandResult,
    OpsCommandSession,
)

_DEFAULT_TIMEOUT_SECONDS = 120.0
_MAX_OUTPUT_CHARS = 24_000
_PROJECT_ROOT_ENV = "OPS_COMMAND_ROOT"

_ALLOWED_COMMANDS = {
    "npm",
    "npx",
    "node",
    "python",
    "py",
    "uv",
    "pytest",
    "git",
    "docker",
    "docker-compose",
    "cargo",
    "rustc",
}

_BLOCKED_KEYWORDS = (
    "rm -rf",
    "del /s",
    "format ",
    "shutdown ",
    "reboot",
    "mkfs",
    "diskpart",
)

_HIGH_RISK_PREFIXES = (
    "git push",
    "git reset --hard",
    "docker compose down -v",
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_executable_name(value: str) -> str:
    candidate = value.strip().strip('"').strip("'")
    lowered = candidate.lower()
    if lowered.endswith(".exe"):
        lowered = lowered[:-4]
    return Path(lowered).name


def _trim_output(value: str) -> str:
    if len(value) <= _MAX_OUTPUT_CHARS:
        return value
    return value[: _MAX_OUTPUT_CHARS - 20] + "\n...output truncated..."


def _path_within(base: Path, target: Path) -> bool:
    try:
        target.relative_to(base)
        return True
    except ValueError:
        return False


@dataclass(slots=True)
class _CommandSessionState:
    id: str
    conversation_id: str | None
    status: str
    summary: str
    preview: dict[str, Any]
    result: dict[str, Any] | None = None
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_category: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_schema(self) -> OpsCommandSession:
        return OpsCommandSession(
            id=self.id,
            conversation_id=self.conversation_id,
            status=self.status,
            summary=self.summary,
            preview=OpsCommandPreview.model_validate(self.preview),
            result=OpsCommandResult.model_validate(self.result) if isinstance(self.result, dict) else None,
            created_at=self.created_at,
            updated_at=self.updated_at,
            started_at=self.started_at,
            finished_at=self.finished_at,
            error_category=self.error_category,
            error_message=self.error_message,
            metadata=self.metadata,
        )


class OpsCommandExecutorService:
    def __init__(self) -> None:
        self._sessions: dict[str, _CommandSessionState] = {}
        self._lock = asyncio.Lock()

    async def preview(
        self,
        *,
        command: str,
        cwd: str | None = None,
        conversation_id: str | None = None,
    ) -> OpsCommandSession:
        parsed = self._build_preview(command=command, cwd=cwd)
        session = _CommandSessionState(
            id=str(uuid4()),
            conversation_id=conversation_id,
            status="previewed",
            summary="command preview ready, waiting for confirmation",
            preview=parsed,
        )
        async with self._lock:
            self._sessions[session.id] = session
        return session.to_schema()

    async def get_session(self, session_id: str) -> OpsCommandSession:
        session = await self._require_session(session_id)
        return session.to_schema()

    async def execute(self, *, session_id: str) -> OpsCommandSession:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                raise AppError("command session not found", status_code=HTTPStatus.NOT_FOUND, code="not_found")
            if session.status == "running":
                raise AppError("command is already running", status_code=HTTPStatus.CONFLICT, code="conflict")
            if session.status == "completed":
                return session.to_schema()
            session.status = "running"
            session.summary = "command running"
            session.started_at = _utc_now()
            session.updated_at = session.started_at
            session.error_category = None
            session.error_message = None

        preview = OpsCommandPreview.model_validate(session.preview)
        started_ts = time.perf_counter()
        try:
            process = await asyncio.create_subprocess_exec(
                *preview.argv,
                cwd=preview.cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout_raw, stderr_raw = await asyncio.wait_for(process.communicate(), timeout=_DEFAULT_TIMEOUT_SECONDS)
            exit_code = int(process.returncode or 0)
            duration_ms = int((time.perf_counter() - started_ts) * 1000)
            result = {
                "exit_code": exit_code,
                "stdout": _trim_output((stdout_raw or b"").decode("utf-8", errors="ignore")),
                "stderr": _trim_output((stderr_raw or b"").decode("utf-8", errors="ignore")),
                "duration_ms": duration_ms,
            }
            async with self._lock:
                current = self._sessions[session_id]
                current.result = result
                current.finished_at = _utc_now()
                current.updated_at = current.finished_at
                current.status = "completed" if exit_code == 0 else "failed"
                current.summary = (
                    "command completed successfully"
                    if exit_code == 0
                    else f"command exited with code {exit_code}"
                )
                if exit_code != 0:
                    current.error_category = "non_zero_exit"
                    current.error_message = result["stderr"] or current.summary
                return current.to_schema()
        except asyncio.TimeoutError as exc:
            async with self._lock:
                current = self._sessions[session_id]
                current.status = "failed"
                current.summary = "command timeout"
                current.finished_at = _utc_now()
                current.updated_at = current.finished_at
                current.error_category = "timeout"
                current.error_message = f"command timed out after {_DEFAULT_TIMEOUT_SECONDS:.0f}s"
            raise AppError(
                f"command timed out after {_DEFAULT_TIMEOUT_SECONDS:.0f}s",
                status_code=HTTPStatus.GATEWAY_TIMEOUT,
                code="timeout",
            ) from exc

    async def _require_session(self, session_id: str) -> _CommandSessionState:
        normalized = str(session_id or "").strip()
        async with self._lock:
            session = self._sessions.get(normalized)
        if session is None:
            raise AppError("command session not found", status_code=HTTPStatus.NOT_FOUND, code="not_found")
        return session

    def _build_preview(self, *, command: str, cwd: str | None) -> dict[str, Any]:
        normalized_command = str(command or "").strip()
        if not normalized_command:
            raise AppError("command is required", status_code=HTTPStatus.UNPROCESSABLE_ENTITY, code="validation_error")

        command_lower = normalized_command.lower()
        for blocked in _BLOCKED_KEYWORDS:
            if blocked in command_lower:
                raise AppError(
                    f"blocked command pattern: {blocked}",
                    status_code=HTTPStatus.FORBIDDEN,
                    code="forbidden_command",
                )

        try:
            argv = shlex.split(normalized_command, posix=False)
        except ValueError as exc:
            raise AppError(
                f"invalid command: {exc}",
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                code="validation_error",
            ) from exc

        if not argv:
            raise AppError("command is empty", status_code=HTTPStatus.UNPROCESSABLE_ENTITY, code="validation_error")

        executable = _normalize_executable_name(argv[0])
        if executable not in _ALLOWED_COMMANDS:
            raise AppError(
                f"command is not allowed: {executable}",
                status_code=HTTPStatus.FORBIDDEN,
                code="forbidden_command",
            )

        resolved_cwd = self._resolve_cwd(cwd)
        risk_level = self._risk_level(normalized_command)
        notes = [
            "only project-scoped execution is allowed",
            "dangerous commands are blocked",
        ]
        if risk_level == "high":
            notes.append("high risk command, confirm carefully")

        return {
            "command": normalized_command,
            "argv": argv,
            "cwd": str(resolved_cwd),
            "risk_level": risk_level,
            "requires_confirm": True,
            "notes": notes,
        }

    def _resolve_cwd(self, cwd: str | None) -> Path:
        root = Path(os.getenv(_PROJECT_ROOT_ENV) or os.getcwd()).resolve()
        target = Path(cwd).resolve() if isinstance(cwd, str) and cwd.strip() else root
        if not _path_within(root, target):
            raise AppError(
                f"cwd out of project scope: {target}",
                status_code=HTTPStatus.FORBIDDEN,
                code="forbidden_cwd",
                details={"projectRoot": str(root), "cwd": str(target)},
            )
        if not target.exists() or not target.is_dir():
            raise AppError(
                f"cwd does not exist: {target}",
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                code="validation_error",
            )
        return target

    @staticmethod
    def _risk_level(command: str) -> str:
        normalized = command.strip().lower()
        if any(normalized.startswith(prefix) for prefix in _HIGH_RISK_PREFIXES):
            return "high"
        if normalized.startswith("git ") or normalized.startswith("docker "):
            return "medium"
        return "low"


_OPS_COMMAND_EXECUTOR_SERVICE = OpsCommandExecutorService()


def get_ops_command_executor_service() -> OpsCommandExecutorService:
    return _OPS_COMMAND_EXECUTOR_SERVICE

