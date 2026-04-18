from typing import Annotated, Any, TypedDict
import operator


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
    file_access_mode: str
    file_access_allow_all: bool
    file_access_folders: list[str]
    file_access_blacklist: list[str]
    manual_tool_requests: list[dict]
    planner_output: dict
    tool_results: list[dict]
    final_response: str
    prompt_messages: list[dict]
    stream_events: Annotated[list[dict[str, Any]], operator.add]
    stop_requested: bool
    response_mode: str
    ops_install_request: dict[str, Any]
    ops_command_request: dict[str, Any]
