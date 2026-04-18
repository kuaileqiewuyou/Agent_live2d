from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class RuntimeSessionHandle:
    key: str
    transport: str
    created_at: float = 0.0
    last_used_at: float = 0.0
    reuse_count: int = 0
    recreate_count: int = 0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def close(self) -> None:
        raise NotImplementedError


class MCPRuntimePool:
    def __init__(
        self,
        *,
        idle_ttl_seconds: float = 600.0,
        max_sessions: int = 32,
        now_fn: Callable[[], float] | None = None,
    ) -> None:
        self.idle_ttl_seconds = max(float(idle_ttl_seconds), 1.0)
        self.max_sessions = max(int(max_sessions), 1)
        self._now_fn = now_fn or time.monotonic
        self._sessions: dict[str, RuntimeSessionHandle] = {}
        self._lock = asyncio.Lock()

    async def acquire(
        self,
        key: str,
        create_session: Callable[[], Awaitable[RuntimeSessionHandle]],
    ) -> tuple[RuntimeSessionHandle, bool]:
        expired: list[RuntimeSessionHandle] = []
        overflow: list[RuntimeSessionHandle] = []
        now = self._now_fn()

        async with self._lock:
            expired = self._collect_expired_locked(now)
            session = self._sessions.get(key)
            if session is not None:
                session.last_used_at = now
                session.reuse_count += 1
                reused = True
                logger.debug(
                    "mcp runtime pool reuse: transport=%s id=%s reuse_count=%d",
                    session.transport,
                    self._session_id(key),
                    session.reuse_count,
                )
            else:
                session = await create_session()
                session.created_at = now
                session.last_used_at = now
                self._sessions[key] = session
                reused = False
                logger.info(
                    "mcp runtime pool create: transport=%s id=%s active=%d",
                    session.transport,
                    self._session_id(key),
                    len(self._sessions),
                )
            overflow = self._collect_overflow_locked()

        if expired:
            logger.info("mcp runtime pool ttl-evict: count=%d", len(expired))
        if overflow:
            logger.info("mcp runtime pool lru-evict: count=%d", len(overflow))
        await self._close_sessions(expired + overflow)
        return session, reused

    async def invalidate(self, key: str) -> bool:
        async with self._lock:
            session = self._sessions.pop(key, None)
        if session is None:
            return False
        logger.warning(
            "mcp runtime pool invalidate: transport=%s id=%s",
            session.transport,
            self._session_id(key),
        )
        await session.close()
        return True

    async def close_all(self) -> None:
        async with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        if sessions:
            logger.info("mcp runtime pool close-all: count=%d", len(sessions))
        await self._close_sessions(sessions)

    async def collect_expired(self) -> int:
        async with self._lock:
            expired = self._collect_expired_locked(self._now_fn())
        if expired:
            logger.info("mcp runtime pool collect-expired: count=%d", len(expired))
        await self._close_sessions(expired)
        return len(expired)

    def snapshot(self) -> list[dict]:
        now = self._now_fn()
        return [
            {
                "key": key,
                "transport": session.transport,
                "reuseCount": session.reuse_count,
                "recreateCount": session.recreate_count,
                "idleSeconds": max(0.0, now - session.last_used_at),
            }
            for key, session in self._sessions.items()
        ]

    def _collect_expired_locked(self, now: float) -> list[RuntimeSessionHandle]:
        expired_keys = [
            key
            for key, session in self._sessions.items()
            if now - session.last_used_at > self.idle_ttl_seconds
        ]
        expired: list[RuntimeSessionHandle] = []
        for key in expired_keys:
            session = self._sessions.pop(key, None)
            if session is not None:
                expired.append(session)
        return expired

    def _collect_overflow_locked(self) -> list[RuntimeSessionHandle]:
        overflow_count = len(self._sessions) - self.max_sessions
        if overflow_count <= 0:
            return []
        stale_sessions = sorted(
            self._sessions.values(),
            key=lambda item: item.last_used_at,
        )[:overflow_count]
        removed: list[RuntimeSessionHandle] = []
        for session in stale_sessions:
            popped = self._sessions.pop(session.key, None)
            if popped is not None:
                removed.append(popped)
        return removed

    async def _close_sessions(self, sessions: list[RuntimeSessionHandle]) -> None:
        if not sessions:
            return
        for session in sessions:
            try:
                await session.close()
            except Exception as exc:
                # Runtime close failure should not block request path.
                logger.warning(
                    "mcp runtime pool close-session failed: transport=%s id=%s error=%s",
                    session.transport,
                    self._session_id(session.key),
                    exc,
                )

    @staticmethod
    def _session_id(key: str) -> str:
        digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
        return digest[:8]
