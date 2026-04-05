from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from collections.abc import AsyncIterator
from http import HTTPStatus
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import AgentOrchestrator
from app.core.errors import AppError
from app.db.models import Message
from app.providers import ProviderFactory
from app.repositories import (
    ConversationRepository,
    LongTermMemoryRepository,
    MemorySummaryRepository,
    MessageRepository,
)
from app.schemas.message import StreamEvent
from app.services.memory import MemoryApplicationService

logger = logging.getLogger(__name__)

_LIVE2D_STATE_BY_EVENT = {
    "message_created": "thinking",
    "thinking": "thinking",
    "tool_calling": "thinking",
    "tool_result": "thinking",
    "memory_sync": "thinking",
    "token": "talking",
    "final_answer": "idle",
    "stopped": "idle",
}


class GenerationCoordinator:
    def __init__(self) -> None:
        self._events: dict[str, asyncio.Event] = {}
        self._request_turns: dict[tuple[str, str], asyncio.Event] = {}
        self._active_stream_counts: dict[str, int] = {}
        self._pending_stop_requests: set[str] = set()
        self._request_turn_lock = asyncio.Lock()

    def new(self, conversation_id: str) -> asyncio.Event:
        event = asyncio.Event()
        self._events[conversation_id] = event
        if conversation_id in self._pending_stop_requests:
            self._pending_stop_requests.discard(conversation_id)
            event.set()
        return event

    def stop(self, conversation_id: str) -> None:
        event = self._events.get(conversation_id)
        if event:
            event.set()
            return
        if self._active_stream_counts.get(conversation_id, 0) > 0:
            self._pending_stop_requests.add(conversation_id)

    def clear(self, conversation_id: str) -> None:
        self._events.pop(conversation_id, None)

    def begin_stream(self, conversation_id: str) -> None:
        current = self._active_stream_counts.get(conversation_id, 0)
        self._active_stream_counts[conversation_id] = current + 1

    def end_stream(self, conversation_id: str) -> None:
        current = self._active_stream_counts.get(conversation_id, 0)
        if current <= 1:
            self._active_stream_counts.pop(conversation_id, None)
            self._pending_stop_requests.discard(conversation_id)
        else:
            self._active_stream_counts[conversation_id] = current - 1
        self.clear(conversation_id)

    async def acquire_request_turn(self, conversation_id: str, request_id: str) -> RequestTurnLease:
        key = (conversation_id, request_id)
        async with self._request_turn_lock:
            event = self._request_turns.get(key)
            if event is None:
                event = asyncio.Event()
                self._request_turns[key] = event
                return RequestTurnLease(
                    conversation_id=conversation_id,
                    request_id=request_id,
                    event=event,
                    owner=True,
                )
            return RequestTurnLease(
                conversation_id=conversation_id,
                request_id=request_id,
                event=event,
                owner=False,
            )

    async def wait_for_request_turn(self, lease: RequestTurnLease, timeout_seconds: float) -> None:
        await asyncio.wait_for(lease.event.wait(), timeout=max(0.0, timeout_seconds))

    async def release_request_turn(self, lease: RequestTurnLease) -> None:
        key = (lease.conversation_id, lease.request_id)
        async with self._request_turn_lock:
            event = self._request_turns.pop(key, None)
        if event is not None:
            event.set()


@dataclass(slots=True)
class RequestTurnLease:
    conversation_id: str
    request_id: str
    event: asyncio.Event
    owner: bool


generation_coordinator = GenerationCoordinator()


def _normalize_tool_label(item: dict) -> str:
    raw = item.get("label") or item.get("name") or item.get("title") or "Tool"
    normalized = str(raw).strip()
    for prefix in ("Skill: ", "MCP: ", "技能: ", "技能："):
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix) :].strip()
    return normalized or "Tool"


def _normalize_manual_tool_request(item: dict) -> dict:
    input_params = item.get("input_params") or item.get("inputParams") or {}
    return {
        "id": item.get("id"),
        "type": item.get("type"),
        "targetId": item.get("target_id") or item.get("targetId"),
        "label": item.get("label"),
        "inputText": item.get("input_text") or item.get("inputText"),
        "inputParams": input_params if isinstance(input_params, dict) else {},
        "autoExecute": item.get("auto_execute") if "auto_execute" in item else item.get("autoExecute", False),
    }


def _normalize_manual_tool_requests(items: list[dict]) -> list[dict]:
    return [_normalize_manual_tool_request(item) for item in items]


def _build_tool_usage(tool_results: list[dict]) -> dict:
    manual = [item for item in tool_results if item.get("manual")]
    automatic = [item for item in tool_results if not item.get("manual")]
    return {
        "manualCount": len(manual),
        "automaticCount": len(automatic),
        "totalCount": len(tool_results),
        "manualTools": [_normalize_tool_label(item) for item in manual],
        "automaticTools": [_normalize_tool_label(item) for item in automatic],
    }


def _build_assistant_metadata(*, planner_output: dict, tool_results: list[dict], manual_tool_requests: list[dict]) -> dict:
    return {
        "plannerOutput": planner_output,
        "toolResults": tool_results,
        "toolUsage": _build_tool_usage(tool_results),
        "manualToolRequests": _normalize_manual_tool_requests(manual_tool_requests),
    }


def _extract_request_id(payload: dict) -> str | None:
    metadata = payload.get("metadata", {})
    if not isinstance(metadata, dict):
        return None
    value = metadata.get("requestId") or metadata.get("request_id")
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _attach_request_id(metadata: dict, request_id: str | None) -> dict:
    normalized = metadata if isinstance(metadata, dict) else {}
    if not request_id:
        return normalized
    if "requestId" in normalized or "request_id" in normalized:
        return normalized
    return {**normalized, "requestId": request_id}


def _message_request_id(message) -> str | None:
    metadata = getattr(message, "metadata_", {}) or {}
    if not isinstance(metadata, dict):
        return None
    value = metadata.get("requestId") or metadata.get("request_id")
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _normalize_content(text: str | None) -> str:
    return (text or "").strip()


def _parse_tool_input_text(input_text: str | None) -> dict[str, str]:
    if not input_text or not isinstance(input_text, str):
        return {}

    parsed: dict[str, str] = {}
    for raw_line in input_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        key: str | None = None
        value: str | None = None
        if ":" in line:
            key, value = line.split(":", 1)
        elif "：" in line:
            key, value = line.split("：", 1)

        if key is None or value is None:
            continue
        normalized_key = key.strip()
        normalized_value = value.strip()
        if normalized_key and normalized_value:
            parsed[normalized_key] = normalized_value
    return parsed

def _normalize_tool_input_params(input_params: Any) -> dict[str, str]:
    if not isinstance(input_params, dict):
        return {}

    normalized: dict[str, str] = {}
    for raw_key, raw_value in input_params.items():
        key = str(raw_key).strip()
        if not key:
            continue

        if isinstance(raw_value, str):
            value = raw_value.strip()
        elif isinstance(raw_value, (int, float, bool)):
            value = str(raw_value).strip()
        else:
            continue

        if value:
            normalized[key] = value
    return normalized


def _resolve_manual_request_params(request: dict[str, Any]) -> dict[str, str]:
    combined = _parse_tool_input_text(request.get("input_text"))
    combined.update(_normalize_tool_input_params(request.get("input_params")))
    return combined


def _resolve_schema_field_type(field_schema: dict[str, Any]) -> str:
    enum_values = field_schema.get("enum")
    if isinstance(enum_values, list) and len(enum_values) > 0:
        return "enum"

    raw_type = field_schema.get("type")
    if isinstance(raw_type, list):
        lowered = [str(item).lower() for item in raw_type]
    elif isinstance(raw_type, str):
        lowered = [raw_type.lower()]
    else:
        lowered = []

    if "number" in lowered or "integer" in lowered:
        return "number"
    if "boolean" in lowered:
        return "boolean"
    return "string"


def _validate_manual_request_against_skill_schema(skill, request: dict[str, Any], request_index: int) -> None:
    schema = skill.config_schema if isinstance(skill.config_schema, dict) else {}
    properties_raw = schema.get("properties")
    properties = properties_raw if isinstance(properties_raw, dict) else {}

    required_raw = schema.get("required")
    required_fields = [
        str(item).strip()
        for item in required_raw
        if isinstance(item, str) and str(item).strip()
    ] if isinstance(required_raw, list) else []

    if not properties and not required_fields:
        return

    params = _resolve_manual_request_params(request)
    errors: list[str] = []
    issues: list[dict[str, Any]] = []

    def append_issue(field: str, reason: str, issue_type: str, expected: Any = None) -> None:
        issue: dict[str, Any] = {
            "path": f"manualToolRequests[{request_index}].inputParams.{field}",
            "field": field,
            "reason": reason,
            "type": issue_type,
        }
        if expected is not None:
            issue["expected"] = expected
        issues.append(issue)

    for field in required_fields:
        value = params.get(field, "").strip()
        if not value:
            reason = f"{field} is required"
            errors.append(reason)
            append_issue(field, reason, "required")

    for field, raw_schema in properties.items():
        if not isinstance(raw_schema, dict):
            continue
        value = params.get(field, "").strip()
        if not value:
            continue

        field_type = _resolve_schema_field_type(raw_schema)
        if field_type == "number":
            try:
                float(value)
            except ValueError:
                reason = f"{field} should be a number"
                errors.append(reason)
                append_issue(field, reason, "type", "number")
            continue

        if field_type == "boolean":
            if value.lower() not in {"true", "false"}:
                reason = f"{field} should be true/false"
                errors.append(reason)
                append_issue(field, reason, "type", "boolean")
            continue

        if field_type == "enum":
            options = [
                str(item)
                for item in raw_schema.get("enum", [])
                if isinstance(item, (str, int, float, bool))
            ]
            if options and value not in options:
                reason = f"{field} should be one of {', '.join(options)}"
                errors.append(reason)
                append_issue(field, reason, "enum", options)

    if errors:
        raise AppError(
            f"manualToolRequests[{request_index}] invalid params: {'; '.join(errors)}",
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            code="validation_error",
            details={
                "source": "manual_tool_requests",
                "issues": issues,
            },
        )


def _message_timestamp(message: Message) -> float:
    created_at = getattr(message, "created_at", None)
    if created_at is None:
        return 0.0
    try:
        return float(created_at.timestamp())
    except Exception:  # pragma: no cover - defensive fallback
        return 0.0


def _to_provider_error(error: Exception) -> AppError:
    detail = str(error).strip() or "provider call failed"
    return AppError(
        f"provider call failed: {detail}",
        status_code=HTTPStatus.BAD_GATEWAY,
        code="provider_error",
    )


def _build_stream_event(event: str, data: dict[str, Any]) -> dict[str, Any]:
    payload = dict(data) if isinstance(data, dict) else {}
    live2d_state = _LIVE2D_STATE_BY_EVENT.get(event)
    if live2d_state and "live2dState" not in payload:
        payload["live2dState"] = live2d_state
    return StreamEvent(event=event, data=payload).model_dump(by_alias=True)


def _build_user_assistant_turns(messages: list[Message]) -> list[tuple[Message, Message | None]]:
    turns: list[tuple[Message, Message | None]] = []
    current_user: Message | None = None
    current_assistant: Message | None = None

    for message in messages:
        if message.role == "user":
            if current_user is not None:
                turns.append((current_user, current_assistant))
            current_user = message
            current_assistant = None
            continue
        if message.role == "assistant" and current_user is not None and current_assistant is None:
            current_assistant = message

    if current_user is not None:
        turns.append((current_user, current_assistant))
    return turns


def _collect_request_id_duplicate_ids(messages: list[Message]) -> set[str]:
    groups: dict[str, list[Message]] = {}
    for message in messages:
        request_id = _message_request_id(message)
        if not request_id:
            continue
        groups.setdefault(request_id, []).append(message)

    delete_ids: set[str] = set()
    for group_messages in groups.values():
        if len(group_messages) <= 2:
            continue

        sorted_messages = sorted(group_messages, key=_message_timestamp)
        kept_role: set[str] = set()
        for message in sorted_messages:
            role = message.role
            if role not in ("user", "assistant"):
                delete_ids.add(message.id)
                continue
            if role in kept_role:
                delete_ids.add(message.id)
                continue
            kept_role.add(role)

    return delete_ids


def _collect_adjacent_duplicate_turn_ids(
    messages: list[Message],
    already_marked: set[str],
    *,
    max_interval_seconds: float = 120.0,
) -> tuple[set[str], int]:
    filtered = [message for message in messages if message.id not in already_marked]
    turns = _build_user_assistant_turns(filtered)
    if len(turns) <= 1:
        return set(), 0

    delete_ids: set[str] = set()
    deleted_turn_count = 0
    previous_user, previous_assistant = turns[0]
    for current_user, current_assistant in turns[1:]:
        if previous_assistant is None or current_assistant is None:
            previous_user, previous_assistant = current_user, current_assistant
            continue

        if _message_request_id(previous_user) or _message_request_id(current_user):
            previous_user, previous_assistant = current_user, current_assistant
            continue

        is_same_user_content = _normalize_content(previous_user.content) == _normalize_content(current_user.content)
        is_same_assistant_content = _normalize_content(previous_assistant.content) == _normalize_content(current_assistant.content)
        interval_seconds = _message_timestamp(current_user) - _message_timestamp(previous_user)

        if (
            is_same_user_content
            and is_same_assistant_content
            and 0 <= interval_seconds <= max_interval_seconds
        ):
            delete_ids.update({current_user.id, current_assistant.id})
            deleted_turn_count += 1
            continue

        previous_user, previous_assistant = current_user, current_assistant

    return delete_ids, deleted_turn_count


class MessageService:
    def __init__(self, session: AsyncSession, *, request_turn_wait_timeout_seconds: float = 6.0) -> None:
        self.session = session
        self.repo = MessageRepository(session)
        self.conversation_repo = ConversationRepository(session)
        self.memory_service = MemoryApplicationService(session)
        self.memory_repo = LongTermMemoryRepository(session)
        self.summary_repo = MemorySummaryRepository(session)
        self.graph = AgentOrchestrator()
        self.request_turn_wait_timeout_seconds = request_turn_wait_timeout_seconds

    async def _load_long_term_memory_context(self, conversation) -> list[dict[str, str]]:
        conversation_memories = await self.memory_repo.search(
            conversation_id=conversation.id,
            memory_scope="conversation",
        )
        persona_memories = await self.memory_repo.search(
            persona_id=conversation.persona_id,
            memory_scope="persona",
        )

        merged: list[dict[str, str]] = []
        seen_ids: set[str] = set()
        for memory in [*conversation_memories, *persona_memories]:
            if memory.id in seen_ids:
                continue
            seen_ids.add(memory.id)
            merged.append({"content": memory.content})
            if len(merged) >= 3:
                break
        return merged

    async def _sync_memory_after_turn(
        self,
        *,
        conversation,
        conversation_id: str,
        user_input: str,
    ) -> None:
        try:
            all_messages = await self.repo.list_by_conversation(conversation_id)
            if len(all_messages) >= 6:
                await self.memory_service.summarize(
                    conversation_id=conversation_id,
                    messages=all_messages,
                )

            if conversation.persona.long_term_memory_enabled:
                await self.memory_service.create_long_term(
                    {
                        "conversation_id": conversation_id,
                        "persona_id": conversation.persona_id,
                        "memory_scope": "conversation",
                        "content": user_input,
                        "tags": ["chat", "conversation"],
                        "metadata": {"source": "user_message"},
                    }
                )
        except Exception as exc:  # pragma: no cover - degrade path
            logger.warning("memory sync skipped for conversation %s: %s", conversation_id, exc)

    async def _resolve_request_turn(
        self,
        conversation_id: str,
        request_id: str,
    ) -> tuple[Message | None, Message | None, RequestTurnLease | None]:
        existing_user, existing_assistant = await self._find_existing_turn_by_request_id(conversation_id, request_id)
        if existing_user and existing_assistant:
            return existing_user, existing_assistant, None

        request_turn = await generation_coordinator.acquire_request_turn(conversation_id, request_id)
        if not request_turn.owner:
            try:
                await generation_coordinator.wait_for_request_turn(
                    request_turn,
                    timeout_seconds=self.request_turn_wait_timeout_seconds,
                )
            except TimeoutError as error:
                raise AppError(
                    "request is still in progress, please retry later.",
                    status_code=HTTPStatus.CONFLICT,
                    code="request_in_progress",
                ) from error

            existing_user, existing_assistant = await self._find_existing_turn_by_request_id(conversation_id, request_id)
            if existing_user and existing_assistant:
                return existing_user, existing_assistant, None

            raise AppError(
                "request is still in progress, please retry later.",
                status_code=HTTPStatus.CONFLICT,
                code="request_in_progress",
            )

        existing_user, existing_assistant = await self._find_existing_turn_by_request_id(conversation_id, request_id)
        if existing_user and existing_assistant:
            await generation_coordinator.release_request_turn(request_turn)
            return existing_user, existing_assistant, None

        return existing_user, None, request_turn

    def _validate_manual_tool_requests(self, conversation, payload: dict[str, Any]) -> None:
        requests = payload.get("manual_tool_requests", [])
        if not isinstance(requests, list) or len(requests) == 0:
            return

        enabled_skills = {item.id: item for item in conversation.skills if item.enabled}
        for index, request in enumerate(requests):
            if not isinstance(request, dict):
                raise AppError(
                    f"manualToolRequests[{index}] must be an object",
                    status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                    code="validation_error",
                    details={
                        "source": "manual_tool_requests",
                        "issues": [
                            {
                                "path": f"manualToolRequests[{index}]",
                                "reason": "must be an object",
                                "type": "type",
                                "expected": "object",
                            }
                        ],
                    },
                )

            if request.get("type") != "skill":
                continue

            target_id = request.get("target_id")
            if not isinstance(target_id, str) or not target_id.strip():
                continue
            skill = enabled_skills.get(target_id.strip())
            if skill is None:
                continue
            _validate_manual_request_against_skill_schema(skill, request, index)

    async def validate_manual_tool_requests(self, conversation_id: str, payload: dict[str, Any]) -> None:
        conversation = await self.conversation_repo.get_with_relations(conversation_id)
        self._validate_manual_tool_requests(conversation, payload)

    async def _find_existing_turn_by_request_id(self, conversation_id: str, request_id: str) -> tuple[object | None, object | None]:
        messages = await self.repo.list_by_conversation(conversation_id)
        user_messages = [
            message
            for message in messages
            if message.role == "user" and _message_request_id(message) == request_id
        ]
        if not user_messages:
            return None, None

        user_message = user_messages[-1]
        assistant_message = next(
            (
                message
                for message in reversed(messages)
                if message.role == "assistant"
                and _message_request_id(message) == request_id
                and message.created_at >= user_message.created_at
            ),
            None,
        )
        return user_message, assistant_message

    async def _wait_existing_turn(self, conversation_id: str, request_id: str, timeout_seconds: float = 6.0) -> tuple[object | None, object | None]:
        deadline = asyncio.get_running_loop().time() + max(0.0, timeout_seconds)
        while True:
            existing_user, existing_assistant = await self._find_existing_turn_by_request_id(conversation_id, request_id)
            if existing_user and existing_assistant:
                return existing_user, existing_assistant
            if asyncio.get_running_loop().time() >= deadline:
                return existing_user, existing_assistant
            await asyncio.sleep(0.3)

    async def list_messages(self, conversation_id: str):
        await self.conversation_repo.get_with_relations(conversation_id)
        return await self.repo.list_by_conversation(conversation_id)

    async def dedupe_messages(self, conversation_id: str) -> dict:
        await self.conversation_repo.get_with_relations(conversation_id)
        messages = await self.repo.list_by_conversation(conversation_id)
        total_before = len(messages)
        if total_before <= 1:
            return {
                "conversation_id": conversation_id,
                "total_before": total_before,
                "total_after": total_before,
                "deleted_count": 0,
                "deleted_turn_count": 0,
                "deleted_message_ids": [],
            }

        request_id_duplicates = _collect_request_id_duplicate_ids(messages)
        adjacent_duplicate_ids, deleted_turn_count = _collect_adjacent_duplicate_turn_ids(
            messages,
            request_id_duplicates,
        )
        delete_ids = request_id_duplicates | adjacent_duplicate_ids
        if not delete_ids:
            return {
                "conversation_id": conversation_id,
                "total_before": total_before,
                "total_after": total_before,
                "deleted_count": 0,
                "deleted_turn_count": 0,
                "deleted_message_ids": [],
            }

        by_id = {message.id: message for message in messages}
        delete_ids_sorted = sorted(delete_ids, key=lambda message_id: _message_timestamp(by_id[message_id]))
        for message_id in delete_ids_sorted:
            message = by_id.get(message_id)
            if message is None:
                continue
            await self.repo.delete(message)
        await self.session.commit()

        return {
            "conversation_id": conversation_id,
            "total_before": total_before,
            "total_after": total_before - len(delete_ids_sorted),
            "deleted_count": len(delete_ids_sorted),
            "deleted_turn_count": deleted_turn_count,
            "deleted_message_ids": delete_ids_sorted,
        }

    async def send_message(self, conversation_id: str, payload: dict):
        conversation = await self.conversation_repo.get_with_relations(conversation_id)
        self._validate_manual_tool_requests(conversation, payload)
        request_id = _extract_request_id(payload)
        request_metadata = _attach_request_id(payload.get("metadata", {}), request_id)

        request_turn: RequestTurnLease | None = None
        user_message = None
        if request_id:
            user_message, assistant_message, request_turn = await self._resolve_request_turn(conversation_id, request_id)
            if assistant_message is not None:
                return user_message, assistant_message

        if user_message is None:
            user_message = await self.repo.create(
                {
                    "conversation_id": conversation_id,
                    "role": "user",
                    "sender_type": "user",
                    "sender_name": "User",
                    "content": payload["content"],
                    "metadata_": request_metadata,
                    "attachments": payload.get("attachments", []),
                }
            )
        recent_messages = await self.repo.list_by_conversation(conversation_id)
        state = await self.graph.prepare(
            {
                "conversation_id": conversation_id,
                "user_input": payload["content"],
                "persona": {
                    "name": conversation.persona.name,
                    "speaking_style": conversation.persona.speaking_style,
                    "background_story": conversation.persona.background_story,
                    "system_prompt_template": conversation.persona.system_prompt_template,
                },
                "model_config": {
                    "provider": conversation.model_config.provider,
                    "base_url": conversation.model_config.base_url,
                    "api_key": conversation.model_config.api_key,
                    "model": conversation.model_config.model,
                    "extra_config": conversation.model_config.extra_config,
                },
                "recent_messages": [
                    {"role": message.role, "content": message.content}
                    for message in recent_messages[-8:]
                ],
                "summary_memory": [
                    {"summary": item.summary}
                    for item in conversation.summaries[-2:]
                ],
                "long_term_memories": await self._load_long_term_memory_context(conversation),
                "enabled_skills": [
                    {
                        "id": skill.id,
                        "name": skill.name,
                        "description": skill.description,
                    }
                    for skill in conversation.skills
                    if skill.enabled
                ],
                "enabled_mcp_servers": [
                    {
                        "id": server.id,
                        "name": server.name,
                        "status": server.status,
                        "description": server.description,
                    }
                    for server in conversation.mcp_servers
                    if server.enabled
                ],
                "manual_tool_requests": payload.get("manual_tool_requests", []),
            }
        )

        try:
            provider = ProviderFactory.from_model_config(conversation.model_config)
            try:
                provider_response = await provider.chat(state["prompt_messages"])
            except AppError:
                raise
            except Exception as error:
                raise _to_provider_error(error) from error
            assistant_metadata = _build_assistant_metadata(
                planner_output=state.get("planner_output", {}),
                tool_results=state.get("tool_results", []),
                manual_tool_requests=payload.get("manual_tool_requests", []),
            )
            assistant_metadata = _attach_request_id(assistant_metadata, request_id)
            assistant_message = await self.repo.create(
                {
                    "conversation_id": conversation_id,
                    "role": "assistant",
                    "sender_type": "assistant",
                    "sender_name": conversation.persona.name,
                    "agent_name": "CompanionAgent",
                    "content": provider_response["content"],
                    "metadata_": assistant_metadata,
                }
            )

            await self._sync_memory_after_turn(
                conversation=conversation,
                conversation_id=conversation_id,
                user_input=payload["content"],
            )
            await self.session.commit()
            return user_message, assistant_message
        finally:
            if request_turn is not None:
                await generation_coordinator.release_request_turn(request_turn)

    async def regenerate(self, conversation_id: str):
        await self.conversation_repo.get_with_relations(conversation_id)
        messages = await self.repo.list_by_conversation(conversation_id)
        last_user = next((message for message in reversed(messages) if message.role == "user"), None)
        if last_user is None:
            raise AppError(
                "No user message found to regenerate",
                status_code=HTTPStatus.CONFLICT,
                code="regenerate_not_available",
            )
        return await self.send_message(
            conversation_id,
            {
                "content": last_user.content,
                "attachments": last_user.attachments,
                "metadata": {"regenerated": True},
            },
        )

    async def stop_generation(self, conversation_id: str) -> dict:
        await self.conversation_repo.get_with_relations(conversation_id)
        generation_coordinator.stop(conversation_id)
        return {"stopped": True, "conversationId": conversation_id}

    async def stream_message(self, conversation_id: str, payload: dict) -> AsyncIterator[dict]:
        conversation = await self.conversation_repo.get_with_relations(conversation_id)
        self._validate_manual_tool_requests(conversation, payload)
        request_id = _extract_request_id(payload)
        request_metadata = _attach_request_id(payload.get("metadata", {}), request_id)

        request_turn: RequestTurnLease | None = None
        user_message = None
        if request_id:
            user_message, assistant_message, request_turn = await self._resolve_request_turn(conversation_id, request_id)
            if assistant_message is not None:
                existing_metadata = assistant_message.metadata_ if isinstance(assistant_message.metadata_, dict) else {}
                yield _build_stream_event("message_created", {"userMessageId": user_message.id})
                yield _build_stream_event(
                    "final_answer",
                    {
                        "messageId": assistant_message.id,
                        "content": assistant_message.content,
                        "toolUsage": existing_metadata.get("toolUsage", {}),
                        "manualToolRequests": existing_metadata.get("manualToolRequests", []),
                    },
                )
                return

        if user_message is None:
            user_message = await self.repo.create(
                {
                    "conversation_id": conversation_id,
                    "role": "user",
                    "sender_type": "user",
                    "sender_name": "User",
                    "content": payload["content"],
                    "metadata_": request_metadata,
                    "attachments": payload.get("attachments", []),
                }
            )
            await self.session.flush()
        generation_coordinator.begin_stream(conversation_id)
        stop_event = generation_coordinator.new(conversation_id)
        try:
            yield _build_stream_event("message_created", {"userMessageId": user_message.id})

            prepared = await self.graph.prepare(
                {
                    "conversation_id": conversation_id,
                    "user_input": payload["content"],
                    "persona": {
                        "name": conversation.persona.name,
                        "speaking_style": conversation.persona.speaking_style,
                        "background_story": conversation.persona.background_story,
                        "system_prompt_template": conversation.persona.system_prompt_template,
                    },
                    "model_config": {
                        "provider": conversation.model_config.provider,
                        "base_url": conversation.model_config.base_url,
                        "api_key": conversation.model_config.api_key,
                        "model": conversation.model_config.model,
                        "extra_config": conversation.model_config.extra_config,
                    },
                    "recent_messages": [
                        {"role": message.role, "content": message.content}
                        for message in (await self.repo.list_by_conversation(conversation_id))[-8:]
                    ],
                    "summary_memory": [{"summary": item.summary} for item in conversation.summaries[-2:]],
                    "long_term_memories": await self._load_long_term_memory_context(conversation),
                    "enabled_skills": [
                        {
                            "id": skill.id,
                            "name": skill.name,
                            "description": skill.description,
                        }
                        for skill in conversation.skills
                        if skill.enabled
                    ],
                    "enabled_mcp_servers": [
                        {
                            "id": server.id,
                            "name": server.name,
                            "status": server.status,
                            "description": server.description,
                        }
                        for server in conversation.mcp_servers
                        if server.enabled
                    ],
                    "manual_tool_requests": payload.get("manual_tool_requests", []),
                }
            )

            for item in prepared.get("stream_events", []):
                event_name = str(item.get("event") or "").strip()
                event_data = item.get("data", {})
                if event_name:
                    yield _build_stream_event(event_name, event_data if isinstance(event_data, dict) else {})

            provider = ProviderFactory.from_model_config(conversation.model_config)
            chunks: list[str] = []
            assistant_metadata = _build_assistant_metadata(
                planner_output=prepared.get("planner_output", {}),
                tool_results=prepared.get("tool_results", []),
                manual_tool_requests=payload.get("manual_tool_requests", []),
            )
            assistant_metadata = _attach_request_id(assistant_metadata, request_id)
            try:
                async for chunk in provider.stream_chat(prepared["prompt_messages"]):
                    if stop_event.is_set():
                        yield _build_stream_event("stopped", {"conversationId": conversation_id})
                        await self.session.commit()
                        return
                    token = chunk.get("content", "")
                    if token:
                        chunks.append(token)
                        yield _build_stream_event("token", {"content": token})
            except AppError:
                raise
            except Exception as error:
                raise _to_provider_error(error) from error

            assistant_message = await self.repo.create(
                {
                    "conversation_id": conversation_id,
                    "role": "assistant",
                    "sender_type": "assistant",
                    "sender_name": conversation.persona.name,
                    "agent_name": "CompanionAgent",
                    "content": "".join(chunks),
                    "metadata_": assistant_metadata,
                }
            )
            await self._sync_memory_after_turn(
                conversation=conversation,
                conversation_id=conversation_id,
                user_input=payload["content"],
            )
            await self.session.commit()
            yield _build_stream_event(
                "final_answer",
                {
                    "messageId": assistant_message.id,
                    "content": assistant_message.content,
                    "toolUsage": assistant_metadata["toolUsage"],
                    "manualToolRequests": assistant_metadata["manualToolRequests"],
                },
            )
        finally:
            generation_coordinator.end_stream(conversation_id)
            if request_turn is not None:
                await generation_coordinator.release_request_turn(request_turn)
