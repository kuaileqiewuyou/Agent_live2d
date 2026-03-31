from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import AgentOrchestrator
from app.providers import ProviderFactory
from app.repositories import (
    ConversationRepository,
    LongTermMemoryRepository,
    MemorySummaryRepository,
    MessageRepository,
)
from app.schemas.message import StreamEvent
from app.services.memory import MemoryApplicationService


class GenerationCoordinator:
    def __init__(self) -> None:
        self._events: dict[str, asyncio.Event] = {}

    def new(self, conversation_id: str) -> asyncio.Event:
        event = asyncio.Event()
        self._events[conversation_id] = event
        return event

    def stop(self, conversation_id: str) -> None:
        event = self._events.get(conversation_id)
        if event:
            event.set()

    def clear(self, conversation_id: str) -> None:
        self._events.pop(conversation_id, None)


generation_coordinator = GenerationCoordinator()


class MessageService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = MessageRepository(session)
        self.conversation_repo = ConversationRepository(session)
        self.memory_service = MemoryApplicationService(session)
        self.memory_repo = LongTermMemoryRepository(session)
        self.summary_repo = MemorySummaryRepository(session)
        self.graph = AgentOrchestrator()

    async def list_messages(self, conversation_id: str):
        await self.conversation_repo.get_with_relations(conversation_id)
        return await self.repo.list_by_conversation(conversation_id)

    async def send_message(self, conversation_id: str, payload: dict):
        conversation = await self.conversation_repo.get_with_relations(conversation_id)
        user_message = await self.repo.create(
            {
                "conversation_id": conversation_id,
                "role": "user",
                "sender_type": "user",
                "sender_name": "User",
                "content": payload["content"],
                "metadata_": payload.get("metadata", {}),
                "attachments": payload.get("attachments", []),
            }
        )
        recent_messages = await self.repo.list_by_conversation(conversation_id)
        state = await self.graph.prepare(
            {
                "conversation_id": conversation_id,
                "user_input": payload["content"],
                "persona": {
                    "name": conversation.persona.name,
                    "speaking_style": conversation.persona.speaking_style,
                    "background_story": conversation.persona.background_story,
                    "system_prompt_template": conversation.persona.system_prompt_template,
                },
                "model_config": {
                    "provider": conversation.model_config.provider,
                    "base_url": conversation.model_config.base_url,
                    "api_key": conversation.model_config.api_key,
                    "model": conversation.model_config.model,
                    "extra_config": conversation.model_config.extra_config,
                },
                "recent_messages": [
                    {"role": message.role, "content": message.content}
                    for message in recent_messages[-8:]
                ],
                "summary_memory": [
                    {"summary": item.summary}
                    for item in conversation.summaries[-2:]
                ],
                "long_term_memories": [
                    {"content": item.content}
                    for item in await self.memory_repo.search(
                        persona_id=conversation.persona_id,
                        memory_scope="persona",
                    )
                ][:3],
                "enabled_skills": [{"name": skill.name} for skill in conversation.skills if skill.enabled],
                "enabled_mcp_servers": [
                    {"name": server.name, "status": server.status}
                    for server in conversation.mcp_servers
                    if server.enabled
                ],
            }
        )

        provider = ProviderFactory.from_model_config(conversation.model_config)
        provider_response = await provider.chat(state["prompt_messages"])
        assistant_message = await self.repo.create(
            {
                "conversation_id": conversation_id,
                "role": "assistant",
                "sender_type": "assistant",
                "sender_name": conversation.persona.name,
                "agent_name": "CompanionAgent",
                "content": provider_response["content"],
                "metadata_": {
                    "plannerOutput": state.get("planner_output", {}),
                    "toolResults": state.get("tool_results", []),
                },
            }
        )

        all_messages = await self.repo.list_by_conversation(conversation_id)
        if len(all_messages) >= 6:
            await self.memory_service.summarize(conversation_id=conversation_id, messages=all_messages)
        if conversation.persona.long_term_memory_enabled:
            await self.memory_service.create_long_term(
                {
                    "conversation_id": conversation_id,
                    "persona_id": conversation.persona_id,
                    "memory_scope": "persona",
                    "content": payload["content"],
                    "tags": ["chat"],
                    "metadata": {"source": "user_message"},
                }
            )
        await self.session.commit()
        return user_message, assistant_message

    async def regenerate(self, conversation_id: str):
        messages = await self.repo.list_by_conversation(conversation_id)
        last_user = next((message for message in reversed(messages) if message.role == "user"), None)
        if last_user is None:
            raise ValueError("No user message found to regenerate")
        return await self.send_message(
            conversation_id,
            {
                "content": last_user.content,
                "attachments": last_user.attachments,
                "metadata": {"regenerated": True},
            },
        )

    async def stop_generation(self, conversation_id: str) -> dict:
        generation_coordinator.stop(conversation_id)
        return {"stopped": True, "conversationId": conversation_id}

    async def stream_message(self, conversation_id: str, payload: dict) -> AsyncIterator[dict]:
        conversation = await self.conversation_repo.get_with_relations(conversation_id)
        user_message = await self.repo.create(
            {
                "conversation_id": conversation_id,
                "role": "user",
                "sender_type": "user",
                "sender_name": "User",
                "content": payload["content"],
                "metadata_": payload.get("metadata", {}),
                "attachments": payload.get("attachments", []),
            }
        )
        await self.session.flush()
        stop_event = generation_coordinator.new(conversation_id)
        yield StreamEvent(event="message_created", data={"userMessageId": user_message.id}).model_dump(by_alias=True)

        prepared = await self.graph.prepare(
            {
                "conversation_id": conversation_id,
                "user_input": payload["content"],
                "persona": {
                    "name": conversation.persona.name,
                    "speaking_style": conversation.persona.speaking_style,
                    "background_story": conversation.persona.background_story,
                    "system_prompt_template": conversation.persona.system_prompt_template,
                },
                "model_config": {
                    "provider": conversation.model_config.provider,
                    "base_url": conversation.model_config.base_url,
                    "api_key": conversation.model_config.api_key,
                    "model": conversation.model_config.model,
                    "extra_config": conversation.model_config.extra_config,
                },
                "recent_messages": [
                    {"role": message.role, "content": message.content}
                    for message in (await self.repo.list_by_conversation(conversation_id))[-8:]
                ],
                "summary_memory": [
                    {"summary": item.summary}
                    for item in conversation.summaries[-2:]
                ],
                "long_term_memories": [
                    {"content": item.content}
                    for item in await self.memory_repo.search(
                        persona_id=conversation.persona_id,
                        memory_scope="persona",
                    )
                ][:3],
                "enabled_skills": [{"name": skill.name} for skill in conversation.skills if skill.enabled],
                "enabled_mcp_servers": [
                    {"name": server.name, "status": server.status}
                    for server in conversation.mcp_servers
                    if server.enabled
                ],
            }
        )

        for item in prepared.get("stream_events", []):
            yield StreamEvent(event=item["event"], data=item["data"]).model_dump(by_alias=True)

        provider = ProviderFactory.from_model_config(conversation.model_config)
        chunks: list[str] = []
        async for chunk in provider.stream_chat(prepared["prompt_messages"]):
            if stop_event.is_set():
                yield StreamEvent(event="stopped", data={"conversationId": conversation_id}).model_dump(by_alias=True)
                generation_coordinator.clear(conversation_id)
                await self.session.commit()
                return
            token = chunk.get("content", "")
            if token:
                chunks.append(token)
                yield StreamEvent(event="token", data={"content": token}).model_dump(by_alias=True)

        assistant_message = await self.repo.create(
            {
                "conversation_id": conversation_id,
                "role": "assistant",
                "sender_type": "assistant",
                "sender_name": conversation.persona.name,
                "agent_name": "CompanionAgent",
                "content": "".join(chunks),
                "metadata_": {
                    "plannerOutput": prepared.get("planner_output", {}),
                    "toolResults": prepared.get("tool_results", []),
                },
            }
        )
        await self.session.commit()
        generation_coordinator.clear(conversation_id)
        yield StreamEvent(
            event="final_answer",
            data={"messageId": assistant_message.id, "content": assistant_message.content},
        ).model_dump(by_alias=True)
