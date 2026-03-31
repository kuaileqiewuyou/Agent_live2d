from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.providers.base import ChatChunk, LLMProvider


class OpenAICompatibleProvider(LLMProvider):
    provider_name = "openai-compatible"

    async def chat(self, messages: list[dict], **kwargs) -> dict:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            **self.extra_config,
            **kwargs,
        }
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
            choice = data["choices"][0]["message"]
            return {"content": choice.get("content", ""), "raw": data}
        except Exception:
            user_input = next((item["content"] for item in reversed(messages) if item["role"] == "user"), "")
            fallback = f"当前处于本地离线回退模式。我已收到你的消息：{user_input}"
            return {"content": fallback, "raw": {"fallback": True}}

    async def stream_chat(self, messages: list[dict], **kwargs) -> AsyncIterator[ChatChunk]:
        full = await self.chat(messages, **kwargs)
        content = full["content"]
        for index in range(0, len(content), 32):
            yield ChatChunk(type="token", content=content[index : index + 32])

    async def embed_texts(self, texts: list[str], **kwargs) -> list[list[float]]:
        payload = {
            "model": kwargs.get("embedding_model", self.extra_config.get("embedding_model", self.model)),
            "input": texts,
        }
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    f"{self.base_url}/embeddings",
                    headers=self._headers(),
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
            return [item["embedding"] for item in data["data"]]
        except Exception:
            return [[float((index + 1) / 100) for index in range(64)] for _ in texts]

    async def test_connection(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers=self._headers(),
                )
                response.raise_for_status()
            return {"ok": True, "detail": "connection ok"}
        except Exception as exc:  # pragma: no cover - integration path
            return {"ok": False, "detail": str(exc)}

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers
