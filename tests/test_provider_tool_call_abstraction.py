from __future__ import annotations

import asyncio

from app.providers.anthropic import AnthropicProvider
from app.providers.gemini import GeminiProvider
from app.providers.ollama import OllamaProvider
from app.providers.openai_compatible import OpenAICompatibleProvider


def test_openai_provider_chat_with_tools_parses_tool_calls(monkeypatch):
    provider = OpenAICompatibleProvider(
        base_url="http://localhost:11434/v1",
        api_key="key",
        model="gpt-test",
        extra_config={},
    )

    async def fake_request(payload):
        assert payload["tools"][0]["type"] == "function"
        return {
            "choices": [
                {
                    "message": {
                        "content": "tool-ready",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "demo_tool",
                                    "arguments": "{\"q\":\"hello\"}",
                                },
                            }
                        ],
                    }
                }
            ]
        }

    monkeypatch.setattr(provider, "_request_chat_completion", fake_request)
    result = asyncio.run(
        provider.chat_with_tools(
            [{"role": "user", "content": "hi"}],
            tools=[
                {
                    "type": "function",
                    "function": {"name": "demo_tool", "description": "demo", "parameters": {"type": "object"}},
                }
            ],
        )
    )

    assert result["content"] == "tool-ready"
    assert len(result["tool_calls"]) == 1
    assert result["tool_calls"][0]["name"] == "demo_tool"


def test_ollama_provider_chat_with_tools_parses_tool_calls(monkeypatch):
    provider = OllamaProvider(
        base_url="http://localhost:11434",
        api_key=None,
        model="llama3.1",
        extra_config={},
    )

    async def fake_request(payload):
        assert payload["tools"][0]["type"] == "function"
        return {
            "message": {
                "content": "ok",
                "tool_calls": [
                    {
                        "id": "tc_1",
                        "type": "function",
                        "function": {
                            "name": "ollama_tool",
                            "arguments": "{\"x\":1}",
                        },
                    }
                ],
            }
        }

    monkeypatch.setattr(provider, "_request_chat", fake_request)
    result = asyncio.run(
        provider.chat_with_tools(
            [{"role": "user", "content": "hello"}],
            tools=[
                {
                    "type": "function",
                    "function": {"name": "ollama_tool", "description": "demo", "parameters": {"type": "object"}},
                }
            ],
        )
    )

    assert result["content"] == "ok"
    assert len(result["tool_calls"]) == 1
    assert result["tool_calls"][0]["name"] == "ollama_tool"


def test_anthropic_provider_chat_with_tools_parses_tool_calls(monkeypatch):
    provider = AnthropicProvider(
        base_url="https://api.anthropic.com/v1",
        api_key="key",
        model="claude-3-5-sonnet-latest",
        extra_config={},
    )

    async def fake_request(_payload):
        return {
            "content": [
                {"type": "text", "text": "I will call a tool"},
                {"type": "tool_use", "id": "toolu_1", "name": "summary_tool", "input": {"goal": "summary"}},
            ]
        }

    monkeypatch.setattr(provider, "_request_messages", fake_request)
    result = asyncio.run(
        provider.chat_with_tools(
            [{"role": "user", "content": "hello"}],
            tools=[
                {
                    "type": "function",
                    "function": {"name": "summary_tool", "description": "demo", "parameters": {"type": "object"}},
                }
            ],
        )
    )

    assert "tool" in result["content"].lower()
    assert len(result["tool_calls"]) == 1
    assert result["tool_calls"][0]["name"] == "summary_tool"
    assert "\"goal\": \"summary\"" in result["tool_calls"][0]["arguments"]


def test_gemini_provider_chat_with_tools_parses_tool_calls(monkeypatch):
    provider = GeminiProvider(
        base_url="https://generativelanguage.googleapis.com",
        api_key="key",
        model="gemini-1.5-pro",
        extra_config={},
    )

    async def fake_request(_payload):
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "tool needed"},
                            {"functionCall": {"name": "gemini_tool", "args": {"query": "hello"}}},
                        ]
                    }
                }
            ]
        }

    monkeypatch.setattr(provider, "_request_generate_content", fake_request)
    result = asyncio.run(
        provider.chat_with_tools(
            [{"role": "user", "content": "hello"}],
            tools=[
                {
                    "type": "function",
                    "function": {"name": "gemini_tool", "description": "demo", "parameters": {"type": "object"}},
                }
            ],
        )
    )

    assert result["content"] == "tool needed"
    assert len(result["tool_calls"]) == 1
    assert result["tool_calls"][0]["name"] == "gemini_tool"
    assert "\"query\": \"hello\"" in result["tool_calls"][0]["arguments"]


def test_base_stream_chat_with_tools_emits_tool_calls_chunk(monkeypatch):
    provider = OpenAICompatibleProvider(
        base_url="http://localhost:11434/v1",
        api_key="key",
        model="gpt-test",
        extra_config={},
    )

    async def fake_request(_payload):
        return {
            "choices": [
                {
                    "message": {
                        "content": "tool-ready content",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "demo_tool",
                                    "arguments": "{\"q\":\"hello\"}",
                                },
                            }
                        ],
                    }
                }
            ]
        }

    monkeypatch.setattr(provider, "_request_chat_completion", fake_request)

    async def collect():
        chunks = []
        async for chunk in provider.stream_chat_with_tools(
            [{"role": "user", "content": "hi"}],
            tools=[
                {
                    "type": "function",
                    "function": {"name": "demo_tool", "description": "demo", "parameters": {"type": "object"}},
                }
            ],
        ):
            chunks.append(chunk)
        return chunks

    chunks = asyncio.run(collect())
    tool_chunks = [item for item in chunks if item.get("tool_calls")]
    token_chunks = [item for item in chunks if item.get("content")]
    assert len(tool_chunks) == 1
    assert len(token_chunks) >= 1


def test_openai_stream_chat_with_tools_prefers_real_stream(monkeypatch):
    provider = OpenAICompatibleProvider(
        base_url="http://localhost:11434/v1",
        api_key="key",
        model="gpt-test",
        extra_config={},
    )

    async def fake_stream(_payload):
        yield {
            "choices": [
                {
                    "delta": {
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {"name": "demo_tool", "arguments": "{\"q\":\"hello\"}"},
                            }
                        ]
                    }
                }
            ]
        }
        yield {"choices": [{"delta": {"content": "hello-stream"}}]}

    async def fail_request(_payload):
        raise AssertionError("non-stream request should not be used")

    monkeypatch.setattr(provider, "_stream_chat_completion", fake_stream)
    monkeypatch.setattr(provider, "_request_chat_completion", fail_request)

    async def collect():
        chunks = []
        async for chunk in provider.stream_chat_with_tools(
            [{"role": "user", "content": "hi"}],
            tools=[
                {
                    "type": "function",
                    "function": {"name": "demo_tool", "description": "demo", "parameters": {"type": "object"}},
                }
            ],
        ):
            chunks.append(chunk)
        return chunks

    chunks = asyncio.run(collect())
    assert any(item.get("tool_calls") for item in chunks)
    assert any("hello-stream" in str(item.get("content", "")) for item in chunks)


def test_ollama_stream_chat_with_tools_prefers_real_stream(monkeypatch):
    provider = OllamaProvider(
        base_url="http://localhost:11434",
        api_key=None,
        model="llama3.1",
        extra_config={},
    )

    async def fake_stream(_payload):
        yield {
            "message": {
                "tool_calls": [
                    {
                        "id": "tc_1",
                        "type": "function",
                        "function": {"name": "ollama_tool", "arguments": "{\"x\":1}"},
                    }
                ]
            }
        }
        yield {"message": {"content": "ollama-stream"}}

    async def fail_request(_payload):
        raise AssertionError("non-stream request should not be used")

    monkeypatch.setattr(provider, "_stream_chat_response", fake_stream)
    monkeypatch.setattr(provider, "_request_chat", fail_request)

    async def collect():
        chunks = []
        async for chunk in provider.stream_chat_with_tools(
            [{"role": "user", "content": "hello"}],
            tools=[
                {
                    "type": "function",
                    "function": {"name": "ollama_tool", "description": "demo", "parameters": {"type": "object"}},
                }
            ],
        ):
            chunks.append(chunk)
        return chunks

    chunks = asyncio.run(collect())
    assert any(item.get("tool_calls") for item in chunks)
    assert any("ollama-stream" in str(item.get("content", "")) for item in chunks)
