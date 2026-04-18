from __future__ import annotations

import asyncio
import json
import logging
import re
import shlex
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http import HTTPStatus
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx

from app.core.errors import AppError
from app.schemas.ops import (
    OpsMCPEnvProbeItem,
    OpsMCPInstallSession,
    OpsMCPInstallStep,
    OpsMCPParsedConfig,
)
from app.services.mcp import MCPServerService

logger = logging.getLogger(__name__)

_GITHUB_URL_RE = re.compile(r"^https?://(?:www\.)?github\.com/([^/\s]+)/([^/\s#?]+)")
_HTTP_URL_RE = re.compile(r"^https?://", re.IGNORECASE)
_CODE_BLOCK_RE = re.compile(r"```(?:json|jsonc)?\s*(\{[\s\S]*?\})\s*```", re.IGNORECASE)
_FENCED_BLOCK_RE = re.compile(r"```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```")
_INLINE_CODE_RE = re.compile(r"`([^`\n\r]+)`")
_COMMAND_LINE_RE = re.compile(r"(?im)^\s*(?:\$|>)?\s*((?:npx|uvx|python3?|node|deno|docker)\b[^\n\r]*)$")
_HTTP_IN_TEXT_RE = re.compile(r"https?://[^\s\"'`]+")
_STEP_IDS = (
    "parse_link",
    "probe_env",
    "create_or_update_server",
    "check_server",
    "smoke_server",
    "enable_server",
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class _InstallSessionState:
    id: str
    link: str
    conversation_id: str | None
    parsed_config: dict[str, Any]
    env_report: list[dict[str, Any]]
    status: str
    summary: str
    steps: list[dict[str, Any]]
    server_id: str | None = None
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)

    def to_schema(self) -> OpsMCPInstallSession:
        parsed = OpsMCPParsedConfig.model_validate(self.parsed_config)
        env_report = [OpsMCPEnvProbeItem.model_validate(item) for item in self.env_report]
        steps = [OpsMCPInstallStep.model_validate(item) for item in self.steps]
        return OpsMCPInstallSession(
            id=self.id,
            link=self.link,
            conversation_id=self.conversation_id,
            status=self.status,
            summary=self.summary,
            parsed_config=parsed,
            env_report=env_report,
            steps=steps,
            server_id=self.server_id,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )


class OpsMCPInstallerService:
    def __init__(self) -> None:
        self._sessions: dict[str, _InstallSessionState] = {}
        self._lock = asyncio.Lock()

    async def preview(self, *, link: str, conversation_id: str | None = None) -> OpsMCPInstallSession:
        normalized_link = str(link or "").strip()
        if not normalized_link:
            raise AppError(
                "link is required",
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                code="validation_error",
            )

        parsed_config = await self._parse_link(normalized_link)
        env_report = await self._probe_environment()
        now = _utc_now()
        session_state = _InstallSessionState(
            id=str(uuid4()),
            link=normalized_link,
            conversation_id=conversation_id,
            parsed_config=parsed_config,
            env_report=env_report,
            status="previewed",
            summary="ready to execute install steps",
            steps=self._build_initial_steps(now),
            created_at=now,
            updated_at=now,
        )
        async with self._lock:
            self._sessions[session_state.id] = session_state
        return session_state.to_schema()

    async def get_session(self, session_id: str) -> OpsMCPInstallSession:
        session = await self._require_session(session_id)
        return session.to_schema()

    async def execute_step(
        self,
        *,
        session_id: str,
        step_id: str,
        mcp_service: MCPServerService,
    ) -> tuple[OpsMCPInstallSession, OpsMCPInstallStep]:
        normalized_step_id = str(step_id or "").strip()
        if not normalized_step_id:
            raise AppError(
                "step_id is required",
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                code="validation_error",
            )

        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                raise AppError(
                    "install session not found",
                    status_code=HTTPStatus.NOT_FOUND,
                    code="not_found",
                )

            target_index = self._step_index(session.steps, normalized_step_id)
            step = session.steps[target_index]
            if bool(step.get("requires_confirm")) and not self._all_previous_steps_passed(session.steps, target_index):
                raise AppError(
                    "previous steps are not completed",
                    status_code=HTTPStatus.CONFLICT,
                    code="conflict",
                )
            if step.get("status") == "running":
                raise AppError(
                    "step is already running",
                    status_code=HTTPStatus.CONFLICT,
                    code="conflict",
                )
            if step.get("status") == "passed":
                return session.to_schema(), OpsMCPInstallStep.model_validate(step)

            now = _utc_now()
            step["status"] = "running"
            step["detail"] = "running..."
            step["error_category"] = None
            step["started_at"] = now
            step["finished_at"] = None
            session.status = "running"
            session.updated_at = now

        try:
            result_detail, result_payload = await self._run_step(
                session=session,
                step_id=normalized_step_id,
                mcp_service=mcp_service,
            )
        except AppError as exc:
            await self._mark_step_failed(
                session_id=session_id,
                step_id=normalized_step_id,
                detail=exc.message,
                error_category=exc.code,
            )
            raise
        except Exception as exc:  # pragma: no cover - defensive fallback
            logger.exception("ops mcp installer step failed: %s", normalized_step_id)
            await self._mark_step_failed(
                session_id=session_id,
                step_id=normalized_step_id,
                detail=str(exc),
                error_category="runtime_error",
            )
            raise AppError(
                f"step failed: {exc}",
                status_code=HTTPStatus.BAD_GATEWAY,
                code="runtime_error",
            ) from exc

        async with self._lock:
            session = self._sessions[session_id]
            index = self._step_index(session.steps, normalized_step_id)
            now = _utc_now()
            step = session.steps[index]
            step["status"] = "passed"
            step["detail"] = result_detail
            step["result"] = result_payload
            step["error_category"] = None
            step["finished_at"] = now
            session.updated_at = now

            executable_steps = [item for item in session.steps if bool(item.get("requires_confirm"))]
            if executable_steps and all(item.get("status") == "passed" for item in executable_steps):
                session.status = "completed"
                session.summary = "installation completed"
            else:
                session.status = "running"
                session.summary = f"step {normalized_step_id} completed"

            return session.to_schema(), OpsMCPInstallStep.model_validate(step)

    async def _mark_step_failed(
        self,
        *,
        session_id: str,
        step_id: str,
        detail: str,
        error_category: str | None = None,
    ) -> None:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return
            index = self._step_index(session.steps, step_id)
            now = _utc_now()
            step = session.steps[index]
            step["status"] = "failed"
            step["detail"] = detail
            step["error_category"] = error_category or "runtime_error"
            step["finished_at"] = now
            session.status = "failed"
            session.summary = f"step {step_id} failed"
            session.updated_at = now

    async def _run_step(
        self,
        *,
        session: _InstallSessionState,
        step_id: str,
        mcp_service: MCPServerService,
    ) -> tuple[str, dict[str, Any]]:
        if step_id == "create_or_update_server":
            return await self._step_create_or_update_server(session, mcp_service)
        if step_id == "check_server":
            return await self._step_check_server(session, mcp_service)
        if step_id == "smoke_server":
            return await self._step_smoke_server(session, mcp_service)
        if step_id == "enable_server":
            return await self._step_enable_server(session, mcp_service)
        raise AppError(
            f"step is not executable: {step_id}",
            status_code=HTTPStatus.BAD_REQUEST,
            code="validation_error",
        )

    async def _step_create_or_update_server(
        self,
        session: _InstallSessionState,
        mcp_service: MCPServerService,
    ) -> tuple[str, dict[str, Any]]:
        parsed = session.parsed_config
        existing = await mcp_service.list_servers()
        match = next(
            (
                item
                for item in existing
                if item.name == parsed["name"]
                or (
                    item.transport_type == parsed["transport_type"]
                    and item.endpoint_or_command == parsed["endpoint_or_command"]
                )
            ),
            None,
        )

        payload = {
            "name": parsed["name"],
            "description": parsed["description"],
            "transport_type": parsed["transport_type"],
            "endpoint_or_command": parsed["endpoint_or_command"],
            "enabled": False,
            "advanced_config": parsed.get("advanced_config", {}),
        }
        if match is None:
            entity = await mcp_service.create_server(payload)
            session.server_id = entity.id
            return "server created (disabled by default)", {"serverId": entity.id, "created": True}

        entity = await mcp_service.update_server(match.id, payload)
        session.server_id = entity.id
        return "server updated (disabled by default)", {"serverId": entity.id, "created": False}

    async def _step_check_server(
        self,
        session: _InstallSessionState,
        mcp_service: MCPServerService,
    ) -> tuple[str, dict[str, Any]]:
        server_id = self._require_server_id(session)
        result = await mcp_service.check_server(server_id)
        if not bool(result.get("ok")):
            raise AppError(
                result.get("detail") or "check failed",
                status_code=HTTPStatus.BAD_GATEWAY,
                code="check_failed",
                details={"result": result},
            )
        detail = str(result.get("detail") or "check passed")
        return detail, result

    async def _step_smoke_server(
        self,
        session: _InstallSessionState,
        mcp_service: MCPServerService,
    ) -> tuple[str, dict[str, Any]]:
        server_id = self._require_server_id(session)
        result = await mcp_service.smoke_server(server_id, None)
        if not bool(result.get("ok")):
            raise AppError(
                result.get("summary") or "smoke failed",
                status_code=HTTPStatus.BAD_GATEWAY,
                code="smoke_failed",
                details={"result": result},
            )
        detail = str(result.get("summary") or "smoke passed")
        return detail, result

    async def _step_enable_server(
        self,
        session: _InstallSessionState,
        mcp_service: MCPServerService,
    ) -> tuple[str, dict[str, Any]]:
        server_id = self._require_server_id(session)
        entity = await mcp_service.update_server(server_id, {"enabled": True})
        return "server enabled", {"serverId": entity.id, "enabled": entity.enabled}

    @staticmethod
    def _require_server_id(session: _InstallSessionState) -> str:
        if not session.server_id:
            raise AppError(
                "server is not created yet",
                status_code=HTTPStatus.CONFLICT,
                code="conflict",
            )
        return session.server_id

    async def _require_session(self, session_id: str) -> _InstallSessionState:
        normalized = str(session_id or "").strip()
        async with self._lock:
            session = self._sessions.get(normalized)
        if session is None:
            raise AppError(
                "install session not found",
                status_code=HTTPStatus.NOT_FOUND,
                code="not_found",
            )
        return session

    @staticmethod
    def _step_index(steps: list[dict[str, Any]], step_id: str) -> int:
        for index, step in enumerate(steps):
            if step.get("id") == step_id:
                return index
        raise AppError(
            f"step not found: {step_id}",
            status_code=HTTPStatus.NOT_FOUND,
            code="not_found",
        )

    @staticmethod
    def _all_previous_steps_passed(steps: list[dict[str, Any]], index: int) -> bool:
        for item in steps[:index]:
            if not item.get("requires_confirm"):
                continue
            if item.get("status") != "passed":
                return False
        return True

    @staticmethod
    def _build_initial_steps(now: datetime) -> list[dict[str, Any]]:
        titles = {
            "parse_link": "解析链接",
            "probe_env": "检测环境",
            "create_or_update_server": "创建或更新 MCP Server（默认禁用）",
            "check_server": "执行连接检查（check）",
            "smoke_server": "执行可调用验收（smoke）",
            "enable_server": "启用 MCP Server",
        }
        details = {
            "parse_link": "link parsed",
            "probe_env": "environment probe completed",
        }
        steps: list[dict[str, Any]] = []
        for step_id in _STEP_IDS:
            auto_done = step_id in {"parse_link", "probe_env"}
            steps.append(
                {
                    "id": step_id,
                    "name": step_id,
                    "title": titles[step_id],
                    "status": "passed" if auto_done else "pending",
                    "requires_confirm": not auto_done,
                    "detail": details.get(step_id, "waiting for confirmation"),
                    "result": {},
                    "error_category": None,
                    "started_at": now if auto_done else None,
                    "finished_at": now if auto_done else None,
                }
            )
        return steps

    async def _parse_link(self, link: str) -> dict[str, Any]:
        raw = link.strip()
        if not raw:
            raise AppError(
                "link is required",
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                code="validation_error",
            )
        parsed_from_snippet = self._parse_config_snippet(raw)
        if parsed_from_snippet is not None:
            return parsed_from_snippet
        if _HTTP_URL_RE.match(raw):
            github_match = _GITHUB_URL_RE.match(raw)
            if github_match:
                return await self._parse_github_link(raw, github_match.group(1), github_match.group(2))
            return {
                "source_type": "url",
                "name": self._default_name_from_url(raw),
                "description": "Imported from MCP endpoint URL",
                "transport_type": "http",
                "endpoint_or_command": raw,
                "advanced_config": {},
                "raw": {"link": raw},
            }

        raise AppError(
            "unsupported link format, expected URL / JSON snippet / GitHub link",
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            code="invalid_link",
        )

    def _parse_config_snippet(self, snippet: str) -> dict[str, Any] | None:
        normalized = snippet.strip()
        if not normalized:
            return None
        if not (normalized.startswith("{") and normalized.endswith("}")):
            return None
        try:
            payload = json.loads(normalized)
        except json.JSONDecodeError as exc:
            raise AppError(
                f"invalid JSON snippet: {exc}",
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                code="invalid_snippet",
            ) from exc
        if not isinstance(payload, dict):
            raise AppError(
                "invalid snippet: root should be object",
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                code="invalid_snippet",
            )
        return self._extract_config_from_json(payload)

    async def _parse_github_link(self, link: str, owner: str, repo: str) -> dict[str, Any]:
        cleaned_repo = repo.removesuffix(".git")
        readme_text = await self._fetch_github_readme(owner, cleaned_repo)
        candidate_objects: list[dict[str, Any]] = []
        for block in _CODE_BLOCK_RE.findall(readme_text):
            try:
                payload = json.loads(block)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                candidate_objects.append(payload)

        for item in candidate_objects:
            try:
                return self._extract_config_from_json(item, source_type="github", fallback_name=cleaned_repo)
            except AppError:
                continue

        command_candidate = self._extract_command_from_readme(readme_text)
        if command_candidate is not None:
            command, args = command_candidate
            advanced_config: dict[str, Any] = {}
            if args:
                advanced_config["args"] = args
            return {
                "source_type": "github",
                "name": cleaned_repo,
                "description": f"Imported from GitHub README: {owner}/{cleaned_repo}",
                "transport_type": "stdio",
                "endpoint_or_command": command,
                "advanced_config": advanced_config,
                "raw": {"link": link, "source": "readme_command"},
            }

        endpoint_match = _HTTP_IN_TEXT_RE.search(readme_text)
        if endpoint_match:
            endpoint = endpoint_match.group(0).strip()
            return {
                "source_type": "github",
                "name": cleaned_repo,
                "description": f"Imported from GitHub README: {owner}/{cleaned_repo}",
                "transport_type": "http",
                "endpoint_or_command": endpoint,
                "advanced_config": {},
                "raw": {"link": link, "source": "readme_endpoint"},
            }

        raise AppError(
            "unable to parse MCP config from GitHub README",
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            code="github_readme_parse_failed",
            details={"reason": "mcp_config_not_found", "owner": owner, "repo": cleaned_repo},
        )

    @staticmethod
    def _extract_command_from_readme(readme_text: str) -> tuple[str, list[str]] | None:
        candidates: list[str] = []
        for block in _FENCED_BLOCK_RE.findall(readme_text):
            for line in block.splitlines():
                normalized_line = line.strip()
                if normalized_line:
                    candidates.append(normalized_line)

        for inline_code in _INLINE_CODE_RE.findall(readme_text):
            normalized_inline = inline_code.strip()
            if normalized_inline:
                candidates.append(normalized_inline)

        for line_match in _COMMAND_LINE_RE.finditer(readme_text):
            line_candidate = line_match.group(1).strip()
            if line_candidate:
                candidates.append(line_candidate)

        for candidate in candidates:
            parsed = OpsMCPInstallerService._parse_command_candidate(candidate)
            if parsed is not None:
                return parsed
        return None

    @staticmethod
    def _parse_command_candidate(candidate: str) -> tuple[str, list[str]] | None:
        normalized = str(candidate or "").strip()
        if not normalized:
            return None
        if normalized.startswith(("$", ">")):
            normalized = normalized[1:].strip()
        try:
            parts = shlex.split(normalized, posix=True)
        except ValueError:
            return None
        if not parts:
            return None
        command = parts[0].strip()
        if command.lower() not in {"npx", "uvx", "python", "python3", "node", "deno", "docker"}:
            return None
        args = [part for part in parts[1:] if str(part).strip()]
        return command, args

    async def _fetch_github_readme(self, owner: str, repo: str) -> str:
        candidates = [
            f"https://raw.githubusercontent.com/{owner}/{repo}/main/README.md",
            f"https://raw.githubusercontent.com/{owner}/{repo}/master/README.md",
        ]
        async with httpx.AsyncClient(timeout=8.0) as client:
            for candidate in candidates:
                try:
                    response = await client.get(candidate)
                    if response.status_code == HTTPStatus.OK and response.text.strip():
                        return response.text
                except Exception:
                    continue
        raise AppError(
            "failed to fetch GitHub README",
            status_code=HTTPStatus.BAD_GATEWAY,
            code="github_readme_unavailable",
        )

    def _extract_config_from_json(
        self,
        payload: dict[str, Any],
        *,
        source_type: str = "snippet",
        fallback_name: str | None = None,
    ) -> dict[str, Any]:
        if "mcpServers" in payload and isinstance(payload.get("mcpServers"), dict):
            mcp_servers = payload["mcpServers"]
            for name, config in mcp_servers.items():
                if isinstance(config, dict):
                    return self._normalize_config_payload(
                        config,
                        source_type=source_type,
                        default_name=str(name),
                    )
            raise AppError(
                "invalid snippet: mcpServers has no valid entry",
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                code="invalid_snippet",
            )
        return self._normalize_config_payload(
            payload,
            source_type=source_type,
            default_name=fallback_name or "Imported MCP",
        )

    def _normalize_config_payload(
        self,
        payload: dict[str, Any],
        *,
        source_type: str,
        default_name: str,
    ) -> dict[str, Any]:
        name = str(payload.get("name") or default_name).strip() or default_name
        description = str(payload.get("description") or f"Imported from {source_type}").strip()

        if isinstance(payload.get("url"), str) and payload["url"].strip():
            return {
                "source_type": source_type,
                "name": name,
                "description": description,
                "transport_type": "http",
                "endpoint_or_command": payload["url"].strip(),
                "advanced_config": self._extract_advanced_config(payload),
                "raw": payload,
            }

        command = str(payload.get("command") or payload.get("endpointOrCommand") or "").strip()
        if command:
            advanced_config = self._extract_advanced_config(payload)
            args_raw = payload.get("args")
            if isinstance(args_raw, list):
                args = [str(item).strip() for item in args_raw if isinstance(item, str) and str(item).strip()]
                if args:
                    advanced_config["args"] = args
            env_raw = payload.get("env")
            if isinstance(env_raw, dict):
                env = {
                    str(key).strip(): str(value).strip()
                    for key, value in env_raw.items()
                    if isinstance(key, str) and key.strip() and isinstance(value, str)
                }
                if env:
                    advanced_config["env"] = env

            transport_type = str(payload.get("transportType") or "stdio").strip().lower()
            if transport_type not in {"stdio", "http"}:
                transport_type = "stdio"
            return {
                "source_type": source_type,
                "name": name,
                "description": description,
                "transport_type": transport_type,
                "endpoint_or_command": command,
                "advanced_config": advanced_config,
                "raw": payload,
            }

        raise AppError(
            "invalid MCP config: expected url or command",
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            code="invalid_snippet",
        )

    @staticmethod
    def _extract_advanced_config(payload: dict[str, Any]) -> dict[str, Any]:
        advanced = payload.get("advancedConfig")
        if isinstance(advanced, dict):
            return dict(advanced)
        return {}

    @staticmethod
    def _default_name_from_url(link: str) -> str:
        parsed = urlparse(link)
        host = parsed.netloc or "mcp-server"
        path = parsed.path.strip("/")
        if not path:
            return host
        tail = path.split("/")[-1]
        return f"{host}-{tail}"[:64]

    async def _probe_environment(self) -> list[dict[str, Any]]:
        commands = ("node", "npm", "npx", "python", "uv", "docker")
        return [await self._probe_command(command) for command in commands]

    async def _probe_command(self, command: str) -> dict[str, Any]:
        executable = shutil.which(command)
        if not executable:
            return {
                "command": command,
                "available": False,
                "path": None,
                "version": None,
                "detail": "command not found",
            }
        version_output = await self._read_command_version(command)
        return {
            "command": command,
            "available": True,
            "path": executable,
            "version": version_output,
            "detail": "ready",
        }

    async def _read_command_version(self, command: str) -> str | None:
        for flag in ("--version", "-v"):
            try:
                process = await asyncio.create_subprocess_exec(
                    command,
                    flag,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=2.5)
                output = (stdout or stderr).decode("utf-8", errors="ignore").strip()
                if output:
                    return output.splitlines()[0][:120]
            except Exception:
                continue
        return None


_OPS_MCP_INSTALLER_SERVICE = OpsMCPInstallerService()


def get_ops_mcp_installer_service() -> OpsMCPInstallerService:
    return _OPS_MCP_INSTALLER_SERVICE
