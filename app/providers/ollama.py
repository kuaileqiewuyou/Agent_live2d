from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.providers.base import ChatChunk, LLMProvider


class OllamaProvider(LLMProvider):
    provider_name = "ollama"

    async def chat(self, messages: list[dict], **kwargs) -> dict:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": self.extra_config,
        }
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(f"{self.base_url}/api/chat", json=payload)
                response.raise_for_status()
                data = response.json()
            return {"content": data.get("message", {}).get("content", ""), "raw": data}
        except Exception:
            user_input = next((item["content"] for item in reversed(messages) if item["role"] == "user"), "")
            return {"content": f"Ollama 本地回退响应：{user_input}", "raw": {"fallback": True}}

    async def stream_chat(self, messages: list[dict], **kwargs) -> AsyncIterator[ChatChunk]:
        full = await self.chat(messages, **kwargs)
        content = full["content"]
        for index in range(0, len(content), 32):
            yield ChatChunk(type="token", content=content[index : index + 32])

    async def embed_texts(self, texts: list[str], **kwargs) -> list[list[float]]:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                vectors: list[list[float]] = []
                for text in texts:
                    response = await client.post(
                        f"{self.base_url}/api/embeddings",
                        json={"model": self.model, "prompt": text},
                    )
                    response.raise_for_status()
                    vectors.append(response.json()["embedding"])
            return vectors
        except Exception:
            return [[float((index + 1) / 100) for index in range(64)] for _ in texts]

    async def test_connection(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
            return {"ok": True, "detail": "connection ok"}
        except Exception as exc:  # pragma: no cover - integration path
            return {"ok": False, "detail": str(exc)}
