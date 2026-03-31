from __future__ import annotations


async def planner_agent(state):
    user_input = state["user_input"]
    needs_tools = any(keyword in user_input.lower() for keyword in ["工具", "tool", "mcp", "查询", "search"])
    return {
        "planner_output": {
            "needs_tools": needs_tools,
            "needs_memory_write": len(user_input) > 12,
            "route": "tool" if needs_tools else "companion",
        },
        "stream_events": [
            {"event": "thinking", "data": {"stage": "planner", "needsTools": needs_tools}}
        ],
    }


async def tool_agent(state):
    tool_results = []
    for skill in state.get("enabled_skills", []):
        tool_results.append(
            {
                "type": "skill",
                "name": skill["name"],
                "result": f"技能 {skill['name']} 已纳入回复参考。",
            }
        )
    for server in state.get("enabled_mcp_servers", []):
        tool_results.append(
            {
                "type": "mcp",
                "name": server["name"],
                "result": f"MCP 服务 {server['name']} 当前状态：{server['status']}",
            }
        )
    return {
        "tool_results": tool_results,
        "stream_events": [
            {
                "event": "tool_calling",
                "data": {"toolCount": len(tool_results)},
            }
        ],
    }


async def companion_agent(state):
    prompt_messages = build_companion_prompt(
        persona=state["persona"],
        user_input=state["user_input"],
        recent_messages=state.get("recent_messages", []),
        summary_memory=state.get("summary_memory", []),
        long_term_memories=state.get("long_term_memories", []),
        tool_results=state.get("tool_results", []),
    )
    return {"prompt_messages": prompt_messages}


async def memory_agent(state):
    return {
        "stream_events": [
            {
                "event": "memory_sync",
                "data": {"requested": True},
            }
        ]
    }
from app.agents.prompt_builder import build_companion_prompt
