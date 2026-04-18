from fastapi import APIRouter, Depends, status

from app.core.responses import api_response
from app.db.session import get_db_session
from app.schemas.common import ListData
from app.schemas.memory import (
    LongTermMemoryCreate,
    LongTermMemoryRead,
    MemoryDeleteResult,
    MemorySearchRequest,
    MemorySummarizeRequest,
)
from app.services.memory import MemoryApplicationService
from app.services.message import MessageService

router = APIRouter()


async def _memory_service(session=Depends(get_db_session)) -> MemoryApplicationService:
    return MemoryApplicationService(session)


async def _message_service(session=Depends(get_db_session)) -> MessageService:
    return MessageService(session)


@router.get("/long-term")
async def list_long_term(service: MemoryApplicationService = Depends(_memory_service)):
    items = [LongTermMemoryRead.model_validate(item).model_dump(by_alias=True) for item in await service.list_long_term()]
    return api_response(ListData(items=items, total=len(items)).model_dump(by_alias=True))


@router.post("/long-term", status_code=status.HTTP_201_CREATED)
async def create_long_term(payload: LongTermMemoryCreate, service: MemoryApplicationService = Depends(_memory_service)):
    entity = await service.create_long_term(payload.model_dump())
    return api_response(LongTermMemoryRead.model_validate(entity).model_dump(by_alias=True))


@router.delete("/long-term/{memory_id}")
async def delete_long_term(memory_id: str, service: MemoryApplicationService = Depends(_memory_service)):
    result = await service.delete_long_term(memory_id)
    return api_response(MemoryDeleteResult.model_validate(result).model_dump(by_alias=True))


@router.post("/search")
async def search_memory(payload: MemorySearchRequest, service: MemoryApplicationService = Depends(_memory_service)):
    items = [LongTermMemoryRead.model_validate(item).model_dump(by_alias=True) for item in await service.search(payload.model_dump())]
    return api_response(ListData(items=items, total=len(items)).model_dump(by_alias=True))


@router.post("/summarize")
async def summarize_memory(
    payload: MemorySummarizeRequest,
    memory_service: MemoryApplicationService = Depends(_memory_service),
    message_service: MessageService = Depends(_message_service),
):
    messages = await message_service.list_messages(payload.conversation_id)
    entity = await memory_service.summarize(conversation_id=payload.conversation_id, messages=messages)
    return api_response({"id": entity.id, "summary": entity.summary, "sourceMessageCount": entity.source_message_count})
