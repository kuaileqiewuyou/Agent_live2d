from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import datetime, timezone

from app.agents.nodes import _MCP_CLIENT, _SKILL_REGISTRY


def _bootstrap_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "manual-tool-stream-persona",
            "avatar": "avatar.png",
            "description": "stream manual tool integration",
            "personalityTags": ["calm"],
            "speakingStyle": "natural",
            "backgroundStory": "test",
            "openingMessage": "hello",
            "longTermMemoryEnabled": True,
            "live2dModel": "manual-stream.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are a test assistant",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "manual-tool-stream-model",
            "provider": "openai-compatible",
            "baseUrl": "http://localhost:11434/v1",
            "apiKey": "local-key",
            "model": "gpt-test",
            "streamEnabled": True,
            "toolCallSupported": True,
            "isDefault": True,
            "extraConfig": {},
        },
    ).json()["data"]
    skill = client.post(
        "/api/skills",
        json={
            "name": "summary skill",
            "description": "stream skill test",
            "version": "0.1.0",
            "author": "backend",
            "tags": ["summary"],
            "enabled": True,
            "scope": ["conversation"],
            "configSchema": {"type": "object"},
            "runtimeType": "workflow",
        },
    ).json()["data"]
    mcp = client.post(
        "/api/mcp/servers",
        json={
            "name": "stream-mcp-server",
            "description": "stream mcp test",
            "transportType": "http",
            "endpointOrCommand": "http://127.0.0.1:3901/mcp",
            "enabled": True,
            "advancedConfig": {
                "timeoutMs": 1200,
                "headers": {"X-Trace-Id": "stream-tool-test"},
            },
        },
    ).json()["data"]
    conversation = client.post(
        "/api/conversations",
        json={
            "title": "manual-tool-stream-conversation",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [skill["id"]],
            "enabledMcpServerIds": [mcp["id"]],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"], skill["id"], mcp["id"]


def _iter_sse_events(stream_body: str) -> Iterator[tuple[str, dict]]:
    normalized = stream_body.replace("\r\n", "\n")
    current_event = ""
    current_data: list[str] = []

    for raw_line in normalized.split("\n"):
        line = raw_line.strip()
        if line.startswith("event:"):
            if current_event:
                payload = json.loads("".join(current_data)) if current_data else {}
                yield current_event, payload
                current_data = []
            current_event = line[len("event:") :].strip()
            continue

        if line.startswith("data:"):
            current_data.append(line[len("data:") :].strip())
            continue

        if line == "" and current_event:
            payload = json.loads("".join(current_data)) if current_data else {}
            yield current_event, payload
            current_event = ""
            current_data = []

    if current_event:
        payload = json.loads("".join(current_data)) if current_data else {}
        yield current_event, payload


def test_stream_manual_tool_requests_real_execution(monkeypatch, client):
    conversation_id, skill_id, mcp_id = _bootstrap_conversation(client)

    async def fake_inspect_server(self, *, transport_type: str, endpoint_or_command: str, config=None):
        assert transport_type == "http"
        assert endpoint_or_command == "http://127.0.0.1:3901/mcp"
        assert isinstance(config, dict)
        assert config.get("timeoutMs") == 1200
        return {
            "ok": True,
            "status": "connected",
            "detail": "probe ok",
            "tools": [{"name": "echo", "description": "echo"}],
            "resources": [],
            "prompts": [],
            "checked_at": datetime.now(timezone.utc),
        }

    monkeypatch.setattr(
        "app.services.mcp.MCPClientManager.inspect_server",
        fake_inspect_server,
    )

    check = client.post(f"/api/mcp/servers/{mcp_id}/check")
    assert check.status_code == 200
    assert check.json()["data"]["ok"] is True

    class DummySkillExecutor:
        async def execute(self, *, user_input: str, context: dict):
            assert user_input == "run manual tools now"
            assert context["input_params"]["goal"] == "skill-goal"
            return {"summary_hint": "skill-real-ok"}

    def fake_get_executor(_name: str):
        return DummySkillExecutor()

    async def fake_call_tool(
        *,
        transport_type,
        endpoint_or_command,
        tool_name,
        arguments,
        config=None,
        file_access_allow_all=None,
        file_access_folders=None,
        file_access_blacklist=None,
    ):
        assert transport_type == "http"
        assert endpoint_or_command == "http://127.0.0.1:3901/mcp"
        assert tool_name == "echo"
        assert arguments["query"] == "hello"
        assert isinstance(config, dict)
        assert config.get("timeoutMs") == 1200
        assert config.get("headers", {}).get("X-Trace-Id") == "stream-tool-test"
        assert file_access_allow_all is True
        assert file_access_folders == []
        assert file_access_blacklist == []
        return {
            "ok": True,
            "detail": "tool call completed",
            "tool_name": "echo",
            "result": {"content": [{"type": "text", "text": "mcp-real-ok"}]},
            "summary": "mcp-real-ok",
        }

    monkeypatch.setattr(_SKILL_REGISTRY, "get", fake_get_executor)
    monkeypatch.setattr(_MCP_CLIENT, "call_tool", fake_call_tool)

    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json={
            "content": "run manual tools now",
            "manualToolRequests": [
                {
                    "id": "manual-skill-1",
                    "type": "skill",
                    "targetId": skill_id,
                    "label": "summary skill",
                    "inputParams": {"goal": "skill-goal"},
                },
                {
                    "id": "manual-mcp-1",
                    "type": "mcp",
                    "targetId": mcp_id,
                    "label": "stream-mcp-server",
                    "inputParams": {"tool": "echo", "query": "hello"},
                },
            ],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    events = list(_iter_sse_events(body))
    tool_results = [payload for event, payload in events if event == "tool_result"]
    assert len(tool_results) >= 2

    skill_result = next(item for item in tool_results if item.get("type") == "skill")
    mcp_result = next(item for item in tool_results if item.get("type") == "mcp")

    assert skill_result["manual"] is True
    assert skill_result["executionMode"] == "real"
    assert "skill-real-ok" in skill_result["result"]

    assert mcp_result["manual"] is True
    assert mcp_result["executionMode"] == "real"
    assert mcp_result["toolName"] == "echo"
    assert "mcp-real-ok" in mcp_result["result"]

    final_payload = next(payload for event, payload in events if event == "final_answer")
    manual_requests = final_payload.get("manualToolRequests", [])
    assert len(manual_requests) == 2


def test_stream_manual_tool_requests_failure_does_not_block_final_answer(monkeypatch, client):
    conversation_id, skill_id, mcp_id = _bootstrap_conversation(client)

    async def fake_inspect_server(self, *, transport_type: str, endpoint_or_command: str, config=None):
        return {
            "ok": True,
            "status": "connected",
            "detail": "probe ok",
            "tools": [{"name": "echo", "description": "echo"}],
            "resources": [],
            "prompts": [],
            "checked_at": datetime.now(timezone.utc),
        }

    monkeypatch.setattr(
        "app.services.mcp.MCPClientManager.inspect_server",
        fake_inspect_server,
    )
    check = client.post(f"/api/mcp/servers/{mcp_id}/check")
    assert check.status_code == 200
    assert check.json()["data"]["ok"] is True

    class FailingSkillExecutor:
        async def execute(self, *, user_input: str, context: dict):
            raise RuntimeError("skill runtime unavailable")

    def fake_get_executor(_name: str):
        return FailingSkillExecutor()

    async def fake_call_tool(
        *,
        transport_type,
        endpoint_or_command,
        tool_name,
        arguments,
        config=None,
        file_access_allow_all=None,
        file_access_folders=None,
        file_access_blacklist=None,
    ):
        assert file_access_allow_all is True
        assert file_access_folders == []
        assert file_access_blacklist == []
        return {
            "ok": False,
            "detail": "mcp timeout",
            "tool_name": tool_name or "",
            "result": {},
            "summary": "",
        }

    monkeypatch.setattr(_SKILL_REGISTRY, "get", fake_get_executor)
    monkeypatch.setattr(_MCP_CLIENT, "call_tool", fake_call_tool)

    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json={
            "content": "run manual tools now",
            "manualToolRequests": [
                {
                    "id": "manual-skill-err",
                    "type": "skill",
                    "targetId": skill_id,
                    "label": "summary skill",
                    "inputParams": {"goal": "skill-goal"},
                },
                {
                    "id": "manual-mcp-err",
                    "type": "mcp",
                    "targetId": mcp_id,
                    "label": "stream-mcp-server",
                    "inputParams": {"tool": "echo", "query": "hello"},
                },
            ],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    events = list(_iter_sse_events(body))
    tool_results = [payload for event, payload in events if event == "tool_result"]
    assert len(tool_results) >= 2
    assert any(item.get("type") == "skill" and item.get("error") is True for item in tool_results)
    assert any(item.get("type") == "mcp" and item.get("error") is True for item in tool_results)

    final_payload = next(payload for event, payload in events if event == "final_answer")
    manual_requests = final_payload.get("manualToolRequests", [])
    assert len(manual_requests) == 2


def test_stream_manual_mcp_not_ready_degrades_to_placeholder_without_blocking_final_answer(monkeypatch, client):
    conversation_id, skill_id, mcp_id = _bootstrap_conversation(client)

    async def failing_inspect_server(self, *, transport_type: str, endpoint_or_command: str, config=None):
        return {
            "ok": False,
            "status": "error",
            "detail": "probe timeout",
            "tools": [],
            "resources": [],
            "prompts": [],
            "checked_at": datetime.now(timezone.utc),
        }

    monkeypatch.setattr(
        "app.services.mcp.MCPClientManager.inspect_server",
        failing_inspect_server,
    )

    check = client.post(f"/api/mcp/servers/{mcp_id}/check")
    assert check.status_code == 200
    assert check.json()["data"]["ok"] is False
    assert check.json()["data"]["status"] == "error"

    async def fail_if_called(
        *,
        transport_type,
        endpoint_or_command,
        tool_name,
        arguments,
        config=None,
        file_access_allow_all=None,
        file_access_folders=None,
        file_access_blacklist=None,
    ):
        assert file_access_allow_all is True
        assert file_access_folders == []
        assert file_access_blacklist == []
        raise AssertionError("call_tool should not be called when MCP server status is error")

    monkeypatch.setattr(_MCP_CLIENT, "call_tool", fail_if_called)

    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json={
            "content": "run manual tools now",
            "manualToolRequests": [
                {
                    "id": "manual-skill-ok",
                    "type": "skill",
                    "targetId": skill_id,
                    "label": "summary skill",
                    "inputParams": {"goal": "skill-goal"},
                },
                {
                    "id": "manual-mcp-degrade",
                    "type": "mcp",
                    "targetId": mcp_id,
                    "label": "stream-mcp-server",
                    "inputParams": {"tool": "echo", "query": "hello"},
                },
            ],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    events = list(_iter_sse_events(body))
    tool_results = [payload for event, payload in events if event == "tool_result"]
    assert len(tool_results) >= 2

    skill_result = next(item for item in tool_results if item.get("type") == "skill")
    mcp_result = next(item for item in tool_results if item.get("type") == "mcp")

    assert skill_result["executionMode"] == "real"
    assert mcp_result["executionMode"] == "placeholder"
    assert mcp_result.get("error") is None
    assert "not ready for real call" in mcp_result["summary"]

    final_payload = next(payload for event, payload in events if event == "final_answer")
    assert isinstance(final_payload.get("content"), str)
    assert len(final_payload.get("manualToolRequests", [])) == 2
