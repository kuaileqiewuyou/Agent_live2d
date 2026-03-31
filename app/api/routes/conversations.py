import json

from fastapi import APIRouter, Depends, status
from sse_starlette.sse import EventSourceResponse

from app.core.responses import api_response
from app.db.session import get_db_session
from app.schemas.common import ListData
from app.schemas.conversation import ConversationCreate, ConversationRead, ConversationUpdate
from app.schemas.message import MessageCreateRequest, MessageRead
from app.services.conversation import ConversationService
from app.services.message import MessageService

router = APIRouter()


async def _conversation_service(session=Depends(get_db_session)) -> ConversationService:
    return ConversationService(session)


async def _message_service(session=Depends(get_db_session)) -> MessageService:
    return MessageService(session)


def _serialize_conversation(item) -> dict:
    payload = ConversationRead.model_validate(
        {
            **item.__dict__,
            "enabled_skill_ids": [skill.id for skill in item.skills],
            "enabled_mcp_server_ids": [server.id for server in item.mcp_servers],
            "last_message": item.messages[-1].content if item.messages else None,
            "persona": item.persona,
            "model_config_detail": item.model_config,
            "skills": item.skills,
            "mcp_servers": item.mcp_servers,
        }
    )
    return payload.model_dump(by_alias=True)


@router.get("")
async def list_conversations(service: ConversationService = Depends(_conversation_service)):
    items = [_serialize_conversation(item) for item in await service.list_conversations()]
    return api_response(ListData(items=items, total=len(items)).model_dump(by_alias=True))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_conversation(payload: ConversationCreate, service: ConversationService = Depends(_conversation_service)):
    entity = await service.create_conversation(payload.model_dump(exclude={"inherit_persona_long_term_memory"}))
    return api_response(_serialize_conversation(entity))


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, service: ConversationService = Depends(_conversation_service)):
    entity = await service.get_conversation(conversation_id)
    return api_response(_serialize_conversation(entity))


@router.patch("/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    payload: ConversationUpdate,
    service: ConversationService = Depends(_conversation_service),
):
    entity = await service.update_conversation(conversation_id, payload.model_dump(exclude_none=True))
    return api_response(_serialize_conversation(entity))


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, service: ConversationService = Depends(_conversation_service)):
    await service.delete_conversation(conversation_id)
    return api_response({"deleted": True, "id": conversation_id})


@router.get("/{conversation_id}/messages")
async def list_messages(conversation_id: str, service: MessageService = Depends(_message_service)):
    items = [MessageRead.model_validate(item).model_dump(by_alias=True) for item in await service.list_messages(conversation_id)]
    return api_response(ListData(items=items, total=len(items)).model_dump(by_alias=True))


@router.post("/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: str,
    payload: MessageCreateRequest,
    service: MessageService = Depends(_message_service),
):
    user_message, assistant_message = await service.send_message(conversation_id, payload.model_dump())
    return api_response(
        {
            "userMessage": MessageRead.model_validate(user_message).model_dump(by_alias=True),
            "assistantMessage": MessageRead.model_validate(assistant_message).model_dump(by_alias=True),
        }
    )


@router.post("/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: str,
    payload: MessageCreateRequest,
    service: MessageService = Depends(_message_service),
):
    async def event_generator():
        async for event in service.stream_message(conversation_id, payload.model_dump()):
            yield {
                "event": event["event"],
                "data": json.dumps(event["data"], ensure_ascii=False),
            }

    return EventSourceResponse(event_generator())


@router.post("/{conversation_id}/messages/regenerate")
async def regenerate_message(conversation_id: str, service: MessageService = Depends(_message_service)):
    user_message, assistant_message = await service.regenerate(conversation_id)
    return api_response(
        {
            "userMessage": MessageRead.model_validate(user_message).model_dump(by_alias=True),
            "assistantMessage": MessageRead.model_validate(assistant_message).model_dump(by_alias=True),
        }
    )


@router.post("/{conversation_id}/messages/stop")
async def stop_message(conversation_id: str, service: MessageService = Depends(_message_service)):
    return api_response(await service.stop_generation(conversation_id))
