from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.base import Base
from app.db.models import MCPServer
from app.services.mcp import MCPServerService

_DEFAULT_MCP_SERVER_NAME = "chrome-devtools"
_DEFAULT_MCP_SERVER_PAYLOAD = {
    "name": _DEFAULT_MCP_SERVER_NAME,
    "description": "Built-in Chrome DevTools MCP server for browser inspection and automation",
    "transport_type": "stdio",
    "endpoint_or_command": "npx",
    "enabled": False,
    "advanced_config": {
        "args": ["-y", "chrome-devtools-mcp@latest"],
    },
}


async def init_db(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        existing = await session.scalar(select(MCPServer).where(MCPServer.name == _DEFAULT_MCP_SERVER_NAME))
        if existing is None:
            await MCPServerService(session).create_server(dict(_DEFAULT_MCP_SERVER_PAYLOAD))
