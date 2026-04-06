from __future__ import annotations

import asyncio
import json
import os
import shlex
from contextlib import suppress
from datetime import datetime, timezone
from typing import Any

import httpx


class MCPClientManager:
    def __init__(
        self,
        *,
        http_timeout_seconds: float = 8.0,
        stdio_timeout_seconds: float = 5.0,
        max_attempts: int = 2,
        retry_backoff_seconds: float = 0.4,
    ) -> None:
        self.http_timeout_seconds = max(http_timeout_seconds, 0.1)
        self.stdio_timeout_seconds = max(stdio_timeout_seconds, 0.1)
        self.max_attempts = max(max_attempts, 1)
        self.retry_backoff_seconds = max(retry_backoff_seconds, 0.0)

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
    ) -> dict:
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
            detail = str(last_result.get("detail") or "probe failed")
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
        async with httpx.AsyncClient(**self._build_http_client_kwargs(config)) as client:
            await self._initialize_http_session(client, endpoint)
            tools = await self._list_http_tools(client, endpoint)
            resources = await self._list_http_resources(client, endpoint)
            prompts = await self._list_http_prompts(client, endpoint)

        return self._build_result(
            ok=True,
            status="connected",
            detail=f"mcp rpc reachable ({len(tools)} tools)",
            tools=tools,
            resources=resources,
            prompts=prompts,
        )

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
            detail = str(exc)
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

        try:
            async with httpx.AsyncClient(**self._build_http_client_kwargs(config)) as client:
                await self._initialize_http_session(client, normalized_endpoint)
                tools = await self._list_http_tools(client, normalized_endpoint)
                resolved_tool_name = self._resolve_tool_name(tool_name, tools)
                if not resolved_tool_name:
                    return {
                        "ok": False,
                        "detail": "tool name is required (or server must expose exactly one tool)",
                        "tool_name": "",
                        "result": {"tools": tools},
                        "summary": "",
                    }
                tool_result = await self._jsonrpc_request(
                    client,
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
            }
        except Exception as exc:
            return {
                "ok": False,
                "detail": str(exc),
                "tool_name": tool_name or "",
                "result": {},
                "summary": "",
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
        process = await asyncio.create_subprocess_exec(
            command_parts[0],
            *command_parts[1:],
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        if process.stdin is None or process.stdout is None:
            raise RuntimeError("failed to open stdio pipes")
        return process

    async def _stdio_write_frame(self, writer: asyncio.StreamWriter, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        header = f"Content-Length: {len(encoded)}\r\n\r\n".encode("ascii")
        writer.write(header + encoded)
        await asyncio.wait_for(writer.drain(), timeout=self.stdio_timeout_seconds)

    async def _stdio_read_frame(self, reader: asyncio.StreamReader) -> dict[str, Any]:
        headers: dict[str, str] = {}
        while True:
            raw_line = await asyncio.wait_for(reader.readline(), timeout=self.stdio_timeout_seconds)
            if raw_line == b"":
                raise RuntimeError("stdio process closed before response")
            if raw_line in (b"\r\n", b"\n"):
                break

            line = raw_line.decode(errors="ignore").strip()
            if not line:
                break
            if ":" not in line:
                raise RuntimeError(f"invalid stdio header line: {line}")
            name, value = line.split(":", 1)
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

        payload_raw = await asyncio.wait_for(reader.readexactly(content_length), timeout=self.stdio_timeout_seconds)
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

    async def _call_stdio_tool_once(
        self,
        command: str,
        *,
        tool_name: str | None,
        arguments: dict[str, Any],
        config: dict[str, Any] | None = None,
    ) -> dict:
        try:
            process = await self._spawn_stdio_process(command, config=config)
        except Exception as exc:
            return {
                "ok": False,
                "detail": str(exc),
                "tool_name": tool_name or "",
                "result": {},
                "summary": "",
            }

        try:
            await self._initialize_stdio_session(process)
            tools = await self._list_stdio_tools(process)
            resolved_tool_name = self._resolve_tool_name(tool_name, tools)
            if not resolved_tool_name:
                return {
                    "ok": False,
                    "detail": "tool name is required (or server must expose exactly one tool)",
                    "tool_name": "",
                    "result": {"tools": tools},
                    "summary": "",
                }
            tool_result = await self._stdio_jsonrpc_request(
                process,
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
            }
        except Exception as exc:
            return {
                "ok": False,
                "detail": str(exc),
                "tool_name": tool_name or "",
                "result": {},
                "summary": "",
            }
        finally:
            await self._close_stdio_process(process)

    async def _inspect_stdio_once(self, command: str, *, config: dict[str, Any] | None = None) -> dict:
        try:
            process = await self._spawn_stdio_process(command, config=config)
        except Exception as exc:
            return self._build_result(ok=False, detail=str(exc))

        try:
            await self._initialize_stdio_session(process)
            tools = await self._list_stdio_tools(process)
            resources = await self._list_stdio_resources(process)
            prompts = await self._list_stdio_prompts(process)
            return self._build_result(
                ok=True,
                status="connected",
                detail=f"stdio mcp reachable ({len(tools)} tools)",
                tools=tools,
                resources=resources,
                prompts=prompts,
            )
        except asyncio.TimeoutError:
            return self._build_result(ok=False, detail=f"stdio timeout after {self.stdio_timeout_seconds:.1f}s")
        except Exception as exc:
            return self._build_result(ok=False, detail=str(exc))
        finally:
            await self._close_stdio_process(process)
