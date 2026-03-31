from fastapi import APIRouter

from app.api.routes import conversations, health, mcp, memory, meta, model_configs, personas, skills

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
api_router.include_router(personas.router, prefix="/personas", tags=["personas"])
api_router.include_router(model_configs.router, prefix="/models/configs", tags=["model-configs"])
api_router.include_router(skills.router, prefix="/skills", tags=["skills"])
api_router.include_router(mcp.router, prefix="/mcp/servers", tags=["mcp"])
api_router.include_router(memory.router, prefix="/memory", tags=["memory"])
api_router.include_router(meta.router, prefix="/meta", tags=["meta"])

