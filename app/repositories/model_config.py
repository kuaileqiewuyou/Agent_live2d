from sqlalchemy import select, update

from app.db.models import ModelConfig
from app.repositories.base import SQLAlchemyRepository


class ModelConfigRepository(SQLAlchemyRepository[ModelConfig]):
    def __init__(self, session):
        super().__init__(session, ModelConfig)

    async def clear_default(self) -> None:
        await self.session.execute(update(ModelConfig).values(is_default=False))
        await self.session.flush()

    async def get_default(self) -> ModelConfig | None:
        result = await self.session.execute(select(ModelConfig).where(ModelConfig.is_default.is_(True)))
        return result.scalars().first()

