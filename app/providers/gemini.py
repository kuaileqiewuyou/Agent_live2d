from __future__ import annotations

from collections.abc import AsyncIterator
import json
from typing import Any

import httpx

from app.providers.base import ChatChunk, LLMProvider


class GeminiProvider(LLMProvider):
    provider_name = "gemini"

    async def chat(self, messages: list[dict], **kwargs) -> dict:
        payload = self._build_generate_content_payload(messages, include_tools=False, **kwargs)
        try:
            data = await self._request_generate_content(payload)
            return self._parse_generate_content_response(data)
        except Exception:
            user_input = next((item.get("content", "") for item in reversed(messages) if item.get("role") == "user"), "")
            return {
                "content": f"Gemini local fallback: {user_input}",
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
        payload = self._build_generate_content_payload(
            messages,
            include_tools=True,
            tools=tools,
            tool_choice=tool_choice,
            **kwargs,
        )
        try:
            data = await self._request_generate_content(payload)
            return self._parse_generate_content_response(data)
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
        embedding_model = str(kwargs.get("embedding_model", self.extra_config.get("embedding_model", "text-embedding-004")))
        vectors: list[list[float]] = []
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                for text in texts:
                    body = {
                        "content": {
                            "parts": [{"text": text}],
                        }
                    }
                    response = await client.post(
                        self._build_gemini_url(f"/models/{embedding_model}:embedContent"),
                        json=body,
                    )
                    response.raise_for_status()
                    payload = response.json()
                    embedding = payload.get("embedding", {}).get("values") if isinstance(payload, dict) else None
                    if isinstance(embedding, list) and embedding:
                        vectors.append([float(item) for item in embedding])
                    else:
                        vectors.append([float((index + 1) / 100) for index in range(64)])
            return vectors
        except Exception:
            return [[float((index + 1) / 100) for index in range(64)] for _ in texts]

    async def test_connection(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(self._build_gemini_url("/models"))
                response.raise_for_status()
            return {"ok": True, "detail": "connection ok"}
        except Exception as exc:  # pragma: no cover
            return {"ok": False, "detail": str(exc)}

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

    def _build_generate_content_payload(
        self,
        messages: list[dict[str, Any]],
        *,
        include_tools: bool,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str = "auto",
        **kwargs,
    ) -> dict[str, Any]:
        system_lines: list[str] = []
        contents: list[dict[str, Any]] = []
        for item in messages:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "user").strip().lower()
            text = self._stringify_content(item.get("content", "")).strip()
            if not text:
                continue
            if role == "system":
                system_lines.append(text)
                continue
            mapped_role = "model" if role == "assistant" else "user"
            contents.append({"role": mapped_role, "parts": [{"text": text}]})

        payload: dict[str, Any] = {"contents": contents}
        if system_lines:
            payload["systemInstruction"] = {"parts": [{"text": "\n".join(system_lines)}]}

        generation_config = {
            **{k: v for k, v in self.extra_config.items() if k not in {"embedding_model"}},
            **kwargs,
        }
        if generation_config:
            payload["generationConfig"] = generation_config

        if include_tools:
            converted_tools = self._convert_tools(tools or [])
            if converted_tools:
                payload["tools"] = [{"functionDeclarations": converted_tools}]
                payload["toolConfig"] = {
                    "functionCallingConfig": self._map_tool_choice(tool_choice),
                }
        return payload

    @staticmethod
    def _map_tool_choice(tool_choice: str) -> dict[str, Any]:
        normalized = str(tool_choice or "auto").strip().lower()
        if normalized == "none":
            return {"mode": "NONE"}
        if normalized == "required":
            return {"mode": "ANY"}
        if normalized == "auto":
            return {"mode": "AUTO"}
        return {"mode": "ANY", "allowedFunctionNames": [tool_choice]}

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
                    "parameters": function.get("parameters") if isinstance(function.get("parameters"), dict) else {"type": "object"},
                }
            )
        return converted

    def _build_gemini_url(self, path: str) -> str:
        base = self.base_url.rstrip("/")
        normalized_path = path if path.startswith("/") else f"/{path}"
        if not (base.endswith("/v1beta") or "/v1beta" in base):
            base = f"{base}/v1beta"

        url = f"{base}{normalized_path}"
        if self.api_key:
            separator = "&" if "?" in url else "?"
            url = f"{url}{separator}key={self.api_key}"
        return url

    async def _request_generate_content(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                self._build_gemini_url(f"/models/{self.model}:generateContent"),
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    def _parse_generate_content_response(data: dict[str, Any]) -> dict[str, Any]:
        candidates = data.get("candidates") if isinstance(data, dict) else None
        first = candidates[0] if isinstance(candidates, list) and candidates else {}
        content_node = first.get("content") if isinstance(first, dict) else {}
        parts = content_node.get("parts") if isinstance(content_node, dict) else []

        text_parts: list[str] = []
        tool_calls: list[dict[str, Any]] = []
        if isinstance(parts, list):
            for part in parts:
                if not isinstance(part, dict):
                    continue
                text = part.get("text")
                if isinstance(text, str) and text.strip():
                    text_parts.append(text.strip())

                function_call = part.get("functionCall")
                if isinstance(function_call, dict):
                    arguments = function_call.get("args", {})
                    arguments_text = arguments if isinstance(arguments, str) else json.dumps(arguments, ensure_ascii=False)
                    tool_calls.append(
                        {
                            "id": None,
                            "type": "function",
                            "name": function_call.get("name"),
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
