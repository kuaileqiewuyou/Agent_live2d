from fastapi import APIRouter

from app.config import get_settings
from app.core.responses import api_response

router = APIRouter()


@router.get("")
async def health_check():
    settings = get_settings()
    return api_response(
        {
            "status": "ok",
            "appName": settings.app_name,
            "environment": settings.app_env,
        }
    )

