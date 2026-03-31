from __future__ import annotations

from abc import ABC, abstractmethod


class SkillExecutor(ABC):
    name: str

    @abstractmethod
    async def execute(self, *, user_input: str, context: dict) -> dict:
        raise NotImplementedError

