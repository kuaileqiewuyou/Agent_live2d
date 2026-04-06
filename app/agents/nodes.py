from __future__ import annotations

from typing import Any

from app.agents.prompt_builder import build_companion_prompt
from app.mcp import MCPClientManager
from app.skills import SkillRegistry, SkillRuntimeEngine

_MCP_CLIENT = MCPClientManager()
_SKILL_REGISTRY = SkillRegistry()
_SKILL_RUNTIME = SkillRuntimeEngine(_SKILL_REGISTRY)
_TOOL_KEYWORDS = ("tool", "mcp", "search", "工具", "检索", "搜索")


def _manual_request_input_text(request: dict[str, Any], user_input: str) -> str:
    input_text = request.get("input_text")
    if isinstance(input_text, str) and input_text.strip():
        return input_text.strip()

    input_params = request.get("input_params")
    if isinstance(input_params, dict):
        lines: list[str] = []
        ordered_fields = ("goal", "scope", "output", "notes")
        used_keys: set[str] = set()
        for key in ordered_fields:
            value = input_params.get(key)
            if isinstance(value, str) and value.strip():
                lines.append(f"{key}: {value.strip()}")
                used_keys.add(key)
        for key, value in sorted(input_params.items()):
            if key in used_keys:
                continue
            if isinstance(value, str) and value.strip():
                lines.append(f"{key}: {value.strip()}")
        if lines:
            return "\n".join(lines)

    return user_input


async def planner_agent(state: dict[str, Any]) -> dict[str, Any]:
    user_input = str(state.get("user_input", ""))
    manual_tool_requests = state.get("manual_tool_requests", [])
    normalized = user_input.lower()
    needs_tools = bool(manual_tool_requests) or any(keyword in normalized for keyword in _TOOL_KEYWORDS)
    return {
        "planner_output": {
            "needs_tools": needs_tools,
            "needs_memory_write": len(user_input) > 12,
            "route": "tool" if needs_tools else "companion",
            "manualToolRequestCount": len(manual_tool_requests),
        },
        "stream_events": [
            {
                "event": "thinking",
                "data": {
                    "stage": "planner",
                    "needsTools": needs_tools,
                    "message": "Analyzing request and planning execution...",
                },
            },
        ],
    }


async def _build_manual_skill_result(
    request: dict[str, Any],
    skill: dict[str, Any] | None,
    user_input: str,
    state: dict[str, Any],
) -> dict[str, Any]:
    label = request.get("label") or (skill.get("name") if skill else request.get("target_id", "skill"))
    input_text = _manual_request_input_text(request, user_input)
    if skill:
        context = {
            "conversation_id": state.get("conversation_id"),
            "persona_name": (state.get("persona") or {}).get("name"),
            "manual_request": request,
            "input_params": request.get("input_params", {}),
            "skill": skill,
        }

        try:
            runtime_result = await _SKILL_RUNTIME.execute(
                skill=skill,
                user_input=user_input,
                context=context,
            )
        except Exception as exc:
            return {
                "type": "skill",
                "name": skill["name"],
                "label": label,
                "title": f"Skill: {label}",
                "summary": f"Manual Skill `{label}` real execution failed.",
                "result": f"Skill execution failed: {exc}",
                "manual": True,
                "inputText": input_text,
                "inputParams": request.get("input_params", {}),
                "executionMode": "real",
                "error": True,
            }

        if runtime_result.get("ok"):
            runtime_source = str(runtime_result.get("source") or "runtime").strip()
            runtime_type = str(runtime_result.get("runtime_type") or "workflow").strip()
            summary_suffix = f" (runtime={runtime_type}, source={runtime_source})"
            return {
                "type": "skill",
                "name": skill["name"],
                "label": label,
                "title": f"Skill: {label}",
                "summary": f"Manual Skill `{label}` real execution succeeded.{summary_suffix}",
                "result": str(runtime_result.get("summary_text") or ""),
                "manual": True,
                "inputText": input_text,
                "inputParams": request.get("input_params", {}),
                "executionMode": str(runtime_result.get("execution_mode") or "real"),
            }

        return {
            "type": "skill",
            "name": skill["name"],
            "label": label,
            "title": f"Skill: {label}",
            "summary": f"Manual Skill `{label}` real execution failed.",
            "result": str(runtime_result.get("error") or "skill runtime error"),
            "manual": True,
            "inputText": input_text,
            "inputParams": request.get("input_params", {}),
            "executionMode": str(runtime_result.get("execution_mode") or "real"),
            "error": True,
        }

    return {
        "type": "skill",
        "name": label,
        "label": label,
        "title": f"Skill: {label}",
        "summary": f"Skill `{label}` is not enabled in current conversation.",
        "result": f"Skill `{label}` not available.",
        "manual": True,
        "executionMode": "placeholder",
        "error": True,
    }


def _normalize_manual_mcp_params(request: dict[str, Any]) -> dict[str, Any]:
    raw_params = request.get("input_params")
    if not isinstance(raw_params, dict):
        return {}
    normalized: dict[str, Any] = {}
    for key, value in raw_params.items():
        if isinstance(key, str) and key.strip():
            normalized[key.strip()] = value
    return normalized


def _resolve_manual_mcp_tool_name(request: dict[str, Any], server: dict[str, Any] | None, params: dict[str, Any]) -> str:
    direct_name = request.get("tool_name")
    if isinstance(direct_name, str) and direct_name.strip():
        return direct_name.strip()

    for key in ("tool", "toolName", "name"):
        value = params.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    if isinstance(server, dict):
        capabilities = server.get("capabilities")
        if isinstance(capabilities, dict):
            tools = capabilities.get("tools")
            if isinstance(tools, list) and len(tools) == 1 and isinstance(tools[0], dict):
                name = tools[0].get("name")
                if isinstance(name, str) and name.strip():
                    return name.strip()

    return ""


def _resolve_manual_mcp_config(server: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(server, dict):
        return None
    direct_config = server.get("advanced_config") or server.get("advancedConfig") or server.get("config")
    if isinstance(direct_config, dict):
        return direct_config
    capabilities = server.get("capabilities")
    if isinstance(capabilities, dict):
        nested = capabilities.get("config")
        if isinstance(nested, dict):
            return nested
    return None


async def _build_manual_mcp_result(request: dict[str, Any], server: dict[str, Any] | None, user_input: str) -> dict[str, Any]:
    label = request.get("label") or (server.get("name") if server else request.get("target_id", "mcp"))
    input_text = _manual_request_input_text(request, user_input)
    if server:
        transport_type = str(server.get("transport_type") or server.get("transportType") or "http").strip()
        endpoint = str(server.get("endpoint_or_command") or server.get("endpointOrCommand") or "").strip()
        status = str(server.get("status") or "").strip().lower()
        params = _normalize_manual_mcp_params(request)
        tool_name = _resolve_manual_mcp_tool_name(request, server, params)
        server_config = _resolve_manual_mcp_config(server)
        arguments = {k: v for k, v in params.items() if k not in {"tool", "toolName", "name"}}

        if transport_type == "http" and endpoint and status == "connected":
            call_result = await _MCP_CLIENT.call_tool(
                transport_type=transport_type,
                endpoint_or_command=endpoint,
                tool_name=tool_name or None,
                arguments=arguments,
                config=server_config,
            )
            if call_result.get("ok"):
                summary_text = str(call_result.get("summary") or "").strip() or "tool call completed"
                return {
                    "type": "mcp",
                    "name": server["name"],
                    "label": label,
                    "title": f"MCP: {label}",
                    "summary": f"Manual MCP `{label}` real call succeeded. Input: {input_text}",
                    "result": summary_text,
                    "manual": True,
                    "inputText": input_text,
                    "inputParams": request.get("input_params", {}),
                    "toolName": call_result.get("tool_name"),
                    "executionMode": "real",
                }
            detail = str(call_result.get("detail") or "tool call failed").strip()
            return {
                "type": "mcp",
                "name": server["name"],
                "label": label,
                "title": f"MCP: {label}",
                "summary": f"Manual MCP `{label}` real call failed. Input: {input_text}",
                "result": f"MCP call failed: {detail}",
                "manual": True,
                "inputText": input_text,
                "inputParams": request.get("input_params", {}),
                "toolName": call_result.get("tool_name"),
                "executionMode": "real",
                "error": True,
            }

        return {
            "type": "mcp",
            "name": server["name"],
            "label": label,
            "title": f"MCP: {label}",
            "summary": (
                f"MCP `{label}` is configured but not ready for real call "
                f"(status={status or 'unknown'}, transport={transport_type}). Input: {input_text}"
            ),
            "result": f"MCP `{label}` cannot run real call with current configuration.",
            "manual": True,
            "inputText": input_text,
            "inputParams": request.get("input_params", {}),
            "executionMode": "placeholder",
        }

    return {
        "type": "mcp",
        "name": label,
        "label": label,
        "title": f"MCP: {label}",
        "summary": f"MCP `{label}` is not enabled in current conversation.",
        "result": f"MCP `{label}` not available.",
        "manual": True,
        "executionMode": "placeholder",
        "error": True,
    }


async def tool_agent(state: dict[str, Any]) -> dict[str, Any]:
    manual_requests = state.get("manual_tool_requests", [])
    enabled_skills = state.get("enabled_skills", [])
    enabled_mcp_servers = state.get("enabled_mcp_servers", [])
    manual_mode = bool(manual_requests)
    manual_count = len(manual_requests) if manual_mode else 0
    auto_count = 0 if manual_mode else len(enabled_skills) + len(enabled_mcp_servers)
    tool_results: list[dict[str, Any]] = []
    stream_events = [
        {
            "event": "tool_calling",
            "data": {
                "toolCount": manual_count or auto_count,
                "manual": manual_mode,
                "manualCount": manual_count,
                "autoCount": auto_count,
                "message": (
                    "Executing manually selected tools..."
                    if manual_mode
                    else "Executing available Skill and MCP tools..."
                ),
            },
        }
    ]

    if manual_requests:
        skill_map = {skill["id"]: skill for skill in enabled_skills}
        mcp_map = {server["id"]: server for server in enabled_mcp_servers}

        for request in manual_requests:
            if request.get("type") == "skill":
                result = await _build_manual_skill_result(
                    request,
                    skill_map.get(request.get("target_id")),
                    str(state.get("user_input", "")),
                    state,
                )
            else:
                result = await _build_manual_mcp_result(
                    request,
                    mcp_map.get(request.get("target_id")),
                    str(state.get("user_input", "")),
                )
            tool_results.append(result)
            stream_events.append({"event": "tool_result", "data": result})
    else:
        for skill in enabled_skills:
            result = {
                "type": "skill",
                "name": skill["name"],
                "label": skill["name"],
                "title": f"Skill: {skill['name']}",
                "summary": f"Skill `{skill['name']}` included in this turn.",
                "result": f"Skill `{skill['name']}` included in this turn.",
                "manual": False,
            }
            tool_results.append(result)
            stream_events.append({"event": "tool_result", "data": result})

        for server in enabled_mcp_servers:
            result = {
                "type": "mcp",
                "name": server["name"],
                "label": server["name"],
                "title": f"MCP: {server['name']}",
                "summary": f"MCP `{server['name']}` status: {server['status']}",
                "result": f"MCP `{server['name']}` status: {server['status']}",
                "manual": False,
            }
            tool_results.append(result)
            stream_events.append({"event": "tool_result", "data": result})

    return {
        "tool_results": tool_results,
        "stream_events": stream_events,
    }


async def companion_agent(state: dict[str, Any]) -> dict[str, Any]:
    prompt_messages = build_companion_prompt(
        persona=state["persona"],
        user_input=state["user_input"],
        recent_messages=state.get("recent_messages", []),
        summary_memory=state.get("summary_memory", []),
        long_term_memories=state.get("long_term_memories", []),
        tool_results=state.get("tool_results", []),
        manual_tool_requests=state.get("manual_tool_requests", []),
    )
    return {"prompt_messages": prompt_messages}


async def memory_agent(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "stream_events": [
            {
                "event": "memory_sync",
                "data": {
                    "requested": True,
                    "message": "Syncing conversation memory...",
                },
            }
        ]
    }

