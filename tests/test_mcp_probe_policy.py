from __future__ import annotations

import asyncio

from app.mcp.client import MCPClientManager


def test_http_probe_retries_then_succeeds(monkeypatch):
    manager = MCPClientManager(max_attempts=3, retry_backoff_seconds=0)
    attempts = {"count": 0}

    async def fake_probe(_endpoint: str):
        attempts["count"] += 1
        if attempts["count"] < 2:
            return manager._build_result(ok=False, detail="http timeout after 8.0s")
        return manager._build_result(
            ok=True,
            detail="HTTP endpoint reachable",
            tools=[{"name": "echo"}],
        )

    monkeypatch.setattr(manager, "_inspect_http_once", fake_probe)
    result = asyncio.run(
        manager.inspect_server(transport_type="http", endpoint_or_command="http://example.com"),
    )

    assert result["ok"] is True
    assert result["attempts"] == 2
    assert attempts["count"] == 2
    assert len(result["tools"]) == 1


def test_http_probe_exhausts_retries_with_unified_detail(monkeypatch):
    manager = MCPClientManager(max_attempts=3, retry_backoff_seconds=0)

    async def always_fail(_endpoint: str):
        return manager._build_result(ok=False, detail="http request error: connection refused")

    monkeypatch.setattr(manager, "_inspect_http_once", always_fail)
    result = asyncio.run(
        manager.inspect_server(transport_type="http", endpoint_or_command="http://127.0.0.1:65535"),
    )

    assert result["ok"] is False
    assert result["attempts"] == 3
    assert "after 3 attempts" in result["detail"]


def test_unsupported_transport_returns_error_without_retry():
    manager = MCPClientManager(max_attempts=3, retry_backoff_seconds=0)
    result = asyncio.run(
        manager.inspect_server(transport_type="socket", endpoint_or_command="ignored"),
    )

    assert result["ok"] is False
    assert result["status"] == "error"
    assert result["attempts"] == 1
    assert "unsupported transport_type" in result["detail"]
