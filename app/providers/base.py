from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class ChatChunk(dict):
    pass


class LLMProvider(ABC):
    provider_name: str

    def __init__(self, *, base_url: str, api_key: str | None, model: str, extra_config: dict | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.extra_config = extra_config or {}

    @abstractmethod
    async def chat(self, messages: list[dict], **kwargs) -> dict:
        raise NotImplementedError

    @abstractmethod
    async def stream_chat(self, messages: list[dict], **kwargs) -> AsyncIterator[ChatChunk]:
        raise NotImplementedError

    @abstractmethod
    async def embed_texts(self, texts: list[str], **kwargs) -> list[list[float]]:
        raise NotImplementedError

    @abstractmethod
    async def test_connection(self) -> dict:
        raise NotImplementedError

