from __future__ import annotations

import asyncio
import sys

from app.mcp import client as mcp_client_module
from app.mcp.client import MCPClientManager


def test_http_probe_retries_then_succeeds(monkeypatch):
    manager = MCPClientManager(max_attempts=3, retry_backoff_seconds=0)
    attempts = {"count": 0}

    async def fake_probe(_endpoint: str, **_kwargs):
        attempts["count"] += 1
        if attempts["count"] < 2:
            return manager._build_result(ok=False, detail="http timeout after 8.0s")
        return manager._build_result(
            ok=True,
            detail="HTTP endpoint reachable",
            tools=[{"name": "echo"}],
        )

    monkeypatch.setattr(manager, "_inspect_http_once", fake_probe)
    result = asyncio.run(
        manager.inspect_server(transport_type="http", endpoint_or_command="http://example.com"),
    )

    assert result["ok"] is True
    assert result["attempts"] == 2
    assert attempts["count"] == 2
    assert len(result["tools"]) == 1


def test_http_probe_exhausts_retries_with_unified_detail(monkeypatch):
    manager = MCPClientManager(max_attempts=3, retry_backoff_seconds=0)

    async def always_fail(_endpoint: str, **_kwargs):
        return manager._build_result(ok=False, detail="http request error: connection refused")

    monkeypatch.setattr(manager, "_inspect_http_once", always_fail)
    result = asyncio.run(
        manager.inspect_server(transport_type="http", endpoint_or_command="http://127.0.0.1:65535"),
    )

    assert result["ok"] is False
    assert result["attempts"] == 3
    assert "after 3 attempts" in result["detail"]


def test_unsupported_transport_returns_error_without_retry():
    manager = MCPClientManager(max_attempts=3, retry_backoff_seconds=0)
    result = asyncio.run(
        manager.inspect_server(transport_type="socket", endpoint_or_command="ignored"),
    )

    assert result["ok"] is False
    assert result["status"] == "error"
    assert result["attempts"] == 1
    assert "unsupported transport_type" in result["detail"]


def test_http_probe_prefers_mcp_rpc(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)

    async def fake_mcp(_endpoint: str, **_kwargs):
        return manager._build_result(
            ok=True,
            detail="mcp rpc reachable (1 tools)",
            tools=[{"name": "echo"}],
        )

    async def fail_if_legacy(_endpoint: str, **_kwargs):
        raise AssertionError("legacy probe should not be used when MCP probe succeeds")

    monkeypatch.setattr(manager, "_inspect_http_mcp_once", fake_mcp)
    monkeypatch.setattr(manager, "_inspect_http_legacy_once", fail_if_legacy)

    result = asyncio.run(
        manager.inspect_server(transport_type="http", endpoint_or_command="http://example.com/mcp"),
    )

    assert result["ok"] is True
    assert result["detail"] == "mcp rpc reachable (1 tools)"


def test_http_probe_falls_back_to_legacy_when_mcp_rpc_fails(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)

    async def fail_mcp(_endpoint: str, **_kwargs):
        raise RuntimeError("mcp rpc unavailable")

    async def legacy_probe(_endpoint: str, **_kwargs):
        return manager._build_result(
            ok=True,
            detail="HTTP endpoint reachable",
            tools=[{"name": "legacy-tool"}],
        )

    monkeypatch.setattr(manager, "_inspect_http_mcp_once", fail_mcp)
    monkeypatch.setattr(manager, "_inspect_http_legacy_once", legacy_probe)

    result = asyncio.run(
        manager.inspect_server(transport_type="http", endpoint_or_command="http://example.com"),
    )

    assert result["ok"] is True
    assert result["detail"] == "HTTP endpoint reachable"
    assert result["tools"][0]["name"] == "legacy-tool"


def test_call_tool_uses_single_exposed_tool_when_name_missing(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)

    async def fake_init(_client, _endpoint):
        return None

    async def fake_tools(_client, _endpoint):
        return [{"name": "echo", "description": "echo input"}]

    async def fake_jsonrpc(_client, _endpoint, method, params):
        assert method == "tools/call"
        assert params["name"] == "echo"
        assert params["arguments"]["query"] == "hello"
        return {"content": [{"type": "text", "text": "echo: hello"}]}

    monkeypatch.setattr(manager, "_initialize_http_session", fake_init)
    monkeypatch.setattr(manager, "_list_http_tools", fake_tools)
    monkeypatch.setattr(manager, "_jsonrpc_request", fake_jsonrpc)

    result = asyncio.run(
        manager.call_tool(
            transport_type="http",
            endpoint_or_command="http://example.com/mcp",
            tool_name=None,
            arguments={"query": "hello"},
        )
    )

    assert result["ok"] is True
    assert result["tool_name"] == "echo"
    assert "echo: hello" in result["summary"]


def test_http_client_kwargs_supports_timeout_headers_and_bearer_auth():
    manager = MCPClientManager(http_timeout_seconds=8)
    kwargs = manager._build_http_client_kwargs(
        {
            "timeoutMs": 2500,
            "headers": {"X-Trace-Id": "trace-123"},
            "auth": {"type": "bearer", "token": "token-abc"},
        }
    )

    assert kwargs["timeout"] == 2.5
    assert kwargs["headers"]["X-Trace-Id"] == "trace-123"
    assert kwargs["headers"]["Authorization"] == "Bearer token-abc"


def test_http_client_kwargs_supports_api_key_and_basic_auth():
    manager = MCPClientManager(http_timeout_seconds=8)

    api_key_kwargs = manager._build_http_client_kwargs(
        {
            "auth": {
                "type": "apiKey",
                "headerName": "X-API-Key",
                "value": "secret-key",
            }
        }
    )
    assert api_key_kwargs["headers"]["X-API-Key"] == "secret-key"

    basic_kwargs = manager._build_http_client_kwargs(
        {
            "auth": {
                "type": "basic",
                "username": "tester",
                "password": "pwd",
            }
        }
    )
    assert basic_kwargs["auth"] == ("tester", "pwd")


def test_stdio_inspect_and_call_tool_with_real_subprocess(tmp_path):
    script_path = tmp_path / "fake_stdio_mcp.py"
    script_path.write_text(
        """
import json
import os
import sys

PREFIX = os.environ.get("MCP_PREFIX", "echo")

for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue
    request = json.loads(line)
    req_id = request.get("id")
    method = request.get("method")
    params = request.get("params", {})

    if method == "initialize":
        result = {"protocolVersion": "2024-11-05", "capabilities": {}, "serverInfo": {"name": "fake", "version": "0.1.0"}}
    elif method == "notifications/initialized":
        result = {}
    elif method == "tools/list":
        result = {"tools": [{"name": "echo", "description": "echo input"}]}
    elif method == "resources/list":
        result = {"resources": []}
    elif method == "prompts/list":
        result = {"prompts": []}
    elif method == "tools/call":
        args = params.get("arguments", {})
        text = f"{PREFIX}: {args.get('query', '')}".strip()
        result = {"content": [{"type": "text", "text": text}]}
    else:
        payload = {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"unsupported method: {method}"}}
        sys.stdout.write(json.dumps(payload) + "\\n")
        sys.stdout.flush()
        continue

    payload = {"jsonrpc": "2.0", "id": req_id, "result": result}
    sys.stdout.write(json.dumps(payload) + "\\n")
    sys.stdout.flush()
""",
        encoding="utf-8",
    )

    manager = MCPClientManager(stdio_timeout_seconds=2, max_attempts=1, retry_backoff_seconds=0)
    inspect_result = asyncio.run(
        manager.inspect_server(
            transport_type="stdio",
            endpoint_or_command=sys.executable,
            config={"args": [str(script_path)]},
        )
    )
    assert inspect_result["ok"] is True
    assert inspect_result["status"] == "connected"
    assert inspect_result["tools"][0]["name"] == "echo"

    call_result = asyncio.run(
        manager.call_tool(
            transport_type="stdio",
            endpoint_or_command=sys.executable,
            tool_name=None,
            arguments={"query": "hello"},
            config={
                "args": [str(script_path)],
                "env": {"MCP_PREFIX": "prefix"},
            },
        )
    )
    assert call_result["ok"] is True
    assert call_result["tool_name"] == "echo"
    assert "prefix: hello" in call_result["summary"]


def test_stdio_inspect_and_call_tool_with_line_protocol_subprocess(tmp_path):
    script_path = tmp_path / "fake_stdio_mcp_line.py"
    script_path.write_text(
        """
import json
import os
import sys

PREFIX = os.environ.get("MCP_PREFIX", "echo")

for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue
    request = json.loads(line)
    req_id = request.get("id")
    method = request.get("method")
    params = request.get("params", {})

    if method == "initialize":
        result = {"protocolVersion": "2024-11-05", "capabilities": {}, "serverInfo": {"name": "fake-line", "version": "0.1.0"}}
        payload = {"jsonrpc": "2.0", "id": req_id, "result": result}
    elif method == "notifications/initialized":
        payload = {"jsonrpc": "2.0", "id": req_id, "result": {}}
    elif method == "tools/list":
        payload = {"jsonrpc": "2.0", "id": req_id, "result": {"tools": [{"name": "echo", "description": "echo input"}]}}
    elif method == "resources/list":
        payload = {"jsonrpc": "2.0", "id": req_id, "result": {"resources": []}}
    elif method == "prompts/list":
        payload = {"jsonrpc": "2.0", "id": req_id, "result": {"prompts": []}}
    elif method == "tools/call":
        args = params.get("arguments", {})
        text = f"{PREFIX}: {args.get('query', '')}".strip()
        payload = {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": text}]}}
    else:
        payload = {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"unsupported method: {method}"}}

    sys.stdout.write(json.dumps(payload) + "\\n")
    sys.stdout.flush()
""",
        encoding="utf-8",
    )

    manager = MCPClientManager(stdio_timeout_seconds=2, max_attempts=1, retry_backoff_seconds=0)
    inspect_result = asyncio.run(
        manager.inspect_server(
            transport_type="stdio",
            endpoint_or_command=sys.executable,
            config={"args": [str(script_path)]},
        )
    )
    assert inspect_result["ok"] is True
    assert inspect_result["status"] == "connected"
    assert inspect_result["tools"][0]["name"] == "echo"

    call_result = asyncio.run(
        manager.call_tool(
            transport_type="stdio",
            endpoint_or_command=sys.executable,
            tool_name=None,
            arguments={"query": "hello"},
            config={
                "args": [str(script_path)],
                "env": {"MCP_PREFIX": "line"},
            },
        )
    )
    assert call_result["ok"] is True
    assert call_result["tool_name"] == "echo"
    assert "line: hello" in call_result["summary"]


def test_smoke_server_uses_first_tool_with_default_empty_arguments(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)
    captured: dict[str, object] = {}

    async def fake_inspect_server(*, transport_type: str, endpoint_or_command: str, config=None):
        assert transport_type == "http"
        assert endpoint_or_command == "http://example.com/mcp"
        return {
            "ok": True,
            "status": "connected",
            "detail": "mcp rpc reachable (1 tools)",
            "tools": [{"name": "echo", "description": "echo"}],
            "resources": [],
            "prompts": [],
        }

    async def fake_call_tool(
        *,
        transport_type: str,
        endpoint_or_command: str,
        tool_name: str | None,
        arguments: dict | None,
        **kwargs,
    ):
        captured["tool_name"] = tool_name
        captured["arguments"] = arguments
        return {
            "ok": True,
            "tool_name": tool_name,
            "detail": "tool call completed",
            "summary": "ok",
            "result": {"content": [{"type": "text", "text": "ok"}]},
        }

    monkeypatch.setattr(manager, "inspect_server", fake_inspect_server)
    monkeypatch.setattr(manager, "call_tool", fake_call_tool)

    result = asyncio.run(
        manager.smoke_server(
            transport_type="http",
            endpoint_or_command="http://example.com/mcp",
        )
    )

    assert result["ok"] is True
    assert result["used_tool_name"] == "echo"
    assert captured["tool_name"] == "echo"
    assert captured["arguments"] == {}
    assert len(result["steps"]) == 3


def test_smoke_server_prefers_safe_read_tool_when_tool_name_missing(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)
    captured: dict[str, object] = {}

    async def fake_inspect_server(*, transport_type: str, endpoint_or_command: str, config=None):
        return {
            "ok": True,
            "status": "connected",
            "detail": "mcp rpc reachable (2 tools)",
            "tools": [
                {"name": "create_entities", "description": "requires entities"},
                {"name": "read_graph", "description": "read only"},
            ],
            "resources": [],
            "prompts": [],
        }

    async def fake_call_tool(
        *,
        transport_type: str,
        endpoint_or_command: str,
        tool_name: str | None,
        arguments: dict | None,
        **kwargs,
    ):
        captured["tool_name"] = tool_name
        captured["arguments"] = arguments
        return {
            "ok": True,
            "tool_name": tool_name,
            "detail": "tool call completed",
            "summary": "ok",
            "result": {"content": [{"type": "text", "text": "ok"}]},
        }

    monkeypatch.setattr(manager, "inspect_server", fake_inspect_server)
    monkeypatch.setattr(manager, "call_tool", fake_call_tool)

    result = asyncio.run(
        manager.smoke_server(
            transport_type="http",
            endpoint_or_command="http://example.com/mcp",
        )
    )

    assert result["ok"] is True
    assert result["used_tool_name"] == "read_graph"
    assert captured["tool_name"] == "read_graph"
    assert captured["arguments"] == {}


def test_smoke_server_prefers_list_prefix_tool_when_name_missing(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)
    captured: dict[str, object] = {}

    async def fake_inspect_server(*, transport_type: str, endpoint_or_command: str, config=None):
        return {
            "ok": True,
            "status": "connected",
            "detail": "mcp rpc reachable (2 tools)",
            "tools": [
                {
                    "name": "click",
                    "description": "click node",
                    "input_schema": {
                        "type": "object",
                        "required": ["uid"],
                        "properties": {"uid": {"type": "string"}},
                    },
                },
                {"name": "list_pages", "description": "list pages"},
            ],
            "resources": [],
            "prompts": [],
        }

    async def fake_call_tool(
        *,
        transport_type: str,
        endpoint_or_command: str,
        tool_name: str | None,
        arguments: dict | None,
        **kwargs,
    ):
        captured["tool_name"] = tool_name
        captured["arguments"] = arguments
        return {
            "ok": True,
            "tool_name": tool_name,
            "detail": "tool call completed",
            "summary": "ok",
            "result": {"content": [{"type": "text", "text": "ok"}]},
        }

    monkeypatch.setattr(manager, "inspect_server", fake_inspect_server)
    monkeypatch.setattr(manager, "call_tool", fake_call_tool)

    result = asyncio.run(
        manager.smoke_server(
            transport_type="http",
            endpoint_or_command="http://example.com/mcp",
        )
    )

    assert result["ok"] is True
    assert result["used_tool_name"] == "list_pages"
    assert captured["tool_name"] == "list_pages"
    assert captured["arguments"] == {}


def test_smoke_server_skips_auto_call_when_selected_tool_requires_arguments(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)

    async def fake_inspect_server(*, transport_type: str, endpoint_or_command: str, config=None):
        return {
            "ok": True,
            "status": "connected",
            "detail": "mcp rpc reachable (1 tools)",
            "tools": [
                {
                    "name": "click",
                    "description": "click node",
                    "input_schema": {
                        "type": "object",
                        "required": ["uid"],
                        "properties": {"uid": {"type": "string"}},
                    },
                }
            ],
            "resources": [],
            "prompts": [],
        }

    async def should_not_call_tool(**kwargs):
        raise AssertionError("call_tool should not run when auto smoke selected tool requires arguments")

    monkeypatch.setattr(manager, "inspect_server", fake_inspect_server)
    monkeypatch.setattr(manager, "call_tool", should_not_call_tool)

    result = asyncio.run(
        manager.smoke_server(
            transport_type="http",
            endpoint_or_command="http://example.com/mcp",
        )
    )

    assert result["ok"] is True
    assert result["status"] == "connected"
    assert result["used_tool_name"] == "click"
    assert len(result["steps"]) == 3
    assert result["steps"][2]["name"] == "tools/call"
    assert result["steps"][2]["ok"] is True
    assert result["steps"][2]["status"] == "skipped"
    assert "requires arguments" in result["steps"][2]["detail"]
    assert "uid" in result["steps"][2]["detail"]


def test_smoke_server_classifies_forbidden_path_as_permission(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)

    async def fake_inspect_server(*, transport_type: str, endpoint_or_command: str, config=None):
        return {
            "ok": True,
            "status": "connected",
            "detail": "mcp rpc reachable (1 tools)",
            "tools": [{"name": "read_file", "description": "read"}],
            "resources": [],
            "prompts": [],
        }

    async def fake_call_tool(**kwargs):
        return {
            "ok": False,
            "code": "forbidden_path",
            "detail": "forbidden path",
            "details": {"path": "D:/secret.txt", "reason": "not_in_allowlist"},
            "tool_name": "read_file",
            "summary": "",
            "result": {},
        }

    monkeypatch.setattr(manager, "inspect_server", fake_inspect_server)
    monkeypatch.setattr(manager, "call_tool", fake_call_tool)

    result = asyncio.run(
        manager.smoke_server(
            transport_type="http",
            endpoint_or_command="http://example.com/mcp",
        )
    )

    assert result["ok"] is False
    assert result["status"] == "error"
    call_step = result["steps"][2]
    assert call_step["name"] == "tools/call"
    assert call_step["ok"] is False
    assert call_step["error_category"] == "permission"
    assert call_step["details"]["path"] == "D:/secret.txt"


def test_smoke_server_fails_when_tools_list_is_empty(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)

    async def fake_inspect_server(*, transport_type: str, endpoint_or_command: str, config=None):
        return {
            "ok": True,
            "status": "connected",
            "detail": "mcp rpc reachable (0 tools)",
            "tools": [],
            "resources": [],
            "prompts": [],
        }

    async def should_not_call_tool(**kwargs):
        raise AssertionError("call_tool should not run when no tools are available")

    monkeypatch.setattr(manager, "inspect_server", fake_inspect_server)
    monkeypatch.setattr(manager, "call_tool", should_not_call_tool)

    result = asyncio.run(
        manager.smoke_server(
            transport_type="http",
            endpoint_or_command="http://example.com/mcp",
        )
    )

    assert result["ok"] is False
    assert result["status"] == "error"
    assert result["steps"][1]["name"] == "tools/list"
    assert result["steps"][1]["ok"] is False
    assert result["steps"][1]["error_category"] == "server"
    assert result["steps"][2]["status"] == "skipped"


def test_http_call_tool_reuses_initialized_runtime_session(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)
    init_calls = {"count": 0}
    call_calls = {"count": 0}

    async def fake_init(_client, _endpoint):
        init_calls["count"] += 1

    async def fake_tools(_client, _endpoint):
        return [{"name": "echo", "description": "echo input"}]

    async def fake_jsonrpc(_client, _endpoint, method, params):
        assert method == "tools/call"
        call_calls["count"] += 1
        return {"content": [{"type": "text", "text": f"echo: {params['arguments']['query']}"}]}

    monkeypatch.setattr(manager, "_initialize_http_session", fake_init)
    monkeypatch.setattr(manager, "_list_http_tools", fake_tools)
    monkeypatch.setattr(manager, "_jsonrpc_request", fake_jsonrpc)

    first = asyncio.run(
        manager.call_tool(
            transport_type="http",
            endpoint_or_command="http://example.com/mcp",
            tool_name="echo",
            arguments={"query": "one"},
        )
    )
    second = asyncio.run(
        manager.call_tool(
            transport_type="http",
            endpoint_or_command="http://example.com/mcp",
            tool_name="echo",
            arguments={"query": "two"},
        )
    )

    assert first["ok"] is True
    assert second["ok"] is True
    assert first["session_reuse"] is False
    assert second["session_reuse"] is True
    assert init_calls["count"] == 1
    assert call_calls["count"] == 2


def test_http_call_tool_recreates_session_once_after_failure(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)
    init_calls = {"count": 0}
    jsonrpc_calls = {"count": 0}

    async def fake_init(_client, _endpoint):
        init_calls["count"] += 1

    async def fake_tools(_client, _endpoint):
        return [{"name": "echo", "description": "echo input"}]

    async def fake_jsonrpc(_client, _endpoint, method, params):
        assert method == "tools/call"
        jsonrpc_calls["count"] += 1
        if jsonrpc_calls["count"] == 1:
            raise RuntimeError("connection dropped")
        return {"content": [{"type": "text", "text": "recovered"}]}

    monkeypatch.setattr(manager, "_initialize_http_session", fake_init)
    monkeypatch.setattr(manager, "_list_http_tools", fake_tools)
    monkeypatch.setattr(manager, "_jsonrpc_request", fake_jsonrpc)

    result = asyncio.run(
        manager.call_tool(
            transport_type="http",
            endpoint_or_command="http://example.com/mcp",
            tool_name="echo",
            arguments={"query": "hello"},
        )
    )

    assert result["ok"] is True
    assert result["session_recreated"] is True
    assert init_calls["count"] == 2
    assert jsonrpc_calls["count"] == 2


def test_stdio_inspect_reuses_spawned_runtime_process(monkeypatch):
    manager = MCPClientManager(stdio_timeout_seconds=2, max_attempts=1, retry_backoff_seconds=0)
    spawn_calls = {"count": 0}
    init_calls = {"count": 0}

    class _DummyStdin:
        def close(self):
            return None

    class _DummyProcess:
        def __init__(self):
            self.stdin = _DummyStdin()
            self.stdout = object()
            self.returncode = None

    async def fake_spawn(_command: str, config=None):
        spawn_calls["count"] += 1
        return _DummyProcess()

    async def fake_close(_process):
        return None

    async def fake_initialize(_process):
        init_calls["count"] += 1

    async def fake_list_tools(_process):
        return [{"name": "echo", "description": "echo input"}]

    async def fake_list_resources(_process):
        return []

    async def fake_list_prompts(_process):
        return []

    monkeypatch.setattr(manager, "_spawn_stdio_process", fake_spawn)
    monkeypatch.setattr(manager, "_close_stdio_process", fake_close)
    monkeypatch.setattr(manager, "_initialize_stdio_session", fake_initialize)
    monkeypatch.setattr(manager, "_list_stdio_tools", fake_list_tools)
    monkeypatch.setattr(manager, "_list_stdio_resources", fake_list_resources)
    monkeypatch.setattr(manager, "_list_stdio_prompts", fake_list_prompts)

    first = asyncio.run(
        manager.inspect_server(
            transport_type="stdio",
            endpoint_or_command="python fake.py",
        )
    )
    second = asyncio.run(
        manager.inspect_server(
            transport_type="stdio",
            endpoint_or_command="python fake.py",
        )
    )

    assert first["ok"] is True
    assert second["ok"] is True
    assert first["session_reuse"] is False
    assert second["session_reuse"] is True
    assert spawn_calls["count"] == 1
    assert init_calls["count"] == 1


def test_stdio_command_resolves_windows_cmd_executable(monkeypatch):
    manager = MCPClientManager()

    def fake_which(name: str):
        if name == "npx":
            return r"C:\Program Files\nodejs\npx.CMD"
        return None

    monkeypatch.setattr(mcp_client_module.shutil, "which", fake_which)

    command_parts, env = manager._build_stdio_command_parts(
        "npx",
        {"args": ["-y", "@modelcontextprotocol/server-memory"]},
    )

    assert command_parts[0] == r"C:\Program Files\nodejs\npx.CMD"
    assert command_parts[1:] == ["-y", "@modelcontextprotocol/server-memory"]
    assert env is None


def test_stdio_spawn_fallbacks_to_sync_popen_when_asyncio_subprocess_unsupported(monkeypatch):
    manager = MCPClientManager(stdio_timeout_seconds=2, max_attempts=1, retry_backoff_seconds=0)
    calls = {"popen": 0}

    async def fake_create_subprocess_exec(*_args, **_kwargs):
        raise NotImplementedError

    class _DummyPipe:
        def write(self, _payload):
            return 0

        def flush(self):
            return None

        def readline(self):
            return b""

        def read(self, _size=None):
            return b""

        def close(self):
            return None

    class _DummyProcess:
        def __init__(self):
            self.stdin = _DummyPipe()
            self.stdout = _DummyPipe()
            self.stderr = _DummyPipe()
            self.returncode = None

        def poll(self):
            return self.returncode

        def wait(self, timeout=None):
            return 0

        def terminate(self):
            self.returncode = 0

        def kill(self):
            self.returncode = 0

    def fake_popen(_args, **_kwargs):
        calls["popen"] += 1
        return _DummyProcess()

    monkeypatch.setattr(mcp_client_module.asyncio, "create_subprocess_exec", fake_create_subprocess_exec)
    monkeypatch.setattr(mcp_client_module.subprocess, "Popen", fake_popen)

    process = asyncio.run(
        manager._spawn_stdio_process(
            "npx",
            {"args": ["-y", "chrome-devtools-mcp@latest"]},
        )
    )

    assert calls["popen"] == 1
    assert process.stdin is not None
    assert process.stdout is not None
