import asyncio
import json
import logging
from pathlib import Path
from typing import ClassVar

from app.config import get_settings
from app.schemas.app_settings import AppSettingsRead

logger = logging.getLogger(__name__)


class AppSettingsService:
    _lock: ClassVar[asyncio.Lock] = asyncio.Lock()

    def __init__(self) -> None:
        settings = get_settings()
        self.file_path = settings.data_dir / "app_settings.json"
        self.defaults = AppSettingsRead()

    async def get_settings(self) -> AppSettingsRead:
        payload = await self._read_payload()
        return AppSettingsRead.model_validate(payload)

    async def update_settings(self, payload: dict) -> AppSettingsRead:
        async with self._lock:
            current = (await self.get_settings()).model_dump()
            current.update(payload)
            normalized = AppSettingsRead.model_validate(current)
            await self._write_payload(normalized.model_dump(by_alias=False))
            return normalized

    async def _read_payload(self) -> dict:
        if not self.file_path.exists():
            return self.defaults.model_dump()

        raw = await asyncio.to_thread(self.file_path.read_text, "utf-8")
        if not raw.strip():
            return self.defaults.model_dump()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            await self._backup_corrupted_file(raw)
            return self.defaults.model_dump()

        merged = self.defaults.model_dump()
        merged.update(data)
        return merged

    async def _write_payload(self, payload: dict) -> None:
        content = json.dumps(payload, ensure_ascii=False, indent=2)
        temp_path = self.file_path.with_suffix(".tmp")

        def _write() -> None:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            temp_path.write_text(content, "utf-8")
            temp_path.replace(self.file_path)

        await asyncio.to_thread(_write)

    async def _backup_corrupted_file(self, raw: str) -> None:
        suffix = asyncio.get_running_loop().time()
        backup_name = f"{self.file_path.stem}.corrupt-{int(suffix * 1000)}{self.file_path.suffix}"
        backup_path = self.file_path.with_name(backup_name)

        logger.warning("Detected corrupted app settings file, backing up to %s", backup_path)

        def _backup() -> None:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            backup_path.write_text(raw, "utf-8")

        await asyncio.to_thread(_backup)
