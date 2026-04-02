from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel

ThemeMode = Literal["light", "dark", "system"]
LayoutMode = Literal["chat", "companion"]


class AppSettingsRead(CamelModel):
    theme: ThemeMode = "system"
    background_image: str | None = Field(default=None)
    background_blur: int = 0
    background_overlay_opacity: float = 0.5
    default_layout_mode: LayoutMode = "chat"
    language: str = "zh-CN"


class AppSettingsUpdate(CamelModel):
    theme: ThemeMode | None = None
    background_image: str | None = None
    background_blur: int | None = None
    background_overlay_opacity: float | None = None
    default_layout_mode: LayoutMode | None = None
    language: str | None = None
