from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any


class ChatChunk(dict):
    pass


class ToolCall(dict):
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

    async def chat_with_tools(
        self,
        messages: list[dict],
        *,
        tools: list[dict[str, Any]],
        tool_choice: str = "auto",
        **kwargs,
    ) -> dict:
        response = await self.chat(messages, **kwargs)
        if "tool_calls" not in response:
            response["tool_calls"] = []
        return response

    async def stream_chat_with_tools(
        self,
        messages: list[dict],
        *,
        tools: list[dict[str, Any]],
        tool_choice: str = "auto",
        **kwargs,
    ) -> AsyncIterator[ChatChunk]:
        response = await self.chat_with_tools(
            messages,
            tools=tools,
            tool_choice=tool_choice,
            **kwargs,
        )
        tool_calls = response.get("tool_calls", []) if isinstance(response, dict) else []
        if isinstance(tool_calls, list) and tool_calls:
            yield ChatChunk(type="tool_calls", tool_calls=tool_calls)

        content = response.get("content", "") if isinstance(response, dict) else ""
        text = content if isinstance(content, str) else str(content)
        for index in range(0, len(text), 32):
            yield ChatChunk(type="token", content=text[index : index + 32])

    @abstractmethod
    async def embed_texts(self, texts: list[str], **kwargs) -> list[list[float]]:
        raise NotImplementedError

    @abstractmethod
    async def test_connection(self) -> dict:
        raise NotImplementedError
