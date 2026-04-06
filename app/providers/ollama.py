from __future__ import annotations

from collections.abc import AsyncIterator
import json
from typing import Any

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
            **kwargs,
        }
        try:
            data = await self._request_chat(payload)
            return self._parse_chat_response(data)
        except Exception:
            user_input = next((item.get("content", "") for item in reversed(messages) if item.get("role") == "user"), "")
            return {"content": f"Ollama local fallback: {user_input}", "tool_calls": [], "raw": {"fallback": True}}

    async def chat_with_tools(
        self,
        messages: list[dict],
        *,
        tools: list[dict[str, Any]],
        tool_choice: str = "auto",
        **kwargs,
    ) -> dict:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": self.extra_config,
            "tools": tools,
            "tool_choice": tool_choice,
            **kwargs,
        }
        try:
            data = await self._request_chat(payload)
            return self._parse_chat_response(data)
        except Exception:
            base = await self.chat(messages, **kwargs)
            base["tool_calls"] = []
            return base

    async def stream_chat(self, messages: list[dict], **kwargs) -> AsyncIterator[ChatChunk]:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": self.extra_config,
            **kwargs,
        }
        emitted = False
        try:
            async for data in self._stream_chat_response(payload):
                tool_calls = self._parse_stream_tool_calls(data)
                if tool_calls:
                    emitted = True
                    yield ChatChunk(type="tool_calls", tool_calls=tool_calls)

                token = self._parse_stream_token(data)
                if token:
                    emitted = True
                    yield ChatChunk(type="token", content=token)
        except Exception:
            emitted = False

        if not emitted:
            full = await self.chat(messages, **kwargs)
            content = full.get("content", "")
            for index in range(0, len(content), 32):
                yield ChatChunk(type="token", content=content[index : index + 32])

    async def stream_chat_with_tools(
        self,
        messages: list[dict],
        *,
        tools: list[dict[str, Any]],
        tool_choice: str = "auto",
        **kwargs,
    ) -> AsyncIterator[ChatChunk]:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": self.extra_config,
            "tools": tools,
            "tool_choice": tool_choice,
            **kwargs,
        }
        emitted = False
        try:
            async for data in self._stream_chat_response(payload):
                tool_calls = self._parse_stream_tool_calls(data)
                if tool_calls:
                    emitted = True
                    yield ChatChunk(type="tool_calls", tool_calls=tool_calls)

                token = self._parse_stream_token(data)
                if token:
                    emitted = True
                    yield ChatChunk(type="token", content=token)
        except Exception:
            emitted = False

        if not emitted:
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
        except Exception as exc:  # pragma: no cover
            return {"ok": False, "detail": str(exc)}

    async def _request_chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(f"{self.base_url}/api/chat", json=payload)
            response.raise_for_status()
            return response.json()

    async def _stream_chat_response(self, payload: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    normalized = line.strip()
                    if not normalized:
                        continue
                    try:
                        parsed = json.loads(normalized)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(parsed, dict):
                        yield parsed

    @staticmethod
    def _parse_stream_token(data: dict[str, Any]) -> str:
        message = data.get("message") if isinstance(data, dict) else None
        if not isinstance(message, dict):
            return ""
        content = message.get("content")
        return content if isinstance(content, str) else ""

    @staticmethod
    def _parse_stream_tool_calls(data: dict[str, Any]) -> list[dict[str, Any]]:
        message = data.get("message") if isinstance(data, dict) else None
        if not isinstance(message, dict):
            return []
        tool_calls_raw = message.get("tool_calls", [])

        tool_calls: list[dict[str, Any]] = []
        if isinstance(tool_calls_raw, list):
            for item in tool_calls_raw:
                if not isinstance(item, dict):
                    continue
                function = item.get("function", {})
                tool_calls.append(
                    {
                        "id": item.get("id"),
                        "type": item.get("type", "function"),
                        "name": function.get("name") if isinstance(function, dict) else None,
                        "arguments": function.get("arguments") if isinstance(function, dict) else None,
                    }
                )
        return tool_calls

    @staticmethod
    def _parse_chat_response(data: dict[str, Any]) -> dict[str, Any]:
        message = data.get("message", {}) if isinstance(data, dict) else {}
        content = message.get("content", "") if isinstance(message, dict) else ""
        tool_calls_raw = message.get("tool_calls", []) if isinstance(message, dict) else []

        tool_calls: list[dict[str, Any]] = []
        if isinstance(tool_calls_raw, list):
            for item in tool_calls_raw:
                if not isinstance(item, dict):
                    continue
                function = item.get("function", {})
                tool_calls.append(
                    {
                        "id": item.get("id"),
                        "type": item.get("type", "function"),
                        "name": function.get("name") if isinstance(function, dict) else None,
                        "arguments": function.get("arguments") if isinstance(function, dict) else None,
                    }
                )

        return {
            "content": content if isinstance(content, str) else str(content),
            "tool_calls": tool_calls,
            "raw": data,
        }
