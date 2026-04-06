from __future__ import annotations

from collections.abc import AsyncIterator
import json
from typing import Any

import httpx

from app.providers.base import ChatChunk, LLMProvider


class AnthropicProvider(LLMProvider):
    provider_name = "anthropic"

    async def chat(self, messages: list[dict], **kwargs) -> dict:
        payload = self._build_messages_payload(messages, include_tools=False, **kwargs)
        try:
            data = await self._request_messages(payload)
            return self._parse_messages_response(data)
        except Exception:
            user_input = next((item.get("content", "") for item in reversed(messages) if item.get("role") == "user"), "")
            return {
                "content": f"Anthropic local fallback: {user_input}",
                "tool_calls": [],
                "raw": {"fallback": True},
            }

    async def chat_with_tools(
        self,
        messages: list[dict],
        *,
        tools: list[dict[str, Any]],
        tool_choice: str = "auto",
        **kwargs,
    ) -> dict:
        payload = self._build_messages_payload(
            messages,
            include_tools=True,
            tools=tools,
            tool_choice=tool_choice,
            **kwargs,
        )
        try:
            data = await self._request_messages(payload)
            return self._parse_messages_response(data)
        except Exception:
            base = await self.chat(messages, **kwargs)
            base["tool_calls"] = []
            return base

    async def stream_chat(self, messages: list[dict], **kwargs) -> AsyncIterator[ChatChunk]:
        full = await self.chat(messages, **kwargs)
        content = full.get("content", "")
        for index in range(0, len(content), 32):
            yield ChatChunk(type="token", content=content[index : index + 32])

    async def embed_texts(self, texts: list[str], **kwargs) -> list[list[float]]:
        # Anthropic does not provide a public embeddings endpoint in this project scope.
        return [[float((index + 1) / 100) for index in range(64)] for _ in texts]

    async def test_connection(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(f"{self.base_url}/models", headers=self._headers())
                response.raise_for_status()
            return {"ok": True, "detail": "connection ok"}
        except Exception as exc:  # pragma: no cover
            return {"ok": False, "detail": str(exc)}

    def _headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "anthropic-version": str(self.extra_config.get("anthropic_version", "2023-06-01")),
        }
        if self.api_key:
            headers["x-api-key"] = self.api_key
        beta_value = self.extra_config.get("anthropic_beta")
        if isinstance(beta_value, str) and beta_value.strip():
            headers["anthropic-beta"] = beta_value.strip()
        return headers

    @staticmethod
    def _stringify_content(content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        parts.append(text.strip())
                elif isinstance(item, str) and item.strip():
                    parts.append(item.strip())
            return "\n".join(parts)
        return str(content)

    @staticmethod
    def _map_tool_choice(tool_choice: str) -> dict[str, Any]:
        normalized = str(tool_choice or "auto").strip().lower()
        if normalized == "none":
            return {"type": "none"}
        if normalized == "required":
            return {"type": "any"}
        if normalized == "auto":
            return {"type": "auto"}
        return {"type": "tool", "name": tool_choice}

    def _convert_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        converted: list[dict[str, Any]] = []
        for item in tools:
            if not isinstance(item, dict):
                continue
            function = item.get("function")
            if not isinstance(function, dict):
                continue
            name = function.get("name")
            if not isinstance(name, str) or not name.strip():
                continue
            converted.append(
                {
                    "name": name.strip(),
                    "description": str(function.get("description") or "").strip(),
                    "input_schema": function.get("parameters") if isinstance(function.get("parameters"), dict) else {"type": "object"},
                }
            )
        return converted

    def _build_messages_payload(
        self,
        messages: list[dict[str, Any]],
        *,
        include_tools: bool,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str = "auto",
        **kwargs,
    ) -> dict[str, Any]:
        system_lines: list[str] = []
        anthropic_messages: list[dict[str, str]] = []
        for item in messages:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "user").strip().lower()
            content = self._stringify_content(item.get("content", ""))
            if role == "system":
                if content.strip():
                    system_lines.append(content.strip())
                continue
            mapped_role = "assistant" if role == "assistant" else "user"
            anthropic_messages.append({"role": mapped_role, "content": content})

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": anthropic_messages,
            "max_tokens": int(kwargs.pop("max_tokens", self.extra_config.get("max_tokens", 1024))),
        }
        if system_lines:
            payload["system"] = "\n".join(system_lines)

        for key, value in self.extra_config.items():
            if key in {"anthropic_version", "anthropic_beta", "max_tokens"}:
                continue
            payload.setdefault(key, value)
        payload.update(kwargs)

        if include_tools:
            normalized_tools = self._convert_tools(tools or [])
            if normalized_tools:
                payload["tools"] = normalized_tools
                payload["tool_choice"] = self._map_tool_choice(tool_choice)
        return payload

    async def _request_messages(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.base_url}/messages",
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    def _parse_messages_response(data: dict[str, Any]) -> dict[str, Any]:
        blocks = data.get("content") if isinstance(data, dict) else None
        text_parts: list[str] = []
        tool_calls: list[dict[str, Any]] = []
        if isinstance(blocks, list):
            for block in blocks:
                if not isinstance(block, dict):
                    continue
                block_type = str(block.get("type") or "").strip()
                if block_type == "text":
                    text = block.get("text")
                    if isinstance(text, str) and text.strip():
                        text_parts.append(text.strip())
                elif block_type == "tool_use":
                    arguments = block.get("input", {})
                    arguments_text = arguments if isinstance(arguments, str) else json.dumps(arguments, ensure_ascii=False)
                    tool_calls.append(
                        {
                            "id": block.get("id"),
                            "type": "function",
                            "name": block.get("name"),
                            "arguments": arguments_text,
                        }
                    )
        content = "\n".join(text_parts).strip()
        if not content and tool_calls:
            content = "tool call requested"
        return {
            "content": content,
            "tool_calls": tool_calls,
            "raw": data,
        }
