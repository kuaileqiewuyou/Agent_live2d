from app.services.message import GenerationCoordinator


def test_stop_request_is_applied_when_stream_is_active_but_event_not_ready():
    coordinator = GenerationCoordinator()
    conversation_id = "conv-stop-race-1"

    coordinator.begin_stream(conversation_id)
    coordinator.stop(conversation_id)
    stop_event = coordinator.new(conversation_id)

    assert stop_event.is_set() is True
    coordinator.end_stream(conversation_id)


def test_stop_request_without_active_stream_does_not_affect_next_turn():
    coordinator = GenerationCoordinator()
    conversation_id = "conv-stop-race-2"

    coordinator.stop(conversation_id)
    stop_event = coordinator.new(conversation_id)

    assert stop_event.is_set() is False
    coordinator.end_stream(conversation_id)


def test_pending_stop_is_cleared_after_stream_end():
    coordinator = GenerationCoordinator()
    conversation_id = "conv-stop-race-3"

    coordinator.begin_stream(conversation_id)
    coordinator.stop(conversation_id)
    coordinator.end_stream(conversation_id)

    coordinator.begin_stream(conversation_id)
    stop_event = coordinator.new(conversation_id)

    assert stop_event.is_set() is False
    coordinator.end_stream(conversation_id)
