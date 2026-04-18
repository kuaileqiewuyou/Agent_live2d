import asyncio
import json
import logging
from pathlib import Path
import time
from typing import ClassVar

from app.config import get_settings
from app.schemas.app_settings import AppSettingsRead
from app.core.file_access_guard import FileAccessGuard

logger = logging.getLogger(__name__)


class AppSettingsService:
    _lock: ClassVar[asyncio.Lock] = asyncio.Lock()
    _replace_retry_count: ClassVar[int] = 5
    _replace_retry_delay_sec: ClassVar[float] = 0.03

    def __init__(self) -> None:
        settings = get_settings()
        self.file_path = settings.data_dir / "app_settings.json"
        self.defaults = AppSettingsRead()

    async def get_settings(self) -> AppSettingsRead:
        payload = await self._read_payload()
        normalized_payload = self._normalize_settings_payload(payload)
        return AppSettingsRead.model_validate(normalized_payload)

    async def update_settings(self, payload: dict) -> AppSettingsRead:
        async with self._lock:
            current = (await self.get_settings()).model_dump()
            current.update(payload)
            normalized_payload = self._normalize_settings_payload(current)
            normalized = AppSettingsRead.model_validate(normalized_payload)
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

        if not isinstance(data, dict):
            return self.defaults.model_dump()

        if "file_access_allow_all" not in data:
            raw_folders = FileAccessGuard.normalize_folders(data.get("file_access_folders"))
            data["file_access_allow_all"] = len(raw_folders) == 0

        merged = self.defaults.model_dump()
        merged.update(data)
        return merged

    def _normalize_settings_payload(self, payload: dict) -> dict:
        normalized = self.defaults.model_dump()
        payload_dict = payload if isinstance(payload, dict) else {}
        normalized.update(payload_dict)
        normalized["file_access_mode"] = "compat"
        normalized["file_access_folders"] = FileAccessGuard.normalize_folders(
            normalized.get("file_access_folders"),
        )
        normalized["file_access_blacklist"] = FileAccessGuard.normalize_folders(
            normalized.get("file_access_blacklist"),
        )
        allow_all = normalized.get("file_access_allow_all")
        if not isinstance(allow_all, bool):
            allow_all = True
        if "file_access_allow_all" not in payload_dict and "file_access_folders" in payload_dict:
            allow_all = len(normalized["file_access_folders"]) == 0
        normalized["file_access_allow_all"] = allow_all
        return normalized

    async def _write_payload(self, payload: dict) -> None:
        content = json.dumps(payload, ensure_ascii=False, indent=2)
        temp_path = self.file_path.with_suffix(".tmp")

        def _write() -> None:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            temp_path.write_text(content, "utf-8")
            for attempt in range(self._replace_retry_count):
                try:
                    temp_path.replace(self.file_path)
                    return
                except PermissionError:
                    if attempt >= self._replace_retry_count - 1:
                        raise
                    # Windows may briefly lock the target file (e.g. AV/indexing).
                    time.sleep(self._replace_retry_delay_sec * (attempt + 1))

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
