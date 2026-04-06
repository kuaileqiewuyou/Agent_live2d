from __future__ import annotations

import json
from typing import Any

from app.skills.registry import SkillRegistry


class SkillRuntimeEngine:
    """Unified skill runtime dispatcher for manual tool execution."""

    def __init__(self, registry: SkillRegistry | None = None) -> None:
        self._registry = registry or SkillRegistry()

    @staticmethod
    def _normalize_runtime_type(skill: dict[str, Any]) -> str:
        value = skill.get("runtime_type") or skill.get("runtimeType") or "workflow"
        normalized = str(value).strip().lower()
        return normalized or "workflow"

    def _resolve_executor(self, skill_name: str):
        normalized = skill_name.strip()
        if not normalized:
            return None

        candidates = [
            normalized,
            normalized.lower(),
            normalized.lower().replace(" ", "-"),
            normalized.lower().replace("_", "-"),
        ]
        alias_map = {
            "summary skill": "summary-helper",
            "summary": "summary-helper",
            "persona style": "persona-style",
            "persona": "persona-style",
        }
        alias = alias_map.get(normalized.lower())
        if alias:
            candidates.append(alias)
        if "summary" in normalized.lower():
            candidates.append("summary-helper")
        if "persona" in normalized.lower() or "style" in normalized.lower():
            candidates.append("persona-style")

        for candidate in candidates:
            executor = self._registry.get(candidate)
            if executor is not None:
                return executor
        return None

    @staticmethod
    def _summarize_skill_output(output: Any) -> str:
        if isinstance(output, dict):
            for key in ("summary_hint", "prompt_fragment", "result", "message", "text"):
                value = output.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            return json.dumps(output, ensure_ascii=False)
        if isinstance(output, list):
            return json.dumps(output, ensure_ascii=False)
        return str(output)

    @staticmethod
    def _execute_workflow_runner(
        *,
        skill: dict[str, Any],
        user_input: str,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        input_params = context.get("input_params", {})
        if not isinstance(input_params, dict):
            input_params = {}

        goal = str(input_params.get("goal") or "").strip()
        scope = str(input_params.get("scope") or "").strip()
        output_format = str(input_params.get("output") or "").strip()

        summary_parts = [f"Workflow skill `{skill.get('name', 'skill')}` executed."]
        if goal:
            summary_parts.append(f"goal={goal}")
        if scope:
            summary_parts.append(f"scope={scope}")
        if output_format:
            summary_parts.append(f"output={output_format}")

        return {
            "skill": skill.get("name"),
            "runtime_type": "workflow",
            "summary_hint": " | ".join(summary_parts),
            "input_echo": user_input[:200],
            "input_params": input_params,
            "context_keys": sorted(context.keys()),
        }

    async def execute(
        self,
        *,
        skill: dict[str, Any],
        user_input: str,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        skill_name = str(skill.get("name") or "").strip()
        runtime_type = self._normalize_runtime_type(skill)
        executor = self._resolve_executor(skill_name)

        if executor is not None:
            output = await executor.execute(
                user_input=user_input,
                context=context,
            )
            return {
                "ok": True,
                "execution_mode": "real",
                "runtime_type": runtime_type,
                "source": "registry",
                "output": output,
                "summary_text": self._summarize_skill_output(output),
            }

        if runtime_type == "workflow":
            output = self._execute_workflow_runner(
                skill=skill,
                user_input=user_input,
                context=context,
            )
            return {
                "ok": True,
                "execution_mode": "real",
                "runtime_type": runtime_type,
                "source": "runtime_workflow",
                "output": output,
                "summary_text": self._summarize_skill_output(output),
            }

        return {
            "ok": False,
            "execution_mode": "real",
            "runtime_type": runtime_type,
            "source": "runtime",
            "error": f"unsupported skill runtime_type: {runtime_type}",
        }
