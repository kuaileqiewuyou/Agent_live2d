from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx


class MCPClientManager:
    async def inspect_server(self, *, transport_type: str, endpoint_or_command: str) -> dict:
        if transport_type == "http":
            return await self._inspect_http(endpoint_or_command)
        return await self._inspect_stdio(endpoint_or_command)

    async def _inspect_http(self, endpoint: str) -> dict:
        detail = "HTTP endpoint reachable"
        tools: list[dict] = []
        resources: list[dict] = []
        prompts: list[dict] = []
        status = "connected"
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.get(endpoint)
                response.raise_for_status()
                body = response.json() if "application/json" in response.headers.get("content-type", "") else {}
            tools = body.get("tools", [])
            resources = body.get("resources", [])
            prompts = body.get("prompts", [])
            detail = body.get("detail", detail)
        except Exception as exc:
            status = "error"
            detail = str(exc)
        return {
            "ok": status == "connected",
            "status": status,
            "detail": detail,
            "tools": tools,
            "resources": resources,
            "prompts": prompts,
            "checked_at": datetime.now(timezone.utc),
        }

    async def _inspect_stdio(self, command: str) -> dict:
        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.wait_for(process.communicate(), timeout=5)
            ok = process.returncode in (0, 1)
            detail = f"Process exited with code {process.returncode}"
        except Exception as exc:
            ok = False
            detail = str(exc)
        return {
            "ok": ok,
            "status": "connected" if ok else "error",
            "detail": detail,
            "tools": [],
            "resources": [],
            "prompts": [],
            "checked_at": datetime.now(timezone.utc),
        }
