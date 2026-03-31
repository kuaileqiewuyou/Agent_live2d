from fastapi import APIRouter, Depends, status

from app.core.responses import api_response
from app.db.session import get_db_session
from app.schemas.common import ListData
from app.schemas.mcp import MCPServerCreate, MCPServerRead, MCPServerUpdate
from app.services.mcp import MCPServerService

router = APIRouter()


async def _service(session=Depends(get_db_session)) -> MCPServerService:
    return MCPServerService(session)


@router.get("")
async def list_servers(service: MCPServerService = Depends(_service)):
    items = [MCPServerRead.model_validate(item).model_dump(by_alias=True) for item in await service.list_servers()]
    return api_response(ListData(items=items, total=len(items)).model_dump(by_alias=True))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_server(payload: MCPServerCreate, service: MCPServerService = Depends(_service)):
    entity = await service.create_server(payload.model_dump())
    return api_response(MCPServerRead.model_validate(entity).model_dump(by_alias=True))


@router.get("/{server_id}")
async def get_server(server_id: str, service: MCPServerService = Depends(_service)):
    entity = await service.get_server(server_id)
    return api_response(MCPServerRead.model_validate(entity).model_dump(by_alias=True))


@router.patch("/{server_id}")
async def update_server(
    server_id: str,
    payload: MCPServerUpdate,
    service: MCPServerService = Depends(_service),
):
    entity = await service.update_server(server_id, payload.model_dump(exclude_none=True))
    return api_response(MCPServerRead.model_validate(entity).model_dump(by_alias=True))


@router.delete("/{server_id}")
async def delete_server(server_id: str, service: MCPServerService = Depends(_service)):
    await service.delete_server(server_id)
    return api_response({"deleted": True, "id": server_id})


@router.post("/{server_id}/check")
async def check_server(server_id: str, service: MCPServerService = Depends(_service)):
    return api_response(await service.check_server(server_id))


@router.get("/{server_id}/capabilities")
async def get_capabilities(server_id: str, service: MCPServerService = Depends(_service)):
    return api_response(await service.get_capabilities(server_id))

