from sqlalchemy.ext.asyncio import AsyncSession

from app.providers import ProviderFactory
from app.repositories import ModelConfigRepository


class ModelConfigService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ModelConfigRepository(session)

    async def list_configs(self):
        return await self.repo.list()

    async def create_config(self, payload: dict):
        if payload.get("is_default"):
            await self.repo.clear_default()
        entity = await self.repo.create(payload)
        await self.session.commit()
        return entity

    async def get_config(self, config_id: str):
        return await self.repo.get(config_id, resource_name="model config")

    async def update_config(self, config_id: str, payload: dict):
        entity = await self.get_config(config_id)
        if payload.get("is_default"):
            await self.repo.clear_default()
        entity = await self.repo.update(entity, payload)
        await self.session.commit()
        return entity

    async def delete_config(self, config_id: str):
        entity = await self.get_config(config_id)
        await self.repo.delete(entity)
        await self.session.commit()

    async def test_connection(self, config_id: str) -> dict:
        config = await self.get_config(config_id)
        provider = ProviderFactory.from_model_config(config)
        result = await provider.test_connection()
        return {
            "ok": result["ok"],
            "provider": config.provider,
            "model": config.model,
            "detail": result["detail"],
        }

