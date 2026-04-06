from __future__ import annotations

import asyncio

from app.agents.nodes import _MCP_CLIENT, tool_agent


def test_tool_agent_manual_mcp_real_call_success(monkeypatch):
    async def fake_call_tool(*, transport_type, endpoint_or_command, tool_name, arguments, config=None):
        assert transport_type == "http"
        assert endpoint_or_command == "http://localhost:3900/mcp"
        assert tool_name == "echo"
        assert arguments["query"] == "hello"
        assert config["timeoutMs"] == 1800
        assert config["headers"]["X-Trace-Id"] == "trace-123"
        assert config["auth"]["type"] == "bearer"
        return {
            "ok": True,
            "detail": "tool call completed",
            "tool_name": "echo",
            "result": {"content": [{"type": "text", "text": "echo: hello"}]},
            "summary": "echo: hello",
        }

    monkeypatch.setattr(_MCP_CLIENT, "call_tool", fake_call_tool)

    state = {
        "user_input": "please run mcp",
        "manual_tool_requests": [
            {
                "id": "manual-mcp-1",
                "type": "mcp",
                "target_id": "mcp-1",
                "label": "Echo MCP",
                "input_params": {"tool": "echo", "query": "hello"},
            }
        ],
        "enabled_skills": [],
        "enabled_mcp_servers": [
            {
                "id": "mcp-1",
                "name": "Echo MCP",
                "status": "connected",
                "transport_type": "http",
                "endpoint_or_command": "http://localhost:3900/mcp",
                "capabilities": {
                    "tools": [{"name": "echo"}],
                    "config": {
                        "timeoutMs": 1800,
                        "headers": {"X-Trace-Id": "trace-123"},
                        "auth": {"type": "bearer", "token": "token-abc"},
                    },
                },
            }
        ],
    }

    result = asyncio.run(tool_agent(state))
    tool_result = result["tool_results"][0]
    assert tool_result["type"] == "mcp"
    assert tool_result["manual"] is True
    assert tool_result["executionMode"] == "real"
    assert tool_result["toolName"] == "echo"
    assert "echo: hello" in tool_result["result"]


def test_tool_agent_manual_mcp_real_call_failure(monkeypatch):
    async def fake_call_tool(*, transport_type, endpoint_or_command, tool_name, arguments, config=None):
        return {
            "ok": False,
            "detail": "connection refused",
            "tool_name": tool_name or "",
            "result": {},
            "summary": "",
        }

    monkeypatch.setattr(_MCP_CLIENT, "call_tool", fake_call_tool)

    state = {
        "user_input": "please run mcp",
        "manual_tool_requests": [
            {
                "id": "manual-mcp-1",
                "type": "mcp",
                "target_id": "mcp-1",
                "label": "Echo MCP",
                "input_params": {"tool": "echo", "query": "hello"},
            }
        ],
        "enabled_skills": [],
        "enabled_mcp_servers": [
            {
                "id": "mcp-1",
                "name": "Echo MCP",
                "status": "connected",
                "transport_type": "http",
                "endpoint_or_command": "http://localhost:3900/mcp",
                "capabilities": {"tools": [{"name": "echo"}]},
            }
        ],
    }

    result = asyncio.run(tool_agent(state))
    tool_result = result["tool_results"][0]
    assert tool_result["type"] == "mcp"
    assert tool_result["executionMode"] == "real"
    assert tool_result["error"] is True
    assert "connection refused" in tool_result["result"]
