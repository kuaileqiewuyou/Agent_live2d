from datetime import datetime, timezone

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

    @staticmethod
    def _as_list(value) -> list:
        return value if isinstance(value, list) else []

    @staticmethod
    def _as_datetime(value) -> datetime | None:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
        return None

    @staticmethod
    def _to_iso(value: datetime | None) -> str | None:
        if value is None:
            return None
        return value.astimezone(timezone.utc).isoformat()

    def _normalize_capabilities(self, capabilities: dict | None) -> dict:
        payload = capabilities if isinstance(capabilities, dict) else {}
        return {
            "tools": self._as_list(payload.get("tools")),
            "resources": self._as_list(payload.get("resources")),
            "prompts": self._as_list(payload.get("prompts")),
            "detail": payload.get("detail") if isinstance(payload.get("detail"), str) else "",
            "source": payload.get("source") if isinstance(payload.get("source"), str) else "probe",
            "checkedAt": payload.get("checkedAt") if isinstance(payload.get("checkedAt"), str) else None,
            "lastSuccessAt": (
                payload.get("lastSuccessAt")
                if isinstance(payload.get("lastSuccessAt"), str)
                else None
            ),
            "lastError": payload.get("lastError") if isinstance(payload.get("lastError"), str) else None,
        }

    async def check_server(self, server_id: str):
        server = await self.get_server(server_id)
        cached = self._normalize_capabilities(server.capabilities)
        inspection = await self.client_manager.inspect_server(
            transport_type=server.transport_type,
            endpoint_or_command=server.endpoint_or_command,
        )
        checked_at = self._as_datetime(inspection.get("checked_at")) or datetime.now(timezone.utc)
        probe_tools = self._as_list(inspection.get("tools"))
        probe_resources = self._as_list(inspection.get("resources"))
        probe_prompts = self._as_list(inspection.get("prompts"))
        probe_detail = inspection.get("detail") if isinstance(inspection.get("detail"), str) else ""
        used_cache = False

        if inspection.get("ok"):
            final_tools = probe_tools
            final_resources = probe_resources
            final_prompts = probe_prompts
            capability_source = "probe"
            capability_detail = probe_detail
            last_success_at = checked_at
            last_error = None
        else:
            has_cached_capability = bool(cached["tools"] or cached["resources"] or cached["prompts"])
            if has_cached_capability:
                used_cache = True
                final_tools = cached["tools"]
                final_resources = cached["resources"]
                final_prompts = cached["prompts"]
                capability_source = "cache"
                capability_detail = cached["detail"] or "using cached capabilities"
                last_success_at = self._as_datetime(cached["lastSuccessAt"]) or self._as_datetime(cached["checkedAt"])
            else:
                final_tools = probe_tools
                final_resources = probe_resources
                final_prompts = probe_prompts
                capability_source = "probe"
                capability_detail = probe_detail
                last_success_at = self._as_datetime(cached["lastSuccessAt"])
            last_error = probe_detail or "capability probe failed"

        server = await self.repo.update(
            server,
            {
                "status": inspection["status"],
                "tool_count": len(final_tools),
                "resource_count": len(final_resources),
                "prompt_count": len(final_prompts),
                "last_checked_at": checked_at,
                "capabilities": {
                    "tools": final_tools,
                    "resources": final_resources,
                    "prompts": final_prompts,
                    "detail": capability_detail,
                    "source": capability_source,
                    "checkedAt": self._to_iso(checked_at),
                    "lastSuccessAt": self._to_iso(last_success_at),
                    "lastError": last_error,
                },
            },
        )
        await self.session.commit()
        detail = probe_detail
        if used_cache and detail:
            detail = f"{detail}; using cached capabilities"
        return {
            "ok": inspection["ok"],
            "status": server.status,
            "tool_count": server.tool_count,
            "resource_count": server.resource_count,
            "prompt_count": server.prompt_count,
            "detail": detail,
            "used_cache": used_cache,
        }

    async def get_capabilities(self, server_id: str):
        server = await self.get_server(server_id)
        if server.enabled and not server.capabilities:
            await self.check_server(server_id)
            server = await self.get_server(server_id)
        capabilities = self._normalize_capabilities(server.capabilities)
        capabilities["status"] = server.status
        capabilities["lastCheckedAt"] = self._to_iso(server.last_checked_at)
        return capabilities
