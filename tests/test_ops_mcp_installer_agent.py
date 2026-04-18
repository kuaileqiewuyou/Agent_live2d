from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.agents.nodes import planner_agent, tool_agent
from app.schemas.ops import OpsMCPInstallSession, OpsMCPInstallStep, OpsMCPParsedConfig


@pytest.mark.asyncio
async def test_planner_agent_detects_ops_install_request_from_link():
    result = await planner_agent(
        {
            "user_input": "请帮我安装这个 mcp https://github.com/modelcontextprotocol/servers",
            "persona": {"name": "Ops Assistant"},
            "manual_tool_requests": [],
        }
    )
    assert result["planner_output"]["opsInstallDetected"] is True
    assert result["planner_output"]["needs_tools"] is True
    assert result["ops_install_request"]["link"].startswith("https://github.com/")


@pytest.mark.asyncio
async def test_tool_agent_emits_ops_install_preview_events(monkeypatch: pytest.MonkeyPatch):
    class _FakeInstaller:
        async def preview(self, *, link: str, conversation_id: str | None = None):
            assert link == "https://example.com/mcp"
            assert conversation_id == "conversation-1"
            now = datetime.now(timezone.utc)
            return OpsMCPInstallSession(
                id="session-1",
                link=link,
                conversation_id=conversation_id,
                status="previewed",
                summary="ready",
                parsed_config=OpsMCPParsedConfig(
                    source_type="url",
                    name="example",
                    description="from url",
                    transport_type="http",
                    endpoint_or_command=link,
                    advanced_config={},
                    raw={"link": link},
                ),
                env_report=[],
                steps=[
                    OpsMCPInstallStep(
                        id="parse_link",
                        name="parse_link",
                        title="解析链接",
                        status="passed",
                        requires_confirm=False,
                        detail="ok",
                    ),
                    OpsMCPInstallStep(
                        id="probe_env",
                        name="probe_env",
                        title="检测环境",
                        status="passed",
                        requires_confirm=False,
                        detail="ok",
                    ),
                    OpsMCPInstallStep(
                        id="create_or_update_server",
                        name="create_or_update_server",
                        title="创建",
                        status="pending",
                        requires_confirm=True,
                        detail="waiting",
                    ),
                ],
                created_at=now,
                updated_at=now,
            )

    monkeypatch.setattr(
        "app.services.ops_mcp_installer.get_ops_mcp_installer_service",
        lambda: _FakeInstaller(),
    )

    result = await tool_agent(
        {
            "conversation_id": "conversation-1",
            "user_input": "install mcp https://example.com/mcp",
            "persona": {"name": "Ops Assistant"},
            "ops_install_request": {"link": "https://example.com/mcp"},
            "manual_tool_requests": [],
            "enabled_skills": [],
            "enabled_mcp_servers": [],
        }
    )

    events = result["stream_events"]
    event_names = [item["event"] for item in events]
    assert "ops_install_preview" in event_names
    assert "ops_install_step_started" in event_names
    assert "ops_install_step_finished" in event_names
    assert "ops_install_finished" in event_names

    tool_results = result["tool_results"]
    assert len(tool_results) == 1
    assert tool_results[0]["name"] == "ops_mcp_installer"
    assert "opsInstallSession" in tool_results[0]

