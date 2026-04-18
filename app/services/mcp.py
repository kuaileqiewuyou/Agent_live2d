from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MCPServer
from app.mcp import get_mcp_client_manager
from app.mcp.client import MCPClientManager  # noqa: F401 - backward-compatible test patch target
from app.services.app_settings import AppSettingsService
from app.repositories import MCPServerRepository


class MCPServerService:
    _BUILTIN_CHROME_DEVTOOLS_NAME = "chrome-devtools"
    _BUILTIN_CHROME_DEVTOOLS_PAYLOAD = {
        "name": _BUILTIN_CHROME_DEVTOOLS_NAME,
        "description": "Built-in Chrome DevTools MCP server for browser inspection and automation",
        "transport_type": "stdio",
        "endpoint_or_command": "npx",
        "enabled": False,
        "advanced_config": {
            "args": ["-y", "chrome-devtools-mcp@latest"],
        },
    }

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = MCPServerRepository(session)

    async def list_servers(self):
        await self._ensure_builtin_chrome_devtools_server()
        return await self.repo.list()

    async def create_server(self, payload: dict):
        config_patch = self._consume_server_config_patch(payload)
        if config_patch is not None:
            payload["capabilities"] = self._with_server_config(payload.get("capabilities"), config_patch)
        server = await self.repo.create(payload)
        await self.session.commit()
        return server

    async def get_server(self, server_id: str):
        return await self.repo.get(server_id, resource_name="mcp server")

    async def update_server(self, server_id: str, payload: dict):
        server = await self.get_server(server_id)
        config_patch = self._consume_server_config_patch(payload, existing_capabilities=server.capabilities)
        if config_patch is not None:
            payload["capabilities"] = self._with_server_config(server.capabilities, config_patch)
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
            "config": self._normalize_server_config(payload.get("config")),
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

    @staticmethod
    def _normalize_kv_map(value: object) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        normalized: dict[str, str] = {}
        for key, raw in value.items():
            if not isinstance(key, str) or not key.strip():
                continue
            if isinstance(raw, str) and raw.strip():
                normalized[key.strip()] = raw.strip()
        return normalized

    @classmethod
    def _normalize_server_config(cls, config: object) -> dict:
        if not isinstance(config, dict):
            return {}
        timeout_ms = config.get("timeoutMs")
        normalized: dict[str, object] = {}

        if isinstance(timeout_ms, (int, float)) and timeout_ms > 0:
            normalized["timeoutMs"] = int(timeout_ms)

        headers = cls._normalize_kv_map(config.get("headers"))
        if headers:
            normalized["headers"] = headers

        env = cls._normalize_kv_map(config.get("env"))
        if env:
            normalized["env"] = env

        raw_args = config.get("args")
        if isinstance(raw_args, list):
            args = [str(item).strip() for item in raw_args if isinstance(item, str) and str(item).strip()]
            if args:
                normalized["args"] = args

        raw_auth = config.get("auth")
        if isinstance(raw_auth, dict):
            auth_type = str(raw_auth.get("type") or "").strip()
            if auth_type == "bearer":
                token = str(raw_auth.get("token") or "").strip()
                if token:
                    normalized["auth"] = {"type": "bearer", "token": token}
            elif auth_type == "basic":
                username = str(raw_auth.get("username") or "").strip()
                password = str(raw_auth.get("password") or "")
                if username or password:
                    normalized["auth"] = {
                        "type": "basic",
                        "username": username,
                        "password": password,
                    }
            elif auth_type == "apiKey":
                header_name = str(raw_auth.get("headerName") or "").strip()
                value = str(raw_auth.get("value") or "").strip()
                if header_name and value:
                    normalized["auth"] = {
                        "type": "apiKey",
                        "headerName": header_name,
                        "value": value,
                    }

        return normalized

    def _consume_server_config_patch(self, payload: dict, *, existing_capabilities: dict | None = None) -> dict | None:
        if "advanced_config" not in payload:
            return None
        raw = payload.pop("advanced_config")
        if raw is None:
            if isinstance(existing_capabilities, dict):
                return self._normalize_capabilities(existing_capabilities).get("config", {})
            return {}
        return self._normalize_server_config(raw)

    def _with_server_config(self, capabilities: dict | None, config: dict | None) -> dict:
        normalized_caps = self._normalize_capabilities(capabilities)
        if isinstance(config, dict):
            normalized_caps["config"] = config
        return normalized_caps

    async def check_server(self, server_id: str):
        server = await self.get_server(server_id)
        cached = self._normalize_capabilities(server.capabilities)
        client_manager = get_mcp_client_manager()
        inspection = await client_manager.inspect_server(
            transport_type=server.transport_type,
            endpoint_or_command=server.endpoint_or_command,
            config=cached.get("config"),
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
                    "config": cached.get("config", {}),
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

    async def smoke_server(self, server_id: str, payload: dict | None = None) -> dict:
        server = await self.get_server(server_id)
        cached = self._normalize_capabilities(server.capabilities)
        body = payload if isinstance(payload, dict) else {}
        tool_name = body.get("tool_name")
        tool_arguments = body.get("tool_arguments")

        runtime_settings = await AppSettingsService().get_settings()
        client_manager = get_mcp_client_manager()
        result = await client_manager.smoke_server(
            transport_type=server.transport_type,
            endpoint_or_command=server.endpoint_or_command,
            tool_name=tool_name if isinstance(tool_name, str) else None,
            tool_arguments=tool_arguments if isinstance(tool_arguments, dict) else None,
            config=cached.get("config"),
            file_access_allow_all=runtime_settings.file_access_allow_all,
            file_access_folders=runtime_settings.file_access_folders,
            file_access_blacklist=runtime_settings.file_access_blacklist,
        )
        return result

    async def _ensure_builtin_chrome_devtools_server(self) -> None:
        existing_id = await self.session.scalar(
            select(MCPServer.id).where(MCPServer.name == self._BUILTIN_CHROME_DEVTOOLS_NAME)
        )
        if existing_id:
            return
        try:
            await self.create_server(dict(self._BUILTIN_CHROME_DEVTOOLS_PAYLOAD))
        except IntegrityError:
            # Another concurrent request created it first.
            await self.session.rollback()
