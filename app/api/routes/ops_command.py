from fastapi import APIRouter, Depends

from app.core.responses import api_response
from app.schemas.ops_command import (
    OpsCommandExecuteRequest,
    OpsCommandExecuteResponse,
    OpsCommandPreviewRequest,
    OpsCommandPreviewResponse,
)
from app.services.ops_command_executor import OpsCommandExecutorService, get_ops_command_executor_service

router = APIRouter()


def _service() -> OpsCommandExecutorService:
    return get_ops_command_executor_service()


@router.post("/preview")
async def preview_command(
    payload: OpsCommandPreviewRequest,
    service: OpsCommandExecutorService = Depends(_service),
):
    session = await service.preview(
        command=payload.command,
        cwd=payload.cwd,
        conversation_id=payload.conversation_id,
    )
    return api_response(OpsCommandPreviewResponse(session=session).model_dump(by_alias=True))


@router.post("/execute")
async def execute_command(
    payload: OpsCommandExecuteRequest,
    service: OpsCommandExecutorService = Depends(_service),
):
    session = await service.execute(session_id=payload.session_id)
    return api_response(OpsCommandExecuteResponse(session=session).model_dump(by_alias=True))


@router.get("/{session_id}")
async def get_command_session(
    session_id: str,
    service: OpsCommandExecutorService = Depends(_service),
):
    session = await service.get_session(session_id)
    return api_response({"session": session.model_dump(by_alias=True)})

