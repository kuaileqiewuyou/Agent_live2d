from __future__ import annotations

import asyncio

from app.mcp.client import MCPClientManager


def test_http_call_tool_blocks_unauthorized_argument_path(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)
    called = {"value": False}

    async def fake_http_call(_endpoint, **_kwargs):
        called["value"] = True
        return {"ok": True}

    monkeypatch.setattr(manager, "_call_http_tool_once", fake_http_call)

    result = asyncio.run(
        manager.call_tool(
            transport_type="http",
            endpoint_or_command="http://localhost:3900/mcp",
            tool_name="read_file",
            arguments={"path": "D:/secret/config.json"},
            file_access_allow_all=False,
            file_access_folders=["D:/Else/live2d"],
            file_access_blacklist=[],
        )
    )

    assert result["ok"] is False
    assert result["code"] == "forbidden_path"
    assert "D:/secret/config.json" in result["detail"]
    assert result["details"]["reason"] == "not_in_allowlist"
    assert called["value"] is False


def test_http_call_tool_allows_authorized_argument_path(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)
    called = {"value": False}

    async def fake_http_call(_endpoint, **_kwargs):
        called["value"] = True
        return {
            "ok": True,
            "detail": "ok",
            "tool_name": "read_file",
            "result": {"content": [{"type": "text", "text": "ok"}]},
            "summary": "ok",
        }

    monkeypatch.setattr(manager, "_call_http_tool_once", fake_http_call)

    result = asyncio.run(
        manager.call_tool(
            transport_type="http",
            endpoint_or_command="http://localhost:3900/mcp",
            tool_name="read_file",
            arguments={"source": {"path": "D:/Else/live2d/model/model3.json"}},
            file_access_allow_all=False,
            file_access_folders=["d:/else/live2d"],
            file_access_blacklist=[],
        )
    )

    assert result["ok"] is True
    assert called["value"] is True


def test_http_call_tool_does_not_misclassify_non_path_field(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)
    called = {"value": False}

    async def fake_http_call(_endpoint, **_kwargs):
        called["value"] = True
        return {
            "ok": True,
            "detail": "ok",
            "tool_name": "search",
            "result": {"content": [{"type": "text", "text": "ok"}]},
            "summary": "ok",
        }

    monkeypatch.setattr(manager, "_call_http_tool_once", fake_http_call)

    result = asyncio.run(
        manager.call_tool(
            transport_type="http",
            endpoint_or_command="http://localhost:3900/mcp",
            tool_name="search",
            arguments={"query": "open D:/secret/config.json"},
            file_access_allow_all=False,
            file_access_folders=["D:/Else/live2d"],
            file_access_blacklist=[],
        )
    )

    assert result["ok"] is True
    assert called["value"] is True


def test_stdio_call_tool_blocks_unauthorized_command_path(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)
    called = {"value": False}

    async def fake_stdio_call(_command, **_kwargs):
        called["value"] = True
        return {"ok": True}

    monkeypatch.setattr(manager, "_call_stdio_tool_once", fake_stdio_call)

    result = asyncio.run(
        manager.call_tool(
            transport_type="stdio",
            endpoint_or_command="python",
            tool_name="scan",
            arguments={},
            config={"args": ["D:/secret/input.txt"]},
            file_access_allow_all=False,
            file_access_folders=["D:/Else/live2d"],
            file_access_blacklist=[],
        )
    )

    assert result["ok"] is False
    assert result["code"] == "forbidden_path"
    assert "D:/secret/input.txt" in result["detail"]
    assert called["value"] is False


def test_blacklist_blocks_even_when_allow_all_is_true(monkeypatch):
    manager = MCPClientManager(max_attempts=1, retry_backoff_seconds=0)
    called = {"value": False}

    async def fake_http_call(_endpoint, **_kwargs):
        called["value"] = True
        return {"ok": True}

    monkeypatch.setattr(manager, "_call_http_tool_once", fake_http_call)

    result = asyncio.run(
        manager.call_tool(
            transport_type="http",
            endpoint_or_command="http://localhost:3900/mcp",
            tool_name="read_file",
            arguments={"path": "D:/Else/live2d/private/secret.txt"},
            file_access_allow_all=True,
            file_access_folders=[],
            file_access_blacklist=["D:/Else/live2d/private"],
        )
    )

    assert result["ok"] is False
    assert result["code"] == "forbidden_path"
    assert result["details"]["reason"] == "in_blacklist"
    assert called["value"] is False
