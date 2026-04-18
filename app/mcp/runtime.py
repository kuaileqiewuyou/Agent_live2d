from __future__ import annotations

from threading import Lock

from app.mcp.client import MCPClientManager

_manager: MCPClientManager | None = None
_lock = Lock()


def get_mcp_client_manager() -> MCPClientManager:
    global _manager
    with _lock:
        if _manager is None:
            _manager = MCPClientManager()
        return _manager


async def shutdown_mcp_runtime() -> None:
    global _manager
    with _lock:
        manager = _manager
        _manager = None
    if manager is not None:
        await manager.close_runtime()
