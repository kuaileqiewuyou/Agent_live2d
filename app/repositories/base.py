from typing import Any, Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError

ModelT = TypeVar("ModelT")


class SQLAlchemyRepository(Generic[ModelT]):
    def __init__(self, session: AsyncSession, model: type[ModelT]) -> None:
        self.session = session
        self.model = model

    async def list(self) -> list[ModelT]:
        result = await self.session.execute(select(self.model))
        return list(result.scalars().unique().all())

    async def get(self, entity_id: str, *, resource_name: str) -> ModelT:
        entity = await self.session.get(self.model, entity_id)
        if entity is None:
            raise NotFoundError(resource_name)
        return entity

    async def create(self, payload: dict[str, Any]) -> ModelT:
        entity = self.model(**payload)
        self.session.add(entity)
        await self.session.flush()
        await self.session.refresh(entity)
        return entity

    async def update(self, entity: ModelT, payload: dict[str, Any]) -> ModelT:
        for key, value in payload.items():
            setattr(entity, key, value)
        await self.session.flush()
        await self.session.refresh(entity)
        return entity

    async def delete(self, entity: ModelT) -> None:
        await self.session.delete(entity)
        await self.session.flush()

