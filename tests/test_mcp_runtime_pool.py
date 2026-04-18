from __future__ import annotations

import asyncio

from app.mcp.runtime_pool import MCPRuntimePool, RuntimeSessionHandle


class _FakeSession(RuntimeSessionHandle):
    def __init__(self, *, key: str, transport: str = "http") -> None:
        super().__init__(key=key, transport=transport)
        self.closed = False

    async def close(self) -> None:
        self.closed = True


def test_runtime_pool_reuses_existing_session():
    pool = MCPRuntimePool(idle_ttl_seconds=600, max_sessions=8)
    create_count = {"value": 0}

    async def create_fake() -> RuntimeSessionHandle:
        create_count["value"] += 1
        return _FakeSession(key="k1")

    async def run():
        first, reused_first = await pool.acquire("k1", create_fake)
        second, reused_second = await pool.acquire("k1", create_fake)
        return first, second, reused_first, reused_second

    first, second, reused_first, reused_second = asyncio.run(run())
    assert create_count["value"] == 1
    assert first is second
    assert reused_first is False
    assert reused_second is True


def test_runtime_pool_ttl_collect_expired():
    now_ref = {"value": 1000.0}
    pool = MCPRuntimePool(
        idle_ttl_seconds=10,
        max_sessions=8,
        now_fn=lambda: now_ref["value"],
    )

    async def create_fake() -> RuntimeSessionHandle:
        return _FakeSession(key="k1")

    async def run():
        session, _ = await pool.acquire("k1", create_fake)
        now_ref["value"] += 11
        removed = await pool.collect_expired()
        return session, removed

    session, removed = asyncio.run(run())
    assert removed == 1
    assert session.closed is True
    assert pool.snapshot() == []


def test_runtime_pool_evicts_lru_when_capacity_exceeded():
    now_ref = {"value": 1000.0}
    pool = MCPRuntimePool(
        idle_ttl_seconds=600,
        max_sessions=1,
        now_fn=lambda: now_ref["value"],
    )
    created_sessions: dict[str, _FakeSession] = {}

    async def create_k1() -> RuntimeSessionHandle:
        session = _FakeSession(key="k1")
        created_sessions["k1"] = session
        return session

    async def create_k2() -> RuntimeSessionHandle:
        session = _FakeSession(key="k2")
        created_sessions["k2"] = session
        return session

    async def run():
        await pool.acquire("k1", create_k1)
        now_ref["value"] += 1
        await pool.acquire("k2", create_k2)

    asyncio.run(run())
    assert created_sessions["k1"].closed is True
    assert created_sessions["k2"].closed is False
    snapshot = pool.snapshot()
    assert len(snapshot) == 1
    assert snapshot[0]["key"] == "k2"
