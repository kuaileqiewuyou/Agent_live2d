from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx


class MCPClientManager:
    def __init__(
        self,
        *,
        http_timeout_seconds: float = 8.0,
        stdio_timeout_seconds: float = 5.0,
        max_attempts: int = 2,
        retry_backoff_seconds: float = 0.4,
    ) -> None:
        self.http_timeout_seconds = max(http_timeout_seconds, 0.1)
        self.stdio_timeout_seconds = max(stdio_timeout_seconds, 0.1)
        self.max_attempts = max(max_attempts, 1)
        self.retry_backoff_seconds = max(retry_backoff_seconds, 0.0)

    async def inspect_server(self, *, transport_type: str, endpoint_or_command: str) -> dict:
        if transport_type == "http":
            return await self._probe_with_retry(
                lambda: self._inspect_http_once(endpoint_or_command),
            )
        if transport_type == "stdio":
            return await self._probe_with_retry(
                lambda: self._inspect_stdio_once(endpoint_or_command),
            )
        return self._build_result(
            ok=False,
            detail=f"unsupported transport_type: {transport_type}",
        )

    def _build_result(
        self,
        *,
        ok: bool,
        detail: str,
        status: str | None = None,
        tools: list[dict] | None = None,
        resources: list[dict] | None = None,
        prompts: list[dict] | None = None,
        attempts: int = 1,
    ) -> dict:
        return {
            "ok": ok,
            "status": status or ("connected" if ok else "error"),
            "detail": detail,
            "tools": tools if isinstance(tools, list) else [],
            "resources": resources if isinstance(resources, list) else [],
            "prompts": prompts if isinstance(prompts, list) else [],
            "checked_at": datetime.now(timezone.utc),
            "attempts": attempts,
        }

    async def _probe_with_retry(self, probe) -> dict:
        last_result: dict | None = None
        for attempt in range(1, self.max_attempts + 1):
            result = await probe()
            result["attempts"] = attempt
            last_result = result
            if result.get("ok"):
                return result
            if attempt < self.max_attempts and self.retry_backoff_seconds > 0:
                await asyncio.sleep(self.retry_backoff_seconds)

        if last_result is None:
            return self._build_result(
                ok=False,
                detail=f"probe failed after {self.max_attempts} attempts",
                attempts=self.max_attempts,
            )

        if not last_result.get("ok") and self.max_attempts > 1:
            detail = str(last_result.get("detail") or "probe failed")
            if "after" not in detail and "attempt" not in detail:
                detail = f"{detail} (after {self.max_attempts} attempts)"
            last_result["detail"] = detail
        return last_result

    async def _inspect_http_once(self, endpoint: str) -> dict:
        detail = "HTTP endpoint reachable"
        tools: list[dict] = []
        resources: list[dict] = []
        prompts: list[dict] = []
        status = "connected"
        try:
            async with httpx.AsyncClient(timeout=self.http_timeout_seconds) as client:
                response = await client.get(endpoint)
                response.raise_for_status()
                body = response.json() if "application/json" in response.headers.get("content-type", "") else {}
            tools = body.get("tools", [])
            resources = body.get("resources", [])
            prompts = body.get("prompts", [])
            detail = body.get("detail", detail)
        except httpx.TimeoutException:
            status = "error"
            detail = f"http timeout after {self.http_timeout_seconds:.1f}s"
        except httpx.HTTPStatusError as exc:
            status = "error"
            detail = f"http status error: {exc.response.status_code}"
        except httpx.RequestError as exc:
            status = "error"
            detail = f"http request error: {exc}"
        except Exception as exc:
            status = "error"
            detail = str(exc)
        return self._build_result(
            ok=status == "connected",
            status=status,
            detail=detail,
            tools=tools,
            resources=resources,
            prompts=prompts,
        )

    async def _inspect_stdio_once(self, command: str) -> dict:
        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=self.stdio_timeout_seconds,
            )
            ok = process.returncode in (0, 1)
            if ok:
                detail = f"process exited with code {process.returncode}"
            else:
                stderr_text = stderr.decode(errors="ignore").strip() if stderr else ""
                detail = stderr_text or f"process exited with code {process.returncode}"
        except asyncio.TimeoutError:
            ok = False
            detail = f"stdio timeout after {self.stdio_timeout_seconds:.1f}s"
        except Exception as exc:
            ok = False
            detail = str(exc)
        return self._build_result(ok=ok, detail=detail)
