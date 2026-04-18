from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.agents.nodes import planner_agent, tool_agent
from app.schemas.ops_command import OpsCommandPreview, OpsCommandSession


@pytest.mark.asyncio
async def test_planner_agent_detects_ops_command_request_from_cmd_prefix():
    result = await planner_agent(
        {
            "user_input": "cmd: npm run build",
            "persona": {"name": "Ops Assistant"},
            "manual_tool_requests": [],
        }
    )
    assert result["planner_output"]["opsCommandDetected"] is True
    assert result["planner_output"]["needs_tools"] is True
    assert result["ops_command_request"]["command"] == "npm run build"


@pytest.mark.asyncio
async def test_planner_agent_detects_ops_command_request_from_natural_language():
    result = await planner_agent(
        {
            "user_input": "请执行 npm -v，谢谢",
            "persona": {"name": "Ops Assistant"},
            "manual_tool_requests": [],
        }
    )
    assert result["planner_output"]["opsCommandDetected"] is True
    assert result["planner_output"]["needs_tools"] is True
    assert result["ops_command_request"]["command"] == "npm -v"


@pytest.mark.asyncio
async def test_planner_agent_detects_ops_command_request_from_plain_command():
    result = await planner_agent(
        {
            "user_input": "npm -v",
            "persona": {"name": "Ops Assistant"},
            "manual_tool_requests": [],
        }
    )
    assert result["planner_output"]["opsCommandDetected"] is True
    assert result["planner_output"]["needs_tools"] is True
    assert result["ops_command_request"]["command"] == "npm -v"


@pytest.mark.asyncio
async def test_planner_agent_does_not_detect_plain_command_with_natural_language_suffix():
    result = await planner_agent(
        {
            "user_input": "npm -v 是什么命令",
            "persona": {"name": "Ops Assistant"},
            "manual_tool_requests": [],
        }
    )
    assert result["planner_output"]["opsCommandDetected"] is False


@pytest.mark.asyncio
async def test_tool_agent_emits_ops_command_preview_events(monkeypatch: pytest.MonkeyPatch):
    class _FakeCommandExecutor:
        async def preview(
            self,
            *,
            command: str,
            cwd: str | None = None,
            conversation_id: str | None = None,
        ):
            assert command == "npm run build"
            assert cwd == "D:/Develop/vscode Workspace/Agent_live2d"
            assert conversation_id == "conversation-ops-command"
            now = datetime.now(timezone.utc)
            return OpsCommandSession(
                id="ops-command-session-1",
                conversation_id=conversation_id,
                status="previewed",
                summary="ready",
                preview=OpsCommandPreview(
                    command=command,
                    argv=["npm", "run", "build"],
                    cwd=cwd,
                    risk_level="medium",
                    requires_confirm=True,
                    notes=["allowlisted executable"],
                ),
                result=None,
                created_at=now,
                updated_at=now,
                started_at=None,
                finished_at=None,
                error_category=None,
                error_message=None,
                metadata={},
            )

    monkeypatch.setattr(
        "app.services.ops_command_executor.get_ops_command_executor_service",
        lambda: _FakeCommandExecutor(),
    )

    result = await tool_agent(
        {
            "conversation_id": "conversation-ops-command",
            "user_input": "cmd: npm run build\ncwd: D:/Develop/vscode Workspace/Agent_live2d",
            "persona": {"name": "Ops Assistant"},
            "ops_command_request": {
                "command": "npm run build",
                "cwd": "D:/Develop/vscode Workspace/Agent_live2d",
            },
            "manual_tool_requests": [],
            "enabled_skills": [],
            "enabled_mcp_servers": [],
        }
    )

    event_names = [item["event"] for item in result["stream_events"]]
    assert "ops_command_preview" in event_names
    assert "ops_command_finished" in event_names

    tool_results = result["tool_results"]
    assert len(tool_results) == 1
    assert tool_results[0]["name"] == "ops_command_executor"
    assert "opsCommandSession" in tool_results[0]
