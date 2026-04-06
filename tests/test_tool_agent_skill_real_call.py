from __future__ import annotations

import asyncio

from app.agents.nodes import tool_agent


def test_tool_agent_manual_skill_real_execution_with_registered_executor():
    state = {
        "conversation_id": "conv-skill-real-1",
        "user_input": "summarize this long message",
        "persona": {"name": "Tester"},
        "manual_tool_requests": [
            {
                "id": "manual-skill-1",
                "type": "skill",
                "target_id": "skill-1",
                "label": "Summary Helper",
                "input_params": {"goal": "summary"},
            }
        ],
        "enabled_skills": [
            {
                "id": "skill-1",
                "name": "summary-helper",
                "description": "builtin summary skill",
            }
        ],
        "enabled_mcp_servers": [],
    }

    result = asyncio.run(tool_agent(state))
    tool_result = result["tool_results"][0]
    assert tool_result["type"] == "skill"
    assert tool_result["manual"] is True
    assert tool_result["executionMode"] == "real"
    assert tool_result.get("error") is None
    assert tool_result["summary"].startswith("Manual Skill")
    assert tool_result["result"]


def test_tool_agent_manual_skill_real_execution_with_workflow_runtime_runner():
    state = {
        "conversation_id": "conv-skill-real-2",
        "user_input": "run external workflow",
        "persona": {"name": "Tester"},
        "manual_tool_requests": [
            {
                "id": "manual-skill-2",
                "type": "skill",
                "target_id": "skill-2",
                "label": "External Skill",
                "input_params": {"goal": "execute"},
            }
        ],
        "enabled_skills": [
            {
                "id": "skill-2",
                "name": "external-skill",
                "description": "not registered in builtin registry",
                "runtime_type": "workflow",
            }
        ],
        "enabled_mcp_servers": [],
    }

    result = asyncio.run(tool_agent(state))
    tool_result = result["tool_results"][0]
    assert tool_result["type"] == "skill"
    assert tool_result["manual"] is True
    assert tool_result["executionMode"] == "real"
    assert tool_result.get("error") is None
    assert "runtime=workflow" in tool_result["summary"]
    assert "external-skill" in tool_result["result"]


def test_tool_agent_manual_skill_unsupported_runtime_type_returns_error():
    state = {
        "conversation_id": "conv-skill-real-3",
        "user_input": "run external runtime",
        "persona": {"name": "Tester"},
        "manual_tool_requests": [
            {
                "id": "manual-skill-3",
                "type": "skill",
                "target_id": "skill-3",
                "label": "Unsupported Runtime Skill",
                "input_params": {"goal": "execute"},
            }
        ],
        "enabled_skills": [
            {
                "id": "skill-3",
                "name": "unsupported-skill",
                "description": "not registered in builtin registry",
                "runtime_type": "custom",
            }
        ],
        "enabled_mcp_servers": [],
    }

    result = asyncio.run(tool_agent(state))
    tool_result = result["tool_results"][0]
    assert tool_result["type"] == "skill"
    assert tool_result["manual"] is True
    assert tool_result["executionMode"] == "real"
    assert tool_result["error"] is True
    assert "unsupported skill runtime_type" in tool_result["result"]
