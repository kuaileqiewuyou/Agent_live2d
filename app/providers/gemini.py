from __future__ import annotations

from collections.abc import AsyncIterator

from app.providers.base import ChatChunk, LLMProvider


class GeminiProvider(LLMProvider):
    provider_name = "gemini"

    async def chat(self, messages: list[dict], **kwargs) -> dict:
        return {
            "content": "Gemini provider adapter is structurally available. Add a reachable Gemini endpoint or proxy to enable it.",
            "raw": {"provider": self.provider_name},
        }

    async def stream_chat(self, messages: list[dict], **kwargs) -> AsyncIterator[ChatChunk]:
        yield ChatChunk(type="token", content=(await self.chat(messages))["content"])

    async def embed_texts(self, texts: list[str], **kwargs) -> list[list[float]]:
        raise NotImplementedError("Gemini embeddings are not configured in this local-first starter.")

    async def test_connection(self) -> dict:
        return {"ok": False, "detail": "Gemini adapter placeholder: supply implementation credentials/endpoints later."}

