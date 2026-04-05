import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.core.errors import AppError
from app.services.message import MessageService, generation_coordinator


def _bootstrap_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "idempotency persona",
            "avatar": "avatar.png",
            "description": "for request id idempotency tests",
            "personalityTags": ["stable"],
            "speakingStyle": "clear",
            "backgroundStory": "test background",
            "openingMessage": "hello",
            "longTermMemoryEnabled": True,
            "live2dModel": "idempotency.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are an idempotency test assistant",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "idempotency model",
            "provider": "openai-compatible",
            "baseUrl": "http://localhost:11434/v1",
            "apiKey": "local-key",
            "model": "gpt-test",
            "streamEnabled": True,
            "toolCallSupported": True,
            "isDefault": True,
            "extraConfig": {},
        },
    ).json()["data"]
    conversation = client.post(
        "/api/conversations",
        json={
            "title": "idempotency session",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [],
            "enabledMcpServerIds": [],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"]


def _iter_sse_events(stream_body: str) -> Iterator[tuple[str, str]]:
    normalized = stream_body.replace("\r\n", "\n")
    current_event = ""
    current_data: list[str] = []

    for raw_line in normalized.split("\n"):
        line = raw_line.strip()
        if line.startswith("event:"):
            if current_event:
                yield current_event, "".join(current_data)
                current_data = []
            current_event = line[len("event:") :].strip()
            continue

        if line.startswith("data:"):
            current_data.append(line[len("data:") :].strip())
            continue

        if line == "" and current_event:
            yield current_event, "".join(current_data)
            current_event = ""
            current_data = []

    if current_event:
        yield current_event, "".join(current_data)


def _extract_final_answer_payload(stream_body: str) -> dict:
    for event, data in _iter_sse_events(stream_body):
        if event == "final_answer" and data:
            return json.loads(data)
    raise AssertionError("final_answer event not found in stream response")


def test_send_message_with_same_request_id_returns_same_turn(client):
    conversation_id = _bootstrap_conversation(client)
    request_id = "req-idempotency-send-1"
    payload = {
        "content": "same request id should not generate duplicate turns",
        "metadata": {"requestId": request_id},
    }

    first = client.post(f"/api/conversations/{conversation_id}/messages", json=payload)
    second = client.post(f"/api/conversations/{conversation_id}/messages", json=payload)

    assert first.status_code == 201
    assert second.status_code == 201

    first_data = first.json()["data"]
    second_data = second.json()["data"]
    assert first_data["userMessage"]["id"] == second_data["userMessage"]["id"]
    assert first_data["assistantMessage"]["id"] == second_data["assistantMessage"]["id"]

    messages = client.get(f"/api/conversations/{conversation_id}/messages").json()["data"]["items"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"


def test_stream_then_send_with_same_request_id_reuses_existing_result(client):
    conversation_id = _bootstrap_conversation(client)
    request_id = "req-idempotency-stream-1"
    content = "stream then send with same request id should reuse the same assistant"

    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json={"content": content, "metadata": {"requestId": request_id}},
    ) as response:
        stream_body = "".join(response.iter_text())

    assert response.status_code == 200
    final_payload = _extract_final_answer_payload(stream_body)
    stream_message_id = final_payload["messageId"]

    send_response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"content": content, "metadata": {"requestId": request_id}},
    )
    assert send_response.status_code == 201
    send_data = send_response.json()["data"]
    assert send_data["assistantMessage"]["id"] == stream_message_id

    messages = client.get(f"/api/conversations/{conversation_id}/messages").json()["data"]["items"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_request_turn_wait_timeout_raises_request_in_progress():
    conversation_id = "conv-lock-timeout"
    request_id = "req-lock-timeout"
    service = MessageService.__new__(MessageService)
    service.request_turn_wait_timeout_seconds = 0.01

    async def _fake_find_existing_turn(*_args, **_kwargs):
        return None, None

    service._find_existing_turn_by_request_id = _fake_find_existing_turn

    owner_lease = await generation_coordinator.acquire_request_turn(conversation_id, request_id)
    assert owner_lease.owner is True

    try:
        with pytest.raises(AppError) as exc_info:
            await MessageService._resolve_request_turn(service, conversation_id, request_id)

        assert exc_info.value.status_code == 409
        assert exc_info.value.code == "request_in_progress"
    finally:
        await generation_coordinator.release_request_turn(owner_lease)


@pytest.mark.asyncio
async def test_find_existing_turn_by_request_id_prefers_latest_assistant():
    conversation_id = "conv-request-id-order"
    request_id = "req-order-1"
    now = datetime.now(UTC)

    messages = [
        SimpleNamespace(
            id="u-1",
            role="user",
            created_at=now,
            metadata_={"requestId": request_id},
        ),
        SimpleNamespace(
            id="a-1",
            role="assistant",
            created_at=now + timedelta(seconds=1),
            metadata_={"requestId": request_id},
        ),
        SimpleNamespace(
            id="a-2",
            role="assistant",
            created_at=now + timedelta(seconds=2),
            metadata_={"requestId": request_id},
        ),
    ]

    class _Repo:
        async def list_by_conversation(self, _conversation_id: str):
            return messages

    service = MessageService.__new__(MessageService)
    service.repo = _Repo()

    user, assistant = await MessageService._find_existing_turn_by_request_id(service, conversation_id, request_id)
    assert user is not None
    assert assistant is not None
    assert user.id == "u-1"
    assert assistant.id == "a-2"
