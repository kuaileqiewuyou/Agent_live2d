from __future__ import annotations

from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qmodels

from app.config import get_settings


class QdrantMemoryStore:
    def __init__(self) -> None:
        settings = get_settings()
        self.client = AsyncQdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
            check_compatibility=False,
        )
        self.collection_name = settings.qdrant_collection
        self.dimensions = settings.embedding_dimensions

    async def ensure_collection(self) -> None:
        collections = await self.client.get_collections()
        existing = {item.name for item in collections.collections}
        if self.collection_name not in existing:
            await self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=qmodels.VectorParams(size=self.dimensions, distance=qmodels.Distance.COSINE),
            )

    async def upsert_memory(self, *, memory_id: str, vector: list[float], payload: dict) -> str:
        await self.ensure_collection()
        await self.client.upsert(
            collection_name=self.collection_name,
            points=[
                qmodels.PointStruct(
                    id=memory_id,
                    vector=vector,
                    payload=payload,
                )
            ],
        )
        return memory_id

    async def search(self, *, vector: list[float], limit: int, filters: dict | None = None) -> list[dict]:
        await self.ensure_collection()
        query_filter = None
        if filters:
            conditions = [
                qmodels.FieldCondition(key=key, match=qmodels.MatchValue(value=value))
                for key, value in filters.items()
                if value is not None and not isinstance(value, list)
            ]
            if conditions:
                query_filter = qmodels.Filter(must=conditions)

        result = await self.client.search(
            collection_name=self.collection_name,
            query_vector=vector,
            query_filter=query_filter,
            limit=limit,
            with_payload=True,
        )
        return [
            {
                "id": str(item.id),
                "score": item.score,
                "payload": item.payload or {},
            }
            for item in result
        ]

    async def delete_memory(self, *, memory_id: str) -> None:
        await self.ensure_collection()
        await self.client.delete(
            collection_name=self.collection_name,
            points_selector=qmodels.PointIdsList(points=[memory_id]),
        )
