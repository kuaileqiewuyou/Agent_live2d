from __future__ import annotations

import asyncio

from app.skills import SkillRegistry, SkillRuntimeEngine


def test_skill_runtime_engine_uses_registered_executor():
    engine = SkillRuntimeEngine(SkillRegistry())
    result = asyncio.run(
        engine.execute(
            skill={"name": "summary-helper", "runtime_type": "workflow"},
            user_input="summarize this text",
            context={"input_params": {"goal": "summary"}, "persona_name": "Tester"},
        )
    )

    assert result["ok"] is True
    assert result["source"] == "registry"
    assert result["execution_mode"] == "real"
    assert isinstance(result.get("summary_text"), str)
    assert result["summary_text"]


def test_skill_runtime_engine_uses_workflow_runtime_runner_when_unregistered():
    engine = SkillRuntimeEngine(SkillRegistry())
    result = asyncio.run(
        engine.execute(
            skill={"name": "external-skill", "runtime_type": "workflow"},
            user_input="run workflow",
            context={"input_params": {"goal": "execute", "scope": "conversation"}},
        )
    )

    assert result["ok"] is True
    assert result["source"] == "runtime_workflow"
    assert result["runtime_type"] == "workflow"
    assert "Workflow skill `external-skill` executed." in result["summary_text"]


def test_skill_runtime_engine_returns_error_for_unsupported_runtime():
    engine = SkillRuntimeEngine(SkillRegistry())
    result = asyncio.run(
        engine.execute(
            skill={"name": "external-skill", "runtime_type": "custom"},
            user_input="run runtime",
            context={"input_params": {}},
        )
    )

    assert result["ok"] is False
    assert result["execution_mode"] == "real"
    assert "unsupported skill runtime_type" in result["error"]
