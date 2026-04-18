from fastapi import APIRouter, Depends

from app.core.responses import api_response
from app.db.session import get_db_session
from app.schemas.ops import (
    OpsMCPInstallExecuteRequest,
    OpsMCPInstallExecuteResponse,
    OpsMCPInstallPreviewRequest,
    OpsMCPInstallPreviewResponse,
)
from app.services.mcp import MCPServerService
from app.services.ops_mcp_installer import OpsMCPInstallerService, get_ops_mcp_installer_service

router = APIRouter()


def _installer_service() -> OpsMCPInstallerService:
    return get_ops_mcp_installer_service()


async def _mcp_service(session=Depends(get_db_session)) -> MCPServerService:
    return MCPServerService(session)


@router.post("/preview")
async def preview_install_session(
    payload: OpsMCPInstallPreviewRequest,
    installer: OpsMCPInstallerService = Depends(_installer_service),
):
    session = await installer.preview(
        link=payload.link,
        conversation_id=payload.conversation_id,
    )
    return api_response(OpsMCPInstallPreviewResponse(session=session).model_dump(by_alias=True))


@router.post("/execute")
async def execute_install_step(
    payload: OpsMCPInstallExecuteRequest,
    installer: OpsMCPInstallerService = Depends(_installer_service),
    mcp_service: MCPServerService = Depends(_mcp_service),
):
    session, step = await installer.execute_step(
        session_id=payload.session_id,
        step_id=payload.step_id,
        mcp_service=mcp_service,
    )
    return api_response(
        OpsMCPInstallExecuteResponse(
            session=session,
            step=step,
        ).model_dump(by_alias=True)
    )


@router.get("/{session_id}")
async def get_install_session(
    session_id: str,
    installer: OpsMCPInstallerService = Depends(_installer_service),
):
    session = await installer.get_session(session_id)
    return api_response({"session": session.model_dump(by_alias=True)})

