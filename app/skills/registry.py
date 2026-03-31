from app.skills.base import SkillExecutor
from app.skills.builtin import PersonaStyleSkill, SummarySkill


class SkillRegistry:
    def __init__(self) -> None:
        self._skills: dict[str, SkillExecutor] = {
            SummarySkill.name: SummarySkill(),
            PersonaStyleSkill.name: PersonaStyleSkill(),
        }

    def list_registered(self) -> list[str]:
        return sorted(self._skills.keys())

    def get(self, name: str) -> SkillExecutor | None:
        return self._skills.get(name)
