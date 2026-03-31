from fastapi import APIRouter

from app.config.constants import LAYOUT_MODES, LIVE2D_STATES, PROVIDER_TYPES
from app.core.responses import api_response

router = APIRouter()


@router.get("/providers")
async def get_providers():
    return api_response({"items": PROVIDER_TYPES})


@router.get("/layout-modes")
async def get_layout_modes():
    return api_response({"items": LAYOUT_MODES})


@router.get("/live2d-states")
async def get_live2d_states():
    return api_response({"items": LIVE2D_STATES})

