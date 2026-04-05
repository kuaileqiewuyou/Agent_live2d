from __future__ import annotations

from app.agents.prompt_builder import build_companion_prompt


def _manual_request_input_text(request: dict, user_input: str) -> str:
    input_text = request.get("input_text")
    if input_text:
        return input_text

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


async def planner_agent(state):
    user_input = state["user_input"]
    manual_tool_requests = state.get("manual_tool_requests", [])
    needs_tools = bool(manual_tool_requests) or any(
        keyword in user_input.lower()
        for keyword in ["tool", "mcp", "search", "工具", "检索", "搜索"]
    )
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
                    "message": "正在分析你的请求并规划执行路径...",
                },
            },
        ],
    }


def _build_manual_skill_result(request: dict, skill: dict | None, user_input: str) -> dict:
    label = request.get("label") or (skill["name"] if skill else request["target_id"])
    input_text = _manual_request_input_text(request, user_input)
    if skill:
        return {
            "type": "skill",
            "name": skill["name"],
            "label": label,
            "title": f"Skill: {label}",
            "summary": f"用户手动触发了 Skill「{label}」。输入：{input_text}",
            "result": f"Skill「{label}」已执行完成，请结合用户请求给出综合回答。",
            "manual": True,
            "inputText": input_text,
            "inputParams": request.get("input_params", {}),
        }

    return {
        "type": "skill",
        "name": label,
        "label": label,
        "title": f"Skill: {label}",
        "summary": f"当前会话不可用 Skill「{label}」。",
        "result": f"Skill「{label}」未在当前会话启用。",
        "manual": True,
        "error": True,
    }


def _build_manual_mcp_result(request: dict, server: dict | None, user_input: str) -> dict:
    label = request.get("label") or (server["name"] if server else request["target_id"])
    input_text = _manual_request_input_text(request, user_input)
    if server:
        return {
            "type": "mcp",
            "name": server["name"],
            "label": label,
            "title": f"MCP: {label}",
            "summary": f"用户手动触发了 MCP 服务「{label}」（状态：{server['status']}）。输入：{input_text}",
            "result": f"MCP 服务「{label}」已返回结果，请结合用户请求给出综合回答。",
            "manual": True,
            "inputText": input_text,
            "inputParams": request.get("input_params", {}),
        }

    return {
        "type": "mcp",
        "name": label,
        "label": label,
        "title": f"MCP: {label}",
        "summary": f"当前会话不可用 MCP 服务「{label}」。",
        "result": f"MCP 服务「{label}」未在当前会话启用。",
        "manual": True,
        "error": True,
    }


async def tool_agent(state):
    manual_requests = state.get("manual_tool_requests", [])
    enabled_skills = state.get("enabled_skills", [])
    enabled_mcp_servers = state.get("enabled_mcp_servers", [])
    manual_mode = bool(manual_requests)
    manual_count = len(manual_requests) if manual_mode else 0
    auto_count = 0 if manual_mode else len(enabled_skills) + len(enabled_mcp_servers)
    tool_results = []
    stream_events = [
        {
            "event": "tool_calling",
            "data": {
                "toolCount": manual_count or auto_count,
                "manual": manual_mode,
                "manualCount": manual_count,
                "autoCount": auto_count,
                "message": (
                    "正在执行你手动指定的工具..."
                    if manual_mode
                    else "正在自动执行当前可用的 Skill 和 MCP 服务..."
                ),
            },
        }
    ]

    if manual_requests:
        skill_map = {skill["id"]: skill for skill in enabled_skills}
        mcp_map = {server["id"]: server for server in enabled_mcp_servers}

        for request in manual_requests:
            if request["type"] == "skill":
                result = _build_manual_skill_result(
                    request,
                    skill_map.get(request["target_id"]),
                    state["user_input"],
                )
            else:
                result = _build_manual_mcp_result(
                    request,
                    mcp_map.get(request["target_id"]),
                    state["user_input"],
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
                "summary": f"本轮已纳入 Skill「{skill['name']}」。",
                "result": f"本轮已纳入 Skill「{skill['name']}」。",
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
                "summary": f"MCP 服务「{server['name']}」当前状态：{server['status']}",
                "result": f"MCP 服务「{server['name']}」当前状态：{server['status']}",
                "manual": False,
            }
            tool_results.append(result)
            stream_events.append({"event": "tool_result", "data": result})

    return {
        "tool_results": tool_results,
        "stream_events": stream_events,
    }


async def companion_agent(state):
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


async def memory_agent(state):
    return {
        "stream_events": [
            {
                "event": "memory_sync",
                "data": {
                    "requested": True,
                    "message": "正在同步会话记忆...",
                },
            }
        ]
    }
