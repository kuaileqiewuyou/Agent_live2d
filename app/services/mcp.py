from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp import MCPClientManager
from app.repositories import MCPServerRepository


class MCPServerService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = MCPServerRepository(session)
        self.client_manager = MCPClientManager()

    async def list_servers(self):
        return await self.repo.list()

    async def create_server(self, payload: dict):
        server = await self.repo.create(payload)
        await self.session.commit()
        return server

    async def get_server(self, server_id: str):
        return await self.repo.get(server_id, resource_name="mcp server")

    async def update_server(self, server_id: str, payload: dict):
        server = await self.get_server(server_id)
        server = await self.repo.update(server, payload)
        await self.session.commit()
        return server

    async def delete_server(self, server_id: str):
        server = await self.get_server(server_id)
        await self.repo.delete(server)
        await self.session.commit()

    async def check_server(self, server_id: str):
        server = await self.get_server(server_id)
        inspection = await self.client_manager.inspect_server(
            transport_type=server.transport_type,
            endpoint_or_command=server.endpoint_or_command,
        )
        server = await self.repo.update(
            server,
            {
                "status": inspection["status"],
                "tool_count": len(inspection["tools"]),
                "resource_count": len(inspection["resources"]),
                "prompt_count": len(inspection["prompts"]),
                "last_checked_at": inspection["checked_at"],
                "capabilities": {
                    "tools": inspection["tools"],
                    "resources": inspection["resources"],
                    "prompts": inspection["prompts"],
                    "detail": inspection["detail"],
                },
            },
        )
        await self.session.commit()
        return {
            "ok": inspection["ok"],
            "status": server.status,
            "tool_count": server.tool_count,
            "resource_count": server.resource_count,
            "prompt_count": server.prompt_count,
            "detail": inspection["detail"],
        }

    async def get_capabilities(self, server_id: str):
        server = await self.get_server(server_id)
        return server.capabilities

