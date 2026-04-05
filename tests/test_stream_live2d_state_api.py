import json
from collections.abc import Iterator


def _bootstrap_conversation(client):
    persona = client.post(
        "/api/personas",
        json={
            "name": "Live2D Stream Persona",
            "avatar": "avatar.png",
            "description": "live2d state stream test",
            "personalityTags": ["calm"],
            "speakingStyle": "natural",
            "backgroundStory": "test",
            "openingMessage": "hi",
            "longTermMemoryEnabled": True,
            "live2dModel": "live2d.model3.json",
            "defaultLayoutMode": "chat",
            "systemPromptTemplate": "you are a live2d state test assistant",
        },
    ).json()["data"]
    model = client.post(
        "/api/models/configs",
        json={
            "name": "Live2D Stream Model",
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
            "title": "Live2D Stream Conversation",
            "personaId": persona["id"],
            "modelConfigId": model["id"],
            "layoutMode": "chat",
            "enabledSkillIds": [],
            "enabledMcpServerIds": [],
            "pinned": False,
        },
    ).json()["data"]
    return conversation["id"]


def _iter_sse_events(stream_body: str) -> Iterator[tuple[str, dict]]:
    normalized = stream_body.replace("\r\n", "\n")
    current_event = ""
    current_data: list[str] = []

    for raw_line in normalized.split("\n"):
        line = raw_line.strip()
        if line.startswith("event:"):
            if current_event:
                payload = json.loads("".join(current_data)) if current_data else {}
                yield current_event, payload
                current_data = []
            current_event = line[len("event:") :].strip()
            continue

        if line.startswith("data:"):
            current_data.append(line[len("data:") :].strip())
            continue

        if line == "" and current_event:
            payload = json.loads("".join(current_data)) if current_data else {}
            yield current_event, payload
            current_event = ""
            current_data = []

    if current_event:
        payload = json.loads("".join(current_data)) if current_data else {}
        yield current_event, payload


def test_stream_events_include_live2d_state_markers(client):
    conversation_id = _bootstrap_conversation(client)

    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json={"content": "please reply with a short sentence"},
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    events = list(_iter_sse_events(body))
    assert events

    for event_name, payload in events:
        assert "live2dState" in payload
        if event_name == "token":
            assert payload["live2dState"] == "talking"
        elif event_name == "final_answer":
            assert payload["live2dState"] == "idle"
        elif event_name in {"message_created", "thinking", "tool_calling", "tool_result", "memory_sync"}:
            assert payload["live2dState"] == "thinking"
        elif event_name == "stopped":
            assert payload["live2dState"] == "idle"


def test_reused_request_id_stream_events_include_live2d_state(client):
    conversation_id = _bootstrap_conversation(client)
    request_id = "req-live2d-stream-reuse-1"
    payload = {
        "content": "reuse this stream turn",
        "metadata": {"requestId": request_id},
    }

    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json=payload,
    ) as first_response:
        first_body = "".join(first_response.iter_text())
    assert first_response.status_code == 200
    assert "event: final_answer" in first_body

    with client.stream(
        "POST",
        f"/api/conversations/{conversation_id}/messages/stream",
        json=payload,
    ) as second_response:
        second_body = "".join(second_response.iter_text())

    assert second_response.status_code == 200
    events = list(_iter_sse_events(second_body))
    assert len(events) == 2
    assert events[0][0] == "message_created"
    assert events[0][1]["live2dState"] == "thinking"
    assert events[1][0] == "final_answer"
    assert events[1][1]["live2dState"] == "idle"
