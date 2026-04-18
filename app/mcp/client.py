from __future__ import annotations

import asyncio
import subprocess
import json
import logging
import os
import shlex
import shutil
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.errors import AppError
from app.core.file_access_guard import FileAccessGuard
from app.mcp.runtime_pool import MCPRuntimePool, RuntimeSessionHandle

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class _HTTPRuntimeSession(RuntimeSessionHandle):
    endpoint: str = ""
    client: httpx.AsyncClient | None = None
    initialized: bool = False

    async def close(self) -> None:
        client = self.client
        self.client = None
        self.initialized = False
        if client is not None:
            await client.aclose()


@dataclass(slots=True)
class _StdioRuntimeSession(RuntimeSessionHandle):
    command: str = ""
    config: dict[str, Any] | None = None
    process: Any | None = None
    initialized: bool = False
    close_process_fn: Any | None = None

    async def close(self) -> None:
        process = self.process
        self.process = None
        self.initialized = False
        if process is None:
            return
        close_fn = self.close_process_fn
        if callable(close_fn):
            await close_fn(process)


class MCPClientManager:
    def __init__(
        self,
        *,
        http_timeout_seconds: float = 8.0,
        stdio_timeout_seconds: float = 20.0,
        max_attempts: int = 2,
        retry_backoff_seconds: float = 0.4,
        runtime_idle_ttl_seconds: float = 600.0,
        runtime_max_sessions: int = 32,
    ) -> None:
        self.http_timeout_seconds = max(http_timeout_seconds, 0.1)
        self.stdio_timeout_seconds = max(stdio_timeout_seconds, 0.1)
        self.max_attempts = max(max_attempts, 1)
        self.retry_backoff_seconds = max(retry_backoff_seconds, 0.0)
        self.runtime_pool = MCPRuntimePool(
            idle_ttl_seconds=runtime_idle_ttl_seconds,
            max_sessions=runtime_max_sessions,
        )

    async def close_runtime(self) -> None:
        await self.runtime_pool.close_all()

    async def inspect_server(
        self,
        *,
        transport_type: str,
        endpoint_or_command: str,
        config: dict[str, Any] | None = None,
    ) -> dict:
        if transport_type == "http":
            return await self._probe_with_retry(
                lambda: self._inspect_http_once(endpoint_or_command, config=config),
            )
        if transport_type == "stdio":
            return await self._probe_with_retry(
                lambda: self._inspect_stdio_once(endpoint_or_command, config=config),
            )
        return self._build_result(
            ok=False,
            detail=f"unsupported transport_type: {transport_type}",
        )

    async def call_tool(
        self,
        *,
        transport_type: str,
        endpoint_or_command: str,
        tool_name: str | None,
        arguments: dict[str, Any] | None,
        config: dict[str, Any] | None = None,
        file_access_allow_all: bool | None = None,
        file_access_folders: list[str] | None = None,
        file_access_blacklist: list[str] | None = None,
    ) -> dict:
        try:
            self._assert_tool_arguments_allowed(
                arguments or {},
                file_access_allow_all=file_access_allow_all,
                file_access_folders=file_access_folders,
                file_access_blacklist=file_access_blacklist,
            )
            if transport_type == "stdio":
                self._assert_stdio_command_allowed(
                    endpoint_or_command,
                    config=config,
                    file_access_allow_all=file_access_allow_all,
                    file_access_folders=file_access_folders,
                    file_access_blacklist=file_access_blacklist,
                )
        except AppError as exc:
            return {
                "ok": False,
                "code": exc.code,
                "detail": exc.message,
                "details": exc.details,
                "tool_name": tool_name or "",
                "result": {},
                "summary": "",
            }

        if transport_type == "http":
            return await self._call_http_tool_once(
                endpoint_or_command,
                tool_name=tool_name,
                arguments=arguments or {},
                config=config,
            )
        if transport_type == "stdio":
            return await self._call_stdio_tool_once(
                endpoint_or_command,
                tool_name=tool_name,
                arguments=arguments or {},
                config=config,
            )
        return {
            "ok": False,
            "detail": f"unsupported transport_type: {transport_type}",
            "tool_name": tool_name or "",
            "result": {},
            "summary": "",
        }

    async def smoke_server(
        self,
        *,
        transport_type: str,
        endpoint_or_command: str,
        tool_name: str | None = None,
        tool_arguments: dict[str, Any] | None = None,
        config: dict[str, Any] | None = None,
        file_access_allow_all: bool | None = None,
        file_access_folders: list[str] | None = None,
        file_access_blacklist: list[str] | None = None,
    ) -> dict[str, Any]:
        steps: list[dict[str, Any]] = []
        inspection = await self.inspect_server(
            transport_type=transport_type,
            endpoint_or_command=endpoint_or_command,
            config=config,
        )

        inspection_ok = bool(inspection.get("ok"))
        inspection_detail = str(inspection.get("detail") or "")
        inspection_diag = self._runtime_diag_from_result(inspection)
        steps.append(
            self._build_smoke_step(
                name="initialize",
                ok=inspection_ok,
                detail=inspection_detail or ("initialize ok" if inspection_ok else "initialize failed"),
                error_category=self._classify_smoke_error(
                    code=inspection.get("code"),
                    detail=inspection_detail,
                )
                if not inspection_ok
                else None,
                details=inspection_diag or None,
            )
        )
        if not inspection_ok:
            steps.append(
                self._build_smoke_step(
                    name="tools/list",
                    ok=False,
                    status="skipped",
                    detail="skipped because initialize failed",
                )
            )
            steps.append(
                self._build_smoke_step(
                    name="tools/call",
                    ok=False,
                    status="skipped",
                    detail="skipped because initialize failed",
                )
            )
            return {
                "ok": False,
                "status": "error",
                "steps": steps,
                "used_tool_name": None,
                "summary": inspection_detail or "smoke failed at initialize",
            }

        tools_raw = inspection.get("tools")
        tools = tools_raw if isinstance(tools_raw, list) else []
        if not tools:
            steps.append(
                self._build_smoke_step(
                    name="tools/list",
                    ok=False,
                    detail="server has no tool",
                    error_category="server",
                )
            )
            steps.append(
                self._build_smoke_step(
                    name="tools/call",
                    ok=False,
                    status="skipped",
                    detail="skipped because tools/list returned empty",
                )
            )
            return {
                "ok": False,
                "status": "error",
                "steps": steps,
                "used_tool_name": None,
                "summary": "server has no tool",
            }

        steps.append(
            self._build_smoke_step(
                name="tools/list",
                ok=True,
                detail=f"found {len(tools)} tool(s)",
            )
        )

        selected_tool_name = self._resolve_smoke_tool_name(tool_name, tools)
        if not selected_tool_name:
            detail = f"tool not found: {tool_name}" if isinstance(tool_name, str) and tool_name.strip() else "failed to resolve tool name"
            steps.append(
                self._build_smoke_step(
                    name="tools/call",
                    ok=False,
                    detail=detail,
                    error_category="config",
                )
            )
            return {
                "ok": False,
                "status": "error",
                "steps": steps,
                "used_tool_name": None,
                "summary": detail,
            }

        resolved_arguments = tool_arguments if isinstance(tool_arguments, dict) else {}
        selected_tool = self._find_tool_by_name(tools, selected_tool_name)
        auto_selected_tool = not (isinstance(tool_name, str) and tool_name.strip())
        if (
            auto_selected_tool
            and not resolved_arguments
            and self._tool_requires_arguments(selected_tool)
        ):
            required_fields = self._tool_required_fields(selected_tool)
            required_hint = (
                f"required fields: {', '.join(required_fields)}"
                if required_fields
                else "required fields unknown"
            )
            skip_detail = f"skipped auto tools/call because '{selected_tool_name}' requires arguments ({required_hint})"
            steps.append(
                self._build_smoke_step(
                    name="tools/call",
                    ok=True,
                    status="skipped",
                    detail=skip_detail,
                )
            )
            return {
                "ok": True,
                "status": "connected",
                "steps": steps,
                "used_tool_name": selected_tool_name,
                "summary": skip_detail,
            }
        call_result = await self.call_tool(
            transport_type=transport_type,
            endpoint_or_command=endpoint_or_command,
            tool_name=selected_tool_name,
            arguments=resolved_arguments,
            config=config,
            file_access_allow_all=file_access_allow_all,
            file_access_folders=file_access_folders,
            file_access_blacklist=file_access_blacklist,
        )

        call_ok = bool(call_result.get("ok"))
        call_detail = str(call_result.get("detail") or "")
        call_details_raw = call_result.get("details")
        call_details = call_details_raw if isinstance(call_details_raw, dict) else None
        call_diag = self._runtime_diag_from_result(call_result)
        steps.append(
            self._build_smoke_step(
                name="tools/call",
                ok=call_ok,
                detail=call_detail or ("tool call completed" if call_ok else "tool call failed"),
                error_category=self._classify_smoke_error(
                    code=call_result.get("code"),
                    detail=call_detail,
                    details=call_details,
                )
                if not call_ok
                else None,
                details=self._merge_detail_payload(call_details, call_diag),
            )
        )

        if not call_ok:
            return {
                "ok": False,
                "status": "error",
                "steps": steps,
                "used_tool_name": selected_tool_name,
                "summary": call_result.get("summary") or call_detail or "smoke failed at tools/call",
            }

        return {
            "ok": True,
            "status": "connected",
            "steps": steps,
            "used_tool_name": selected_tool_name,
            "summary": call_result.get("summary") or "smoke passed",
        }

    def _assert_tool_arguments_allowed(
        self,
        arguments: dict[str, Any],
        *,
        file_access_allow_all: bool | None,
        file_access_folders: list[str] | None,
        file_access_blacklist: list[str] | None,
    ) -> None:
        for path_value in FileAccessGuard.collect_path_like_values(arguments):
            FileAccessGuard.assert_allowed(
                path_value,
                file_access_folders,
                allow_all=file_access_allow_all,
                blacklist=file_access_blacklist,
                context="MCP tools/call.arguments",
            )

    def _assert_stdio_command_allowed(
        self,
        command: str,
        *,
        config: dict[str, Any] | None,
        file_access_allow_all: bool | None,
        file_access_folders: list[str] | None,
        file_access_blacklist: list[str] | None,
    ) -> None:
        command_parts, _ = self._build_stdio_command_parts(command, config)
        for part in command_parts:
            normalized = str(part).strip()
            if not normalized:
                continue
            if not FileAccessGuard.is_local_absolute_path(normalized):
                continue
            FileAccessGuard.assert_allowed(
                normalized,
                file_access_folders,
                allow_all=file_access_allow_all,
                blacklist=file_access_blacklist,
                context="MCP stdio command/args",
            )

    @staticmethod
    def _build_smoke_step(
        *,
        name: str,
        ok: bool,
        detail: str,
        status: str | None = None,
        error_category: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "name": name,
            "ok": ok,
            "status": status or ("passed" if ok else "failed"),
            "detail": detail,
        }
        if error_category:
            payload["error_category"] = error_category
        if isinstance(details, dict) and details:
            payload["details"] = details
        return payload

    @staticmethod
    def _resolve_smoke_tool_name(tool_name: str | None, tools: list[dict[str, Any]]) -> str | None:
        normalized_name = str(tool_name or "").strip()
        if normalized_name:
            for tool in tools:
                candidate = str(tool.get("name") or "").strip()
                if candidate == normalized_name:
                    return candidate
            return None

        # Prefer low-risk "read-only" style tool names for default smoke calls.
        preferred_names = (
            "ping",
            "health",
            "version",
            "info",
            "list",
            "read",
            "read_graph",
            "search",
            "echo",
            "status",
        )
        normalized_candidates: list[str] = []
        for tool in tools:
            candidate = str(tool.get("name") or "").strip()
            if candidate:
                normalized_candidates.append(candidate)

        for preferred in preferred_names:
            for candidate in normalized_candidates:
                lower_candidate = candidate.lower()
                if (
                    lower_candidate == preferred
                    or lower_candidate.endswith(f"_{preferred}")
                    or lower_candidate.startswith(f"{preferred}_")
                ):
                    return candidate

        for candidate in normalized_candidates:
            return candidate
        return None

    @staticmethod
    def _find_tool_by_name(tools: list[dict[str, Any]], tool_name: str) -> dict[str, Any]:
        normalized_name = str(tool_name or "").strip()
        for tool in tools:
            candidate = str(tool.get("name") or "").strip()
            if candidate == normalized_name:
                return tool
        return {}

    @staticmethod
    def _tool_input_schema(tool: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(tool, dict):
            return {}
        raw = tool.get("input_schema")
        if isinstance(raw, dict):
            return raw
        return {}

    @classmethod
    def _tool_required_fields(cls, tool: dict[str, Any]) -> list[str]:
        schema = cls._tool_input_schema(tool)
        required = schema.get("required")
        if not isinstance(required, list):
            return []
        normalized: list[str] = []
        for item in required:
            if isinstance(item, str) and item.strip():
                normalized.append(item.strip())
        return normalized

    @classmethod
    def _tool_requires_arguments(cls, tool: dict[str, Any]) -> bool:
        schema = cls._tool_input_schema(tool)
        if not schema:
            return False
        if cls._tool_required_fields(tool):
            return True
        min_properties = schema.get("minProperties")
        return isinstance(min_properties, int) and min_properties > 0

    @staticmethod
    def _classify_smoke_error(
        *,
        code: Any = None,
        detail: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> str:
        normalized_code = str(code or "").strip().lower()
        reason = str((details or {}).get("reason") or "").strip().lower()
        normalized_detail = str(detail or "").strip().lower()

        if normalized_code == "forbidden_path" or reason in {"in_blacklist", "not_in_allowlist"}:
            return "permission"

        if any(
            marker in normalized_detail
            for marker in ("unauthorized", "authentication", "invalid api key", "api key", "401", "auth")
        ):
            return "auth"

        if any(marker in normalized_detail for marker in ("forbidden", "permission", "denied", "403")):
            return "permission"

        if any(
            marker in normalized_detail
            for marker in (
                "unsupported transport_type",
                "missing mcp endpoint",
                "missing stdio command",
                "invalid stdio command",
                "tool not found",
                "tool name is required",
                "server has no tool",
            )
        ):
            return "config"

        if any(
            marker in normalized_detail
            for marker in (
                "timeout",
                "connection refused",
                "network",
                "status error: 5",
                " 500",
                " 502",
                " 503",
                " 504",
                "probe failed",
                "service unavailable",
            )
        ):
            return "server"

        return "runtime"

    @staticmethod
    def _build_runtime_key(transport_type: str, endpoint_or_command: str, config: dict[str, Any] | None) -> str:
        payload = {
            "transportType": str(transport_type or "").strip().lower(),
            "endpointOrCommand": str(endpoint_or_command or "").strip(),
            "config": config if isinstance(config, dict) else {},
        }
        return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)

    @staticmethod
    def _runtime_diag_from_result(payload: dict[str, Any]) -> dict[str, bool]:
        reuse = bool(payload.get("session_reuse"))
        recreated = bool(payload.get("session_recreated"))
        if not reuse and not recreated:
            return {}
        return {
            "sessionReuse": reuse,
            "sessionRecreated": recreated,
        }

    @staticmethod
    def _merge_detail_payload(
        base: dict[str, Any] | None,
        extra: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        merged: dict[str, Any] = {}
        if isinstance(base, dict):
            merged.update(base)
        if isinstance(extra, dict):
            merged.update(extra)
        return merged or None

    async def _acquire_http_runtime_session(
        self,
        endpoint: str,
        *,
        config: dict[str, Any] | None,
    ) -> tuple[_HTTPRuntimeSession, bool, str]:
        key = self._build_runtime_key("http", endpoint, config)
        kwargs = self._build_http_client_kwargs(config)

        async def create() -> RuntimeSessionHandle:
            return _HTTPRuntimeSession(
                key=key,
                transport="http",
                endpoint=endpoint,
                client=httpx.AsyncClient(**kwargs),
            )

        session, reused = await self.runtime_pool.acquire(key, create)
        assert isinstance(session, _HTTPRuntimeSession)
        if reused:
            logger.debug("mcp runtime reuse hit: transport=http endpoint=%s", endpoint)
        return session, reused, key

    async def _acquire_stdio_runtime_session(
        self,
        command: str,
        *,
        config: dict[str, Any] | None,
    ) -> tuple[_StdioRuntimeSession, bool, str]:
        key = self._build_runtime_key("stdio", command, config)

        async def create() -> RuntimeSessionHandle:
            return _StdioRuntimeSession(
                key=key,
                transport="stdio",
                command=command,
                config=config if isinstance(config, dict) else None,
                close_process_fn=self._close_stdio_process,
            )

        session, reused = await self.runtime_pool.acquire(key, create)
        assert isinstance(session, _StdioRuntimeSession)
        if reused:
            logger.debug("mcp runtime reuse hit: transport=stdio command=%s", command)
        return session, reused, key

    async def _ensure_http_runtime_initialized(self, session: _HTTPRuntimeSession) -> None:
        client = session.client
        if client is None:
            raise RuntimeError("http runtime client is not ready")
        if session.initialized:
            return
        await self._initialize_http_session(client, session.endpoint)
        session.initialized = True
        logger.debug("mcp runtime initialized: transport=http endpoint=%s", session.endpoint)

    async def _ensure_stdio_runtime_initialized(self, session: _StdioRuntimeSession) -> None:
        process = session.process
        if process is None or not self._is_process_running(process):
            session.process = await self._spawn_stdio_process(session.command, config=session.config)
            session.initialized = False
            logger.debug("mcp runtime spawned: transport=stdio command=%s", session.command)
        assert session.process is not None
        if session.initialized:
            return
        await self._initialize_stdio_session(session.process)
        session.initialized = True
        logger.debug("mcp runtime initialized: transport=stdio command=%s", session.command)

    def _build_result(
        self,
        *,
        ok: bool,
        detail: str,
        status: str | None = None,
        tools: list[dict] | None = None,
        resources: list[dict] | None = None,
        prompts: list[dict] | None = None,
        attempts: int = 1,
    ) -> dict:
        return {
            "ok": ok,
            "status": status or ("connected" if ok else "error"),
            "detail": detail,
            "tools": tools if isinstance(tools, list) else [],
            "resources": resources if isinstance(resources, list) else [],
            "prompts": prompts if isinstance(prompts, list) else [],
            "checked_at": datetime.now(timezone.utc),
            "attempts": attempts,
        }

    @staticmethod
    def _format_exception_detail(exc: Exception) -> str:
        detail = str(exc).strip()
        return detail or exc.__class__.__name__

    async def _probe_with_retry(self, probe) -> dict:
        last_result: dict | None = None
        for attempt in range(1, self.max_attempts + 1):
            result = await probe()
            result["attempts"] = attempt
            last_result = result
            if result.get("ok"):
                return result
            if attempt < self.max_attempts and self.retry_backoff_seconds > 0:
                await asyncio.sleep(self.retry_backoff_seconds)

        if last_result is None:
            return self._build_result(
                ok=False,
                detail=f"probe failed after {self.max_attempts} attempts",
                attempts=self.max_attempts,
            )

        if not last_result.get("ok") and self.max_attempts > 1:
            detail = str(last_result.get("detail") or "").strip() or "probe failed"
            if "after" not in detail and "attempt" not in detail:
                detail = f"{detail} (after {self.max_attempts} attempts)"
            last_result["detail"] = detail
        return last_result

    async def _inspect_http_once(self, endpoint: str, *, config: dict[str, Any] | None = None) -> dict:
        try:
            return await self._inspect_http_mcp_once(endpoint, config=config)
        except Exception:
            # Fallback to legacy "HTTP JSON payload" probe for backward compatibility.
            return await self._inspect_http_legacy_once(endpoint, config=config)

    async def _inspect_http_mcp_once(self, endpoint: str, *, config: dict[str, Any] | None = None) -> dict:
        normalized_endpoint = str(endpoint or "").strip()
        if not normalized_endpoint:
            raise RuntimeError("missing MCP endpoint")

        session, reused, key = await self._acquire_http_runtime_session(
            normalized_endpoint,
            config=config,
        )
        recreated = False

        for _attempt in range(2):
            try:
                async with session.lock:
                    await self._ensure_http_runtime_initialized(session)
                    assert session.client is not None
                    tools = await self._list_http_tools(session.client, normalized_endpoint)
                    resources = await self._list_http_resources(session.client, normalized_endpoint)
                    prompts = await self._list_http_prompts(session.client, normalized_endpoint)
                result = self._build_result(
                    ok=True,
                    status="connected",
                    detail=f"mcp rpc reachable ({len(tools)} tools)",
                    tools=tools,
                    resources=resources,
                    prompts=prompts,
                )
                result["session_reuse"] = reused
                result["session_recreated"] = recreated
                return result
            except Exception:
                invalidated = await self.runtime_pool.invalidate(key)
                if not invalidated:
                    raise
                if not recreated:
                    recreated = True
                    logger.warning("mcp runtime recreated after http inspect failure: %s", normalized_endpoint)
                    session, reused, key = await self._acquire_http_runtime_session(
                        normalized_endpoint,
                        config=config,
                    )
                    session.recreate_count += 1
                    continue
                raise

        raise RuntimeError("http runtime inspect failed after recreation")

    async def _inspect_http_legacy_once(self, endpoint: str, *, config: dict[str, Any] | None = None) -> dict:
        detail = "HTTP endpoint reachable"
        tools: list[dict] = []
        resources: list[dict] = []
        prompts: list[dict] = []
        status = "connected"
        try:
            async with httpx.AsyncClient(**self._build_http_client_kwargs(config)) as client:
                response = await client.get(endpoint)
                response.raise_for_status()
                body = response.json() if "application/json" in response.headers.get("content-type", "") else {}
            tools = body.get("tools", [])
            resources = body.get("resources", [])
            prompts = body.get("prompts", [])
            detail = body.get("detail", detail)
        except httpx.TimeoutException:
            status = "error"
            detail = f"http timeout after {self.http_timeout_seconds:.1f}s"
        except httpx.HTTPStatusError as exc:
            status = "error"
            detail = f"http status error: {exc.response.status_code}"
        except httpx.RequestError as exc:
            status = "error"
            detail = f"http request error: {exc}"
        except Exception as exc:
            status = "error"
            detail = self._format_exception_detail(exc)
        return self._build_result(
            ok=status == "connected",
            status=status,
            detail=detail,
            tools=tools,
            resources=resources,
            prompts=prompts,
        )

    async def _call_http_tool_once(
        self,
        endpoint: str,
        *,
        tool_name: str | None,
        arguments: dict[str, Any],
        config: dict[str, Any] | None = None,
    ) -> dict:
        normalized_endpoint = (endpoint or "").strip()
        if not normalized_endpoint:
            return {
                "ok": False,
                "detail": "missing MCP endpoint",
                "tool_name": tool_name or "",
                "result": {},
                "summary": "",
            }

        session, reused, key = await self._acquire_http_runtime_session(
            normalized_endpoint,
            config=config,
        )
        recreated = False

        for _attempt in range(2):
            try:
                async with session.lock:
                    await self._ensure_http_runtime_initialized(session)
                    assert session.client is not None
                    tools = await self._list_http_tools(session.client, normalized_endpoint)
                    resolved_tool_name = self._resolve_tool_name(tool_name, tools)
                    if not resolved_tool_name:
                        return {
                            "ok": False,
                            "detail": "tool name is required (or server must expose exactly one tool)",
                            "tool_name": "",
                            "result": {"tools": tools},
                            "summary": "",
                            "session_reuse": reused,
                            "session_recreated": recreated,
                        }
                    tool_result = await self._jsonrpc_request(
                        session.client,
                        normalized_endpoint,
                        "tools/call",
                        {
                            "name": resolved_tool_name,
                            "arguments": arguments,
                        },
                    )
                summary = self._summarize_tool_result(tool_result)
                is_error = bool(isinstance(tool_result, dict) and tool_result.get("isError"))
                return {
                    "ok": not is_error,
                    "detail": "tool call completed" if not is_error else "tool call returned isError=true",
                    "tool_name": resolved_tool_name,
                    "result": tool_result,
                    "summary": summary,
                    "session_reuse": reused,
                    "session_recreated": recreated,
                }
            except Exception as exc:
                invalidated = await self.runtime_pool.invalidate(key)
                if invalidated and not recreated:
                    recreated = True
                    logger.warning("mcp runtime recreated after http tools/call failure: %s", normalized_endpoint)
                    session, reused, key = await self._acquire_http_runtime_session(
                        normalized_endpoint,
                        config=config,
                    )
                    session.recreate_count += 1
                    continue
                return {
                    "ok": False,
                    "detail": self._format_exception_detail(exc),
                    "tool_name": tool_name or "",
                    "result": {},
                    "summary": "",
                    "session_reuse": reused,
                    "session_recreated": recreated,
                }

        return {
            "ok": False,
            "detail": "http runtime call failed after recreation",
            "tool_name": tool_name or "",
            "result": {},
            "summary": "",
            "session_reuse": reused,
            "session_recreated": recreated,
        }

    def _build_http_client_kwargs(self, config: dict[str, Any] | None) -> dict[str, Any]:
        timeout_seconds = self.http_timeout_seconds
        headers: dict[str, str] = {}
        auth: httpx.Auth | tuple[str, str] | None = None

        if isinstance(config, dict):
            timeout_ms = config.get("timeoutMs")
            if isinstance(timeout_ms, (int, float)) and timeout_ms > 0:
                timeout_seconds = max(float(timeout_ms) / 1000.0, 0.1)

            raw_headers = config.get("headers")
            if isinstance(raw_headers, dict):
                for key, value in raw_headers.items():
                    if isinstance(key, str) and key.strip() and isinstance(value, str) and value.strip():
                        headers[key.strip()] = value.strip()

            raw_auth = config.get("auth")
            if isinstance(raw_auth, dict):
                auth_type = str(raw_auth.get("type") or "").strip()
                if auth_type == "bearer":
                    token = str(raw_auth.get("token") or "").strip()
                    if token:
                        headers["Authorization"] = f"Bearer {token}"
                elif auth_type == "apiKey":
                    header_name = str(raw_auth.get("headerName") or "").strip()
                    header_value = str(raw_auth.get("value") or "").strip()
                    if header_name and header_value:
                        headers[header_name] = header_value
                elif auth_type == "basic":
                    username = str(raw_auth.get("username") or "")
                    password = str(raw_auth.get("password") or "")
                    if username or password:
                        auth = (username, password)

        kwargs: dict[str, Any] = {"timeout": timeout_seconds}
        if headers:
            kwargs["headers"] = headers
        if auth is not None:
            kwargs["auth"] = auth
        return kwargs

    async def _initialize_http_session(self, client: httpx.AsyncClient, endpoint: str) -> None:
        await self._jsonrpc_request(
            client,
            endpoint,
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "agent-live2d", "version": "0.1.0"},
            },
        )
        # Best-effort notification; some servers may ignore/deny this.
        try:
            await self._jsonrpc_request(client, endpoint, "notifications/initialized", {})
        except Exception:
            pass

    async def _list_http_tools(self, client: httpx.AsyncClient, endpoint: str) -> list[dict]:
        payload = await self._jsonrpc_request(client, endpoint, "tools/list", {})
        return self._normalize_named_items(payload, "tools")

    async def _list_http_resources(self, client: httpx.AsyncClient, endpoint: str) -> list[dict]:
        try:
            payload = await self._jsonrpc_request(client, endpoint, "resources/list", {})
            return self._normalize_named_items(payload, "resources", key_name="uri")
        except Exception:
            return []

    async def _list_http_prompts(self, client: httpx.AsyncClient, endpoint: str) -> list[dict]:
        try:
            payload = await self._jsonrpc_request(client, endpoint, "prompts/list", {})
            return self._normalize_named_items(payload, "prompts")
        except Exception:
            return []

    async def _jsonrpc_request(
        self,
        client: httpx.AsyncClient,
        endpoint: str,
        method: str,
        params: dict[str, Any] | None = None,
    ) -> Any:
        body: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": f"agent-live2d-{method}",
            "method": method,
        }
        if params is not None:
            body["params"] = params

        response = await client.post(endpoint, json=body)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError(f"invalid json-rpc response for {method}")

        error_payload = payload.get("error")
        if isinstance(error_payload, dict):
            message = str(error_payload.get("message") or "json-rpc error").strip()
            code = error_payload.get("code")
            if code is not None:
                raise RuntimeError(f"{method} failed: {message} (code={code})")
            raise RuntimeError(f"{method} failed: {message}")

        if "result" not in payload:
            raise RuntimeError(f"{method} failed: missing result")
        return payload["result"]

    @staticmethod
    def _normalize_named_items(payload: Any, key: str, *, key_name: str = "name") -> list[dict]:
        if isinstance(payload, dict):
            raw_items = payload.get(key)
        else:
            raw_items = payload
        if not isinstance(raw_items, list):
            return []

        normalized: list[dict] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            name_value = item.get(key_name) or item.get("name")
            if not isinstance(name_value, str) or not name_value.strip():
                continue
            normalized.append(
                {
                    "name": name_value.strip(),
                    "description": str(item.get("description") or "").strip(),
                    "input_schema": item.get("inputSchema")
                    if isinstance(item.get("inputSchema"), dict)
                    else (
                        item.get("input_schema")
                        if isinstance(item.get("input_schema"), dict)
                        else {}
                    ),
                }
            )
        return normalized

    @staticmethod
    def _resolve_tool_name(tool_name: str | None, tools: list[dict]) -> str:
        if isinstance(tool_name, str) and tool_name.strip():
            return tool_name.strip()
        if len(tools) == 1:
            candidate = tools[0].get("name")
            if isinstance(candidate, str):
                return candidate.strip()
        return ""

    @staticmethod
    def _summarize_tool_result(payload: Any, *, max_length: int = 400) -> str:
        if isinstance(payload, dict):
            content = payload.get("content")
            if isinstance(content, list):
                texts: list[str] = []
                for item in content:
                    if not isinstance(item, dict):
                        continue
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        texts.append(text.strip())
                if texts:
                    return MCPClientManager._truncate(" ".join(texts), max_length)

            text_fields = ("text", "message", "result", "output")
            for field in text_fields:
                value = payload.get(field)
                if isinstance(value, str) and value.strip():
                    return MCPClientManager._truncate(value.strip(), max_length)

            return MCPClientManager._truncate(str(payload), max_length)
        if isinstance(payload, list):
            return MCPClientManager._truncate(str(payload), max_length)
        if payload is None:
            return ""
        return MCPClientManager._truncate(str(payload), max_length)

    @staticmethod
    def _truncate(value: str, max_length: int) -> str:
        if len(value) <= max_length:
            return value
        return value[: max_length - 3] + "..."

    def _build_stdio_command_parts(self, command: str, config: dict[str, Any] | None) -> tuple[list[str], dict[str, str] | None]:
        normalized_command = str(command or "").strip()
        if not normalized_command:
            raise RuntimeError("missing stdio command")

        try:
            command_parts = shlex.split(normalized_command, posix=False)
        except ValueError as exc:
            raise RuntimeError(f"invalid stdio command: {exc}") from exc

        if not command_parts:
            raise RuntimeError("missing stdio command")

        # On Windows, commands such as "npx" resolve to "*.CMD". Without resolving
        # via PATH first, create_subprocess_exec may raise WinError 2.
        resolved_executable = shutil.which(command_parts[0])
        if resolved_executable:
            command_parts[0] = resolved_executable

        args: list[str] = []
        env: dict[str, str] | None = None
        if isinstance(config, dict):
            raw_args = config.get("args")
            if isinstance(raw_args, list):
                args = [str(item).strip() for item in raw_args if isinstance(item, str) and str(item).strip()]

            raw_env = config.get("env")
            if isinstance(raw_env, dict):
                merged = os.environ.copy()
                for key, value in raw_env.items():
                    if isinstance(key, str) and key.strip() and isinstance(value, str):
                        merged[key.strip()] = value
                env = merged

        return command_parts + args, env

    async def _spawn_stdio_process(self, command: str, config: dict[str, Any] | None):
        command_parts, env = self._build_stdio_command_parts(command, config)
        try:
            process = await asyncio.create_subprocess_exec(
                command_parts[0],
                *command_parts[1:],
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except NotImplementedError:
            # Windows SelectorEventLoop doesn't support asyncio subprocess APIs.
            # Fallback to sync subprocess + thread bridge so stdio MCP remains usable.
            logger.warning(
                "asyncio subprocess not supported by current loop; fallback to sync subprocess for stdio mcp: %s",
                command_parts[0],
            )

            def _spawn_sync():
                return subprocess.Popen(
                    command_parts,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=env,
                )

            process = await asyncio.wait_for(
                asyncio.to_thread(_spawn_sync),
                timeout=self.stdio_timeout_seconds,
            )
        if process.stdin is None or process.stdout is None:
            raise RuntimeError("failed to open stdio pipes")
        return process

    async def _stdio_write_frame(self, writer: asyncio.StreamWriter, payload: dict[str, Any]) -> None:
        encoded = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
        await self._write_stream_payload(writer, encoded)

    async def _stdio_read_frame(self, reader: asyncio.StreamReader) -> dict[str, Any]:
        raw_line = await self._read_stream_line(reader)
        if raw_line == b"":
            raise RuntimeError("stdio process closed before response")

        line = raw_line.decode("utf-8", errors="ignore").strip()
        if not line:
            return await self._stdio_read_frame(reader)

        # Newer MCP SDK stdio transport uses newline-delimited JSON-RPC.
        if not line.lower().startswith("content-length:"):
            try:
                payload = json.loads(line)
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError("invalid json payload from stdio server") from exc
            if not isinstance(payload, dict):
                raise RuntimeError("invalid stdio payload: expected object")
            return payload

        # Backward compatibility: support Content-Length framed responses.
        headers: dict[str, str] = {"content-length": line.split(":", 1)[1].strip()}
        while True:
            header_line = await self._read_stream_line(reader)
            if header_line == b"":
                raise RuntimeError("stdio process closed before response")
            if header_line in (b"\r\n", b"\n"):
                break
            normalized = header_line.decode("utf-8", errors="ignore").strip()
            if not normalized:
                break
            if ":" not in normalized:
                raise RuntimeError(f"invalid stdio header line: {normalized}")
            name, value = normalized.split(":", 1)
            headers[name.strip().lower()] = value.strip()

        length_raw = headers.get("content-length")
        if not length_raw:
            raise RuntimeError("missing Content-Length in stdio response")
        try:
            content_length = int(length_raw)
        except ValueError as exc:
            raise RuntimeError(f"invalid Content-Length: {length_raw}") from exc
        if content_length < 0:
            raise RuntimeError("invalid Content-Length: must be >= 0")

        payload_raw = await self._read_stream_exactly(reader, content_length)
        try:
            payload = json.loads(payload_raw.decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("invalid json payload from stdio server") from exc
        if not isinstance(payload, dict):
            raise RuntimeError("invalid stdio payload: expected object")
        return payload

    async def _stdio_jsonrpc_request(
        self,
        process,
        method: str,
        params: dict[str, Any] | None = None,
    ) -> Any:
        body: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": f"agent-live2d-{method}",
            "method": method,
        }
        if params is not None:
            body["params"] = params

        assert process.stdin is not None
        assert process.stdout is not None
        await self._stdio_write_frame(process.stdin, body)
        payload = await self._stdio_read_frame(process.stdout)

        error_payload = payload.get("error")
        if isinstance(error_payload, dict):
            message = str(error_payload.get("message") or "json-rpc error").strip()
            code = error_payload.get("code")
            if code is not None:
                raise RuntimeError(f"{method} failed: {message} (code={code})")
            raise RuntimeError(f"{method} failed: {message}")

        if "result" not in payload:
            raise RuntimeError(f"{method} failed: missing result")
        return payload["result"]

    async def _initialize_stdio_session(self, process) -> None:
        await self._stdio_jsonrpc_request(
            process,
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "agent-live2d", "version": "0.1.0"},
            },
        )
        with suppress(Exception):
            await self._stdio_jsonrpc_request(process, "notifications/initialized", {})

    async def _list_stdio_tools(self, process) -> list[dict]:
        payload = await self._stdio_jsonrpc_request(process, "tools/list", {})
        return self._normalize_named_items(payload, "tools")

    async def _list_stdio_resources(self, process) -> list[dict]:
        try:
            payload = await self._stdio_jsonrpc_request(process, "resources/list", {})
            return self._normalize_named_items(payload, "resources", key_name="uri")
        except Exception:
            return []

    async def _list_stdio_prompts(self, process) -> list[dict]:
        try:
            payload = await self._stdio_jsonrpc_request(process, "prompts/list", {})
            return self._normalize_named_items(payload, "prompts")
        except Exception:
            return []

    async def _close_stdio_process(self, process) -> None:
        if isinstance(process, asyncio.subprocess.Process):
            if process.stdin is not None:
                with suppress(Exception):
                    process.stdin.close()
            with suppress(Exception):
                await asyncio.wait_for(process.wait(), timeout=0.2)
            if process.returncode is None:
                with suppress(Exception):
                    process.terminate()
                with suppress(Exception):
                    await asyncio.wait_for(process.wait(), timeout=0.5)
            if process.returncode is None:
                with suppress(Exception):
                    process.kill()
                with suppress(Exception):
                    await asyncio.wait_for(process.wait(), timeout=0.5)
            return

        stdin = getattr(process, "stdin", None)
        if stdin is not None:
            with suppress(Exception):
                stdin.close()
        await self._wait_sync_process(process, timeout=0.2)
        if self._is_process_running(process):
            with suppress(Exception):
                process.terminate()
            await self._wait_sync_process(process, timeout=0.5)
        if self._is_process_running(process):
            with suppress(Exception):
                process.kill()
            await self._wait_sync_process(process, timeout=0.5)

    @staticmethod
    def _is_process_running(process: Any) -> bool:
        if isinstance(process, asyncio.subprocess.Process):
            return process.returncode is None
        poll_fn = getattr(process, "poll", None)
        if callable(poll_fn):
            with suppress(Exception):
                return poll_fn() is None
        return getattr(process, "returncode", None) is None

    async def _wait_sync_process(self, process: Any, *, timeout: float) -> None:
        wait_fn = getattr(process, "wait", None)
        if not callable(wait_fn):
            return

        def _wait() -> None:
            try:
                wait_fn(timeout=timeout)
            except TypeError:
                wait_fn()

        with suppress(Exception):
            await asyncio.wait_for(
                asyncio.to_thread(_wait),
                timeout=max(timeout, 0.1) + 0.1,
            )

    async def _write_stream_payload(self, stream: Any, payload: bytes) -> None:
        # asyncio StreamWriter path
        if hasattr(stream, "drain") and callable(getattr(stream, "drain", None)):
            stream.write(payload)
            await asyncio.wait_for(stream.drain(), timeout=self.stdio_timeout_seconds)
            return

        # sync file-like path (subprocess.Popen stdio), run in thread to avoid blocking loop.
        write_fn = getattr(stream, "write", None)
        flush_fn = getattr(stream, "flush", None)
        if not callable(write_fn):
            raise RuntimeError("stdio stream does not support write")

        def _write_sync() -> None:
            write_fn(payload)
            if callable(flush_fn):
                flush_fn()

        await asyncio.wait_for(
            asyncio.to_thread(_write_sync),
            timeout=self.stdio_timeout_seconds,
        )

    async def _read_stream_line(self, stream: Any) -> bytes:
        readline_fn = getattr(stream, "readline", None)
        if not callable(readline_fn):
            raise RuntimeError("stdio stream does not support readline")

        if isinstance(stream, asyncio.StreamReader):
            raw_line = await asyncio.wait_for(
                stream.readline(),
                timeout=self.stdio_timeout_seconds,
            )
        else:
            raw_line = await asyncio.wait_for(
                asyncio.to_thread(readline_fn),
                timeout=self.stdio_timeout_seconds,
            )

        if isinstance(raw_line, bytes):
            return raw_line
        if isinstance(raw_line, str):
            return raw_line.encode("utf-8", errors="ignore")
        raise RuntimeError("invalid stdio payload line type")

    async def _read_stream_exactly(self, stream: Any, size: int) -> bytes:
        if isinstance(stream, asyncio.StreamReader):
            return await asyncio.wait_for(
                stream.readexactly(size),
                timeout=self.stdio_timeout_seconds,
            )

        read_fn = getattr(stream, "read", None)
        if not callable(read_fn):
            raise RuntimeError("stdio stream does not support read")

        payload_raw = await asyncio.wait_for(
            asyncio.to_thread(read_fn, size),
            timeout=self.stdio_timeout_seconds,
        )
        if isinstance(payload_raw, bytes):
            return payload_raw
        if isinstance(payload_raw, str):
            return payload_raw.encode("utf-8", errors="ignore")
        raise RuntimeError("invalid stdio payload bytes type")

    async def _call_stdio_tool_once(
        self,
        command: str,
        *,
        tool_name: str | None,
        arguments: dict[str, Any],
        config: dict[str, Any] | None = None,
    ) -> dict:
        normalized_command = str(command or "").strip()
        if not normalized_command:
            return {
                "ok": False,
                "detail": "missing stdio command",
                "tool_name": tool_name or "",
                "result": {},
                "summary": "",
            }

        session, reused, key = await self._acquire_stdio_runtime_session(normalized_command, config=config)
        recreated = False

        for _attempt in range(2):
            try:
                async with session.lock:
                    await self._ensure_stdio_runtime_initialized(session)
                    assert session.process is not None
                    tools = await self._list_stdio_tools(session.process)
                    resolved_tool_name = self._resolve_tool_name(tool_name, tools)
                    if not resolved_tool_name:
                        return {
                            "ok": False,
                            "detail": "tool name is required (or server must expose exactly one tool)",
                            "tool_name": "",
                            "result": {"tools": tools},
                            "summary": "",
                            "session_reuse": reused,
                            "session_recreated": recreated,
                        }
                    tool_result = await self._stdio_jsonrpc_request(
                        session.process,
                        "tools/call",
                        {
                            "name": resolved_tool_name,
                            "arguments": arguments,
                        },
                    )
                summary = self._summarize_tool_result(tool_result)
                is_error = bool(isinstance(tool_result, dict) and tool_result.get("isError"))
                return {
                    "ok": not is_error,
                    "detail": "tool call completed" if not is_error else "tool call returned isError=true",
                    "tool_name": resolved_tool_name,
                    "result": tool_result,
                    "summary": summary,
                    "session_reuse": reused,
                    "session_recreated": recreated,
                }
            except Exception as exc:
                invalidated = await self.runtime_pool.invalidate(key)
                if invalidated and not recreated:
                    recreated = True
                    logger.warning("mcp runtime recreated after stdio tools/call failure: %s", normalized_command)
                    session, reused, key = await self._acquire_stdio_runtime_session(normalized_command, config=config)
                    session.recreate_count += 1
                    continue
                return {
                    "ok": False,
                    "detail": self._format_exception_detail(exc),
                    "tool_name": tool_name or "",
                    "result": {},
                    "summary": "",
                    "session_reuse": reused,
                    "session_recreated": recreated,
                }

        return {
            "ok": False,
            "detail": "stdio runtime call failed after recreation",
            "tool_name": tool_name or "",
            "result": {},
            "summary": "",
            "session_reuse": reused,
            "session_recreated": recreated,
        }

    async def _inspect_stdio_once(self, command: str, *, config: dict[str, Any] | None = None) -> dict:
        normalized_command = str(command or "").strip()
        if not normalized_command:
            return self._build_result(ok=False, detail="missing stdio command")

        session, reused, key = await self._acquire_stdio_runtime_session(normalized_command, config=config)
        recreated = False

        for _attempt in range(2):
            try:
                async with session.lock:
                    await self._ensure_stdio_runtime_initialized(session)
                    assert session.process is not None
                    tools = await self._list_stdio_tools(session.process)
                    resources = await self._list_stdio_resources(session.process)
                    prompts = await self._list_stdio_prompts(session.process)
                result = self._build_result(
                    ok=True,
                    status="connected",
                    detail=f"stdio mcp reachable ({len(tools)} tools)",
                    tools=tools,
                    resources=resources,
                    prompts=prompts,
                )
                result["session_reuse"] = reused
                result["session_recreated"] = recreated
                return result
            except asyncio.TimeoutError:
                detail = f"stdio timeout after {self.stdio_timeout_seconds:.1f}s"
            except Exception as exc:
                detail = self._format_exception_detail(exc)

            invalidated = await self.runtime_pool.invalidate(key)
            if invalidated and not recreated:
                recreated = True
                logger.warning("mcp runtime recreated after stdio inspect failure: %s", normalized_command)
                session, reused, key = await self._acquire_stdio_runtime_session(normalized_command, config=config)
                session.recreate_count += 1
                continue

            result = self._build_result(ok=False, detail=detail)
            result["session_reuse"] = reused
            result["session_recreated"] = recreated
            return result

        result = self._build_result(ok=False, detail="stdio runtime inspect failed after recreation")
        result["session_reuse"] = reused
        result["session_recreated"] = recreated
        return result
