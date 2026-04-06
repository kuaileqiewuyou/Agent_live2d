from __future__ import annotations

import asyncio
import sys

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

def read_frame():
    headers = {}
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        if line in (b"\\r\\n", b"\\n"):
            break
        name, value = line.decode("utf-8", errors="ignore").split(":", 1)
        headers[name.strip().lower()] = value.strip()

    length = int(headers.get("content-length", "0"))
    payload = sys.stdin.buffer.read(length)
    return json.loads(payload.decode("utf-8"))

def write_frame(payload):
    raw = json.dumps(payload).encode("utf-8")
    sys.stdout.buffer.write(f"Content-Length: {len(raw)}\\r\\n\\r\\n".encode("ascii") + raw)
    sys.stdout.buffer.flush()

while True:
    request = read_frame()
    if request is None:
        break
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
        write_frame({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"unsupported method: {method}"}})
        continue

    write_frame({"jsonrpc": "2.0", "id": req_id, "result": result})
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
