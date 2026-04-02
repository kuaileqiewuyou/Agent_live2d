from fastapi import APIRouter, Depends

from app.core.responses import api_response
from app.schemas.app_settings import AppSettingsRead, AppSettingsUpdate
from app.services import AppSettingsService

router = APIRouter()


def _service() -> AppSettingsService:
    return AppSettingsService()


@router.get("")
async def get_settings(service: AppSettingsService = Depends(_service)):
    settings = await service.get_settings()
    return api_response(settings.model_dump(by_alias=True))


@router.patch("")
async def update_settings(
    payload: AppSettingsUpdate,
    service: AppSettingsService = Depends(_service),
):
    settings = await service.update_settings(payload.model_dump(exclude_unset=True))
    return api_response(settings.model_dump(by_alias=True))
