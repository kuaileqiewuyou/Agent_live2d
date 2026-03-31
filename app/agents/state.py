from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    conversation_id: str
    user_input: str
    persona: dict
    model_config: dict
    recent_messages: list[dict]
    summary_memory: list[dict]
    long_term_memories: list[dict]
    enabled_skills: list[dict]
    enabled_mcp_servers: list[dict]
    planner_output: dict
    tool_results: list[dict]
    final_response: str
    prompt_messages: list[dict]
    stream_events: list[dict[str, Any]]
    stop_requested: bool
    response_mode: str

