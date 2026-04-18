from __future__ import annotations

import re
from typing import Any

from app.agents.prompt_builder import build_companion_prompt
from app.mcp import get_mcp_client_manager
from app.skills import SkillRegistry, SkillRuntimeEngine

_MCP_CLIENT = get_mcp_client_manager()
_SKILL_REGISTRY = SkillRegistry()
_SKILL_RUNTIME = SkillRuntimeEngine(_SKILL_REGISTRY)
_TOOL_KEYWORDS = ("tool", "mcp", "search", "工具", "检索", "搜索")
_OPS_PERSONA_NAMES = {"ops assistant", "运维助手"}
_URL_PATTERN = re.compile(r"https?://[^\s]+", re.IGNORECASE)
_OPS_COMMAND_LINE_PATTERN = re.compile(r"(?im)^\s*(?:cmd|command|命令)\s*[:：]\s*(.+)$")
_OPS_COMMAND_SLASH_PATTERN = re.compile(r"(?im)^\s*/cmd\s+(.+)$")
_OPS_COMMAND_NATURAL_PATTERNS = (
    re.compile(
        r"(?im)^\s*(?:请|帮我|麻烦|請|請幫我)?\s*(?:执行|運行|运行)(?:一下)?(?:这个)?(?:命令)?\s*(?:[:：]\s*|\s+)(.+)$"
    ),
    re.compile(r"(?im)^\s*(?:please\s+)?(?:run|execute)\s+(?:this\s+)?(?:command\s*)?(?::\s*|\s+)(.+)$"),
)
_OPS_COMMAND_BLOCK_PATTERN = re.compile(
    r"```(?:bash|sh|shell|powershell|pwsh|cmd)?\s*\n(.+?)```",
    re.IGNORECASE | re.DOTALL,
)
_OPS_COMMAND_CWD_PATTERN = re.compile(r"(?im)^\s*cwd\s*[:=]\s*(.+)$")
_OPS_COMMAND_POLITE_SUFFIX_PATTERN = re.compile(r"(?i)\s*(?:谢谢|謝謝|thanks|thank you|pls|please)\s*[.!。!！]*\s*$")
_OPS_COMMAND_EXECUTABLE_PATTERN = re.compile(r"^[A-Za-z0-9_.:/\\-]+$")
_OPS_PLAIN_COMMAND_PATTERN = re.compile(r"^[A-Za-z0-9_./:\\\-`\"'=:@%+,*?\[\]{}()|&<>!$^\s]+$")


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
    ops_install_request = _detect_ops_install_request(state, user_input)
    ops_command_request = _detect_ops_command_request(state, user_input)
    needs_tools = (
        bool(manual_tool_requests)
        or bool(ops_install_request)
        or bool(ops_command_request)
        or any(keyword in normalized for keyword in _TOOL_KEYWORDS)
    )
    return {
        "planner_output": {
            "needs_tools": needs_tools,
            "needs_memory_write": len(user_input) > 12,
            "route": "tool" if needs_tools else "companion",
            "manualToolRequestCount": len(manual_tool_requests),
            "opsInstallDetected": bool(ops_install_request),
            "opsCommandDetected": bool(ops_command_request),
        },
        **({"ops_install_request": ops_install_request} if ops_install_request else {}),
        **({"ops_command_request": ops_command_request} if ops_command_request else {}),
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


def _detect_ops_install_request(state: dict[str, Any], user_input: str) -> dict[str, Any] | None:
    persona_name = str((state.get("persona") or {}).get("name") or "").strip().lower()
    if persona_name not in _OPS_PERSONA_NAMES:
        return None
    match = _URL_PATTERN.search(user_input)
    if match is None:
        return None

    link = match.group(0).strip()
    if not link:
        return None

    normalized = user_input.lower()
    if "mcp" not in normalized and "github.com" not in link.lower():
        return None

    return {"link": link}


def _extract_ops_command(user_input: str) -> str | None:
    for pattern in (_OPS_COMMAND_LINE_PATTERN, _OPS_COMMAND_SLASH_PATTERN):
        match = pattern.search(user_input)
        if match is not None:
            candidate = match.group(1).strip()
            if candidate:
                return candidate

    for pattern in _OPS_COMMAND_NATURAL_PATTERNS:
        match = pattern.search(user_input)
        if match is None:
            continue
        candidate = _normalize_ops_command_candidate(match.group(1))
        if _looks_like_shell_command(candidate):
            return candidate

    block_match = _OPS_COMMAND_BLOCK_PATTERN.search(user_input)
    if block_match is not None:
        block = block_match.group(1).strip()
        if not block:
            return None
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if lines:
            return lines[0]

    # Fallback: support direct command input like "npm -v" in Ops Assistant chats.
    plain_candidate = _normalize_ops_command_candidate(user_input)
    if (
        plain_candidate
        and _OPS_PLAIN_COMMAND_PATTERN.fullmatch(plain_candidate) is not None
        and _looks_like_shell_command(plain_candidate)
    ):
        return plain_candidate

    return None


def _normalize_ops_command_candidate(raw_candidate: str) -> str:
    if not raw_candidate:
        return ""

    first_line = raw_candidate.strip().splitlines()[0].strip()
    normalized = re.split(r"[，。！？；]", first_line, maxsplit=1)[0].strip()
    normalized = normalized.strip("`").strip()
    normalized = _OPS_COMMAND_POLITE_SUFFIX_PATTERN.sub("", normalized).strip()
    return normalized


def _looks_like_shell_command(candidate: str) -> bool:
    if not candidate:
        return False
    parts = candidate.split()
    if not parts:
        return False
    executable = parts[0].strip().strip("'\"")
    if executable.lower().startswith(("http://", "https://")):
        return False
    return _OPS_COMMAND_EXECUTABLE_PATTERN.match(executable) is not None


def _detect_ops_command_request(state: dict[str, Any], user_input: str) -> dict[str, Any] | None:
    persona_name = str((state.get("persona") or {}).get("name") or "").strip().lower()
    if persona_name not in _OPS_PERSONA_NAMES:
        return None

    command = _extract_ops_command(user_input)
    if not command:
        return None

    request: dict[str, Any] = {"command": command}
    cwd_match = _OPS_COMMAND_CWD_PATTERN.search(user_input)
    if cwd_match is not None:
        cwd = cwd_match.group(1).strip()
        if cwd:
            request["cwd"] = cwd
    return request


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


async def _build_manual_mcp_result(
    request: dict[str, Any],
    server: dict[str, Any] | None,
    user_input: str,
    state: dict[str, Any],
) -> dict[str, Any]:
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
                file_access_allow_all=state.get("file_access_allow_all"),
                file_access_folders=state.get("file_access_folders"),
                file_access_blacklist=state.get("file_access_blacklist"),
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
                "code": call_result.get("code"),
                "details": call_result.get("details"),
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


async def _build_ops_install_preview(state: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    install_request = state.get("ops_install_request")
    if not isinstance(install_request, dict):
        raise RuntimeError("missing ops install request")

    link = str(install_request.get("link") or "").strip()
    if not link:
        raise RuntimeError("missing install link")

    from app.services.ops_mcp_installer import get_ops_mcp_installer_service

    installer = get_ops_mcp_installer_service()
    session = await installer.preview(
        link=link,
        conversation_id=str(state.get("conversation_id") or "").strip() or None,
    )
    payload = session.model_dump(by_alias=True)
    events: list[dict[str, Any]] = []

    for step in payload.get("steps", []):
        if step.get("id") not in {"parse_link", "probe_env"}:
            continue
        events.append(
            {
                "event": "ops_install_step_started",
                "data": {
                    "sessionId": payload.get("id"),
                    "step": step,
                },
            }
        )
        events.append(
            {
                "event": "ops_install_step_finished",
                "data": {
                    "sessionId": payload.get("id"),
                    "step": step,
                },
            }
        )

    events.append({"event": "ops_install_preview", "data": payload})
    events.append(
        {
            "event": "ops_install_finished",
            "data": {
                "sessionId": payload.get("id"),
                "status": payload.get("status"),
                "summary": payload.get("summary"),
            },
        }
    )

    result = {
        "type": "mcp",
        "name": "ops_mcp_installer",
        "label": "Ops MCP Installer",
        "title": "MCP: Ops Installer",
        "summary": "MCP install preview created. Confirm each step in the install card.",
        "result": f"preview ready: {payload.get('id')}",
        "manual": True,
        "executionMode": "real",
        "opsInstallSession": payload,
    }
    return result, events


async def _build_ops_command_preview(state: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    command_request = state.get("ops_command_request")
    if not isinstance(command_request, dict):
        raise RuntimeError("missing ops command request")

    command = str(command_request.get("command") or "").strip()
    if not command:
        raise RuntimeError("missing command")

    cwd_raw = command_request.get("cwd")
    cwd = str(cwd_raw).strip() if isinstance(cwd_raw, str) else None

    from app.services.ops_command_executor import get_ops_command_executor_service

    command_executor = get_ops_command_executor_service()
    session = await command_executor.preview(
        command=command,
        cwd=cwd,
        conversation_id=str(state.get("conversation_id") or "").strip() or None,
    )
    payload = session.model_dump(by_alias=True)
    events = [
        {"event": "ops_command_preview", "data": payload},
        {
            "event": "ops_command_finished",
            "data": {
                "sessionId": payload.get("id"),
                "status": payload.get("status"),
                "summary": payload.get("summary"),
            },
        },
    ]

    result = {
        "type": "mcp",
        "name": "ops_command_executor",
        "label": "Ops Command",
        "title": "Ops Command",
        "summary": "Command preview created. Confirm execution in the command card.",
        "result": f"preview ready: {payload.get('id')}",
        "manual": True,
        "executionMode": "real",
        "opsCommandSession": payload,
    }
    return result, events


async def tool_agent(state: dict[str, Any]) -> dict[str, Any]:
    manual_requests = state.get("manual_tool_requests", [])
    enabled_skills = state.get("enabled_skills", [])
    enabled_mcp_servers = state.get("enabled_mcp_servers", [])
    ops_install_request = state.get("ops_install_request")
    ops_command_request = state.get("ops_command_request")
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

    if isinstance(ops_install_request, dict):
        try:
            preview_result, preview_events = await _build_ops_install_preview(state)
            tool_results.append(preview_result)
            stream_events.extend(preview_events)
            stream_events.append({"event": "tool_result", "data": preview_result})
            return {
                "tool_results": tool_results,
                "stream_events": stream_events,
            }
        except Exception as exc:
            error_result = {
                "type": "mcp",
                "name": "ops_mcp_installer",
                "label": "Ops MCP Installer",
                "title": "MCP: Ops Installer",
                "summary": "MCP install preview failed.",
                "result": f"{exc}",
                "manual": True,
                "executionMode": "real",
                "error": True,
            }
            tool_results.append(error_result)
            stream_events.append({"event": "tool_result", "data": error_result})
            return {
                "tool_results": tool_results,
                "stream_events": stream_events,
            }

    if isinstance(ops_command_request, dict):
        try:
            preview_result, preview_events = await _build_ops_command_preview(state)
            tool_results.append(preview_result)
            stream_events.extend(preview_events)
            stream_events.append({"event": "tool_result", "data": preview_result})
            return {
                "tool_results": tool_results,
                "stream_events": stream_events,
            }
        except Exception as exc:
            error_result = {
                "type": "mcp",
                "name": "ops_command_executor",
                "label": "Ops Command",
                "title": "Ops Command",
                "summary": "Command preview failed.",
                "result": f"{exc}",
                "manual": True,
                "executionMode": "real",
                "error": True,
            }
            tool_results.append(error_result)
            stream_events.append({"event": "tool_result", "data": error_result})
            return {
                "tool_results": tool_results,
                "stream_events": stream_events,
            }

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
                    state,
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

