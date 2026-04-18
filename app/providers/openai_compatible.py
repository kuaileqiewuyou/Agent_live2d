from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
import json
from typing import Any

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
            data = await self._request_chat_completion(payload)
            return self._parse_chat_response(data)
        except Exception as exc:
            detail = self._extract_error_detail(exc)
            raise RuntimeError(f"OpenAI-compatible chat request failed: {detail}") from exc

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
            "tools": tools,
            "tool_choice": tool_choice,
            **self.extra_config,
            **kwargs,
        }
        try:
            data = await self._request_chat_completion(payload)
            return self._parse_chat_response(data)
        except Exception as exc:
            detail = self._extract_error_detail(exc)
            raise RuntimeError(f"OpenAI-compatible tool-call request failed: {detail}") from exc

    async def stream_chat(self, messages: list[dict], **kwargs) -> AsyncIterator[ChatChunk]:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            **self.extra_config,
            **kwargs,
        }
        emitted_token = False
        saw_stream_activity = False
        stream_error: Exception | None = None
        try:
            async for chunk in self._stream_chat_completion(payload):
                tool_calls = self._parse_stream_tool_calls(chunk)
                if tool_calls:
                    saw_stream_activity = True
                    yield ChatChunk(type="tool_calls", tool_calls=tool_calls)

                token = self._parse_stream_token(chunk)
                if token:
                    emitted_token = True
                    saw_stream_activity = True
                    yield ChatChunk(type="token", content=token)
        except Exception as exc:
            stream_error = exc

        if emitted_token:
            return

        try:
            # Some OpenAI-compatible gateways return non-standard stream chunks
            # or disable stream=true. Fallback to non-stream response and emit
            # chunked tokens so frontend still gets incremental rendering.
            fallback = await self.chat(messages, **kwargs)
        except Exception as fallback_exc:
            fallback_detail = self._extract_error_detail(fallback_exc)
            if stream_error is not None:
                stream_detail = self._extract_error_detail(stream_error)
                raise RuntimeError(
                    "OpenAI-compatible stream request failed: "
                    f"{stream_detail}; non-stream fallback failed: {fallback_detail}"
                ) from fallback_exc
            raise RuntimeError(f"OpenAI-compatible stream request failed: {fallback_detail}") from fallback_exc
        fallback_content = str(fallback.get("content") or "")
        fallback_tool_calls = fallback.get("tool_calls") if isinstance(fallback, dict) else []
        if (not saw_stream_activity) and isinstance(fallback_tool_calls, list) and fallback_tool_calls:
            yield ChatChunk(type="tool_calls", tool_calls=fallback_tool_calls)

        if fallback_content:
            async for token_chunk in self._emit_chunked_tokens(fallback_content):
                yield token_chunk
            return

        if saw_stream_activity:
            return
        if stream_error is not None:
            detail = self._extract_error_detail(stream_error)
            raise RuntimeError(f"OpenAI-compatible stream request failed: {detail}")
        raise RuntimeError("OpenAI-compatible stream request finished without any token.")

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
            "tools": tools,
            "tool_choice": tool_choice,
            **self.extra_config,
            **kwargs,
        }
        emitted_token = False
        saw_stream_activity = False
        stream_error: Exception | None = None
        try:
            async for chunk in self._stream_chat_completion(payload):
                tool_calls = self._parse_stream_tool_calls(chunk)
                if tool_calls:
                    saw_stream_activity = True
                    yield ChatChunk(type="tool_calls", tool_calls=tool_calls)

                token = self._parse_stream_token(chunk)
                if token:
                    emitted_token = True
                    saw_stream_activity = True
                    yield ChatChunk(type="token", content=token)
        except Exception as exc:
            stream_error = exc

        if emitted_token:
            return

        try:
            fallback = await self.chat_with_tools(
                messages,
                tools=tools,
                tool_choice=tool_choice,
                **kwargs,
            )
        except Exception as fallback_exc:
            fallback_detail = self._extract_error_detail(fallback_exc)
            if stream_error is not None:
                stream_detail = self._extract_error_detail(stream_error)
                raise RuntimeError(
                    "OpenAI-compatible stream tool-call request failed: "
                    f"{stream_detail}; non-stream fallback failed: {fallback_detail}"
                ) from fallback_exc
            raise RuntimeError(f"OpenAI-compatible stream tool-call request failed: {fallback_detail}") from fallback_exc
        fallback_content = str(fallback.get("content") or "")
        fallback_tool_calls = fallback.get("tool_calls") if isinstance(fallback, dict) else []
        if (not saw_stream_activity) and isinstance(fallback_tool_calls, list) and fallback_tool_calls:
            yield ChatChunk(type="tool_calls", tool_calls=fallback_tool_calls)

        if fallback_content:
            async for token_chunk in self._emit_chunked_tokens(fallback_content):
                yield token_chunk
            return

        if saw_stream_activity:
            return
        if stream_error is not None:
            detail = self._extract_error_detail(stream_error)
            raise RuntimeError(f"OpenAI-compatible stream tool-call request failed: {detail}")
        raise RuntimeError("OpenAI-compatible stream tool-call request finished without any token.")

    async def embed_texts(self, texts: list[str], **kwargs) -> list[list[float]]:
        payload = {
            "model": kwargs.get("embedding_model", self.extra_config.get("embedding_model", self.model)),
            "input": texts,
        }
        try:
            async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
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
            probe_payload = {
                "model": self.model,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1,
                "stream": False,
            }
            await self._request_chat_completion(probe_payload)
            return {"ok": True, "detail": "chat endpoint ok"}
        except Exception as exc:  # pragma: no cover
            return {"ok": False, "detail": self._extract_error_detail(exc)}

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def _request_chat_completion(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                detail = self._extract_http_error_detail(exc.response)
                raise RuntimeError(f"HTTP {exc.response.status_code}: {detail}") from exc

            try:
                data = response.json()
            except json.JSONDecodeError as exc:
                preview = (response.text or "").strip().replace("\n", " ")[:180]
                hint = "response is not JSON; verify Base URL (often should end with /v1)."
                raise RuntimeError(f"{hint} body_preview={preview}") from exc

            if not isinstance(data, dict):
                raise RuntimeError("response is not a JSON object")
            return data

    async def _stream_chat_completion(self, payload: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            ) as response:
                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    try:
                        await response.aread()
                    except Exception:
                        pass
                    detail = self._extract_http_error_detail(response)
                    raise RuntimeError(f"HTTP {response.status_code}: {detail}") from exc
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    normalized = line.strip()
                    if not normalized.startswith("data:"):
                        continue
                    data = normalized[len("data:") :].strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        parsed = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(parsed, dict):
                        yield parsed

    @staticmethod
    def _parse_stream_token(data: dict[str, Any]) -> str:
        choices = data.get("choices")
        first = choices[0] if isinstance(choices, list) and choices else {}
        delta = first.get("delta", {}) if isinstance(first, dict) else {}
        if isinstance(delta, dict):
            for key in ("content", "text", "reasoning_content"):
                value = delta.get(key)
                if isinstance(value, str) and value:
                    return value
            list_content = delta.get("content")
            if isinstance(list_content, list):
                parts: list[str] = []
                for item in list_content:
                    if isinstance(item, dict):
                        text = item.get("text")
                        if isinstance(text, str) and text:
                            parts.append(text)
                    elif isinstance(item, str) and item:
                        parts.append(item)
                if parts:
                    return "".join(parts)

        if isinstance(first, dict):
            message = first.get("message")
            if isinstance(message, dict):
                message_content = message.get("content")
                if isinstance(message_content, str) and message_content:
                    return message_content
            text = first.get("text")
            if isinstance(text, str) and text:
                return text

        output_text = data.get("output_text")
        if isinstance(output_text, str) and output_text:
            return output_text
        return ""

    @staticmethod
    def _parse_stream_tool_calls(data: dict[str, Any]) -> list[dict[str, Any]]:
        choices = data.get("choices")
        first = choices[0] if isinstance(choices, list) and choices else {}
        delta = first.get("delta", {}) if isinstance(first, dict) else {}
        raw_calls: Any = []
        if isinstance(delta, dict):
            raw_calls = delta.get("tool_calls", [])
        if (not raw_calls) and isinstance(first, dict):
            message = first.get("message")
            if isinstance(message, dict):
                raw_calls = message.get("tool_calls", [])
        normalized: list[dict[str, Any]] = []
        if not isinstance(raw_calls, list):
            return normalized

        for item in raw_calls:
            if not isinstance(item, dict):
                continue
            function = item.get("function", {})
            name = function.get("name") if isinstance(function, dict) else None
            arguments = function.get("arguments") if isinstance(function, dict) else None
            normalized.append(
                {
                    "id": item.get("id"),
                    "type": item.get("type", "function"),
                    "name": name,
                    "arguments": arguments,
                }
            )
        return normalized

    @staticmethod
    def _chunk_text(content: str, size: int = 32) -> list[str]:
        if not content:
            return []
        return [content[index : index + size] for index in range(0, len(content), size)]

    def _fallback_stream_delay_seconds(self) -> float:
        raw_value = self.extra_config.get("fallback_stream_delay_ms", 12)
        try:
            delay_ms = float(raw_value)
        except (TypeError, ValueError):
            delay_ms = 12.0
        delay_ms = max(0.0, min(delay_ms, 100.0))
        return delay_ms / 1000.0

    async def _emit_chunked_tokens(self, content: str) -> AsyncIterator[ChatChunk]:
        delay_seconds = self._fallback_stream_delay_seconds()
        for token in self._chunk_text(content):
            yield ChatChunk(type="token", content=token)
            if delay_seconds > 0:
                await asyncio.sleep(delay_seconds)

    @staticmethod
    def _parse_chat_response(data: dict[str, Any]) -> dict[str, Any]:
        choices = data.get("choices") if isinstance(data, dict) else None
        first = choices[0] if isinstance(choices, list) and choices else {}
        message = first.get("message", {}) if isinstance(first, dict) else {}
        content = message.get("content", "")

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

    @staticmethod
    def _extract_http_error_detail(response: httpx.Response) -> str:
        try:
            data = response.json()
            if isinstance(data, dict):
                if isinstance(data.get("error"), dict):
                    message = data["error"].get("message")
                    if isinstance(message, str) and message.strip():
                        return message.strip()
                if isinstance(data.get("message"), str) and data["message"].strip():
                    return data["message"].strip()
        except Exception:
            pass
        text = (response.text or "").strip().replace("\n", " ")
        return text[:240] or "request failed"

    @staticmethod
    def _extract_error_detail(error: Exception) -> str:
        detail = str(error).strip()
        return detail or error.__class__.__name__

