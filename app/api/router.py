from fastapi import APIRouter

from app.api.routes import (
    conversations,
    health,
    mcp,
    memory,
    meta,
    model_configs,
    ops,
    ops_command,
    personas,
    settings,
    skills,
)

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
api_router.include_router(personas.router, prefix="/personas", tags=["personas"])
api_router.include_router(model_configs.router, prefix="/models/configs", tags=["model-configs"])
api_router.include_router(skills.router, prefix="/skills", tags=["skills"])
api_router.include_router(mcp.router, prefix="/mcp/servers", tags=["mcp"])
api_router.include_router(memory.router, prefix="/memory", tags=["memory"])
api_router.include_router(meta.router, prefix="/meta", tags=["meta"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(ops.router, prefix="/ops/mcp/install", tags=["ops"])
api_router.include_router(ops_command.router, prefix="/ops/commands", tags=["ops"])
