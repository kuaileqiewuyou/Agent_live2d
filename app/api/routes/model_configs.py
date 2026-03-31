from fastapi import APIRouter, Depends, status

from app.core.responses import api_response
from app.db.session import get_db_session
from app.schemas.common import ListData
from app.schemas.model_config import (
    ModelConfigCreate,
    ModelConfigRead,
    ModelConfigUpdate,
)
from app.services.model_config import ModelConfigService

router = APIRouter()


async def _service(session=Depends(get_db_session)) -> ModelConfigService:
    return ModelConfigService(session)


@router.get("")
async def list_configs(service: ModelConfigService = Depends(_service)):
    items = [ModelConfigRead.model_validate(item).model_dump(by_alias=True) for item in await service.list_configs()]
    return api_response(ListData(items=items, total=len(items)).model_dump(by_alias=True))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_config(payload: ModelConfigCreate, service: ModelConfigService = Depends(_service)):
    entity = await service.create_config(payload.model_dump())
    return api_response(ModelConfigRead.model_validate(entity).model_dump(by_alias=True))


@router.get("/{config_id}")
async def get_config(config_id: str, service: ModelConfigService = Depends(_service)):
    entity = await service.get_config(config_id)
    return api_response(ModelConfigRead.model_validate(entity).model_dump(by_alias=True))


@router.patch("/{config_id}")
async def update_config(
    config_id: str,
    payload: ModelConfigUpdate,
    service: ModelConfigService = Depends(_service),
):
    entity = await service.update_config(config_id, payload.model_dump(exclude_none=True))
    return api_response(ModelConfigRead.model_validate(entity).model_dump(by_alias=True))


@router.delete("/{config_id}")
async def delete_config(config_id: str, service: ModelConfigService = Depends(_service)):
    await service.delete_config(config_id)
    return api_response({"deleted": True, "id": config_id})


@router.post("/{config_id}/test")
async def test_config(config_id: str, service: ModelConfigService = Depends(_service)):
    result = await service.test_connection(config_id)
    return api_response(result)

