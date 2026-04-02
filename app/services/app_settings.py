import asyncio
import json
from pathlib import Path

from app.config import get_settings
from app.schemas.app_settings import AppSettingsRead


class AppSettingsService:
    def __init__(self) -> None:
        settings = get_settings()
        self.file_path = settings.data_dir / "app_settings.json"
        self.defaults = AppSettingsRead()

    async def get_settings(self) -> AppSettingsRead:
        payload = await self._read_payload()
        return AppSettingsRead.model_validate(payload)

    async def update_settings(self, payload: dict) -> AppSettingsRead:
        current = (await self.get_settings()).model_dump()
        current.update(payload)
        normalized = AppSettingsRead.model_validate(current)
        await asyncio.to_thread(
            self.file_path.write_text,
            json.dumps(normalized.model_dump(by_alias=False), ensure_ascii=False, indent=2),
            "utf-8",
        )
        return normalized

    async def _read_payload(self) -> dict:
        if not self.file_path.exists():
            return self.defaults.model_dump()

        raw = await asyncio.to_thread(self.file_path.read_text, "utf-8")
        if not raw.strip():
            return self.defaults.model_dump()

        data = json.loads(raw)
        merged = self.defaults.model_dump()
        merged.update(data)
        return merged
