from app.skills.base import SkillExecutor


class SummarySkill(SkillExecutor):
    name = "summary-helper"

    async def execute(self, *, user_input: str, context: dict) -> dict:
        return {
            "skill": self.name,
            "summary_hint": f"用户当前关注点：{user_input[:120]}",
            "context_keys": sorted(context.keys()),
        }


class PersonaStyleSkill(SkillExecutor):
    name = "persona-style"

    async def execute(self, *, user_input: str, context: dict) -> dict:
        persona_name = context.get("persona_name", "当前人设")
        return {
            "skill": self.name,
            "prompt_fragment": f"请保持 {persona_name} 的说话风格，并自然回应“{user_input[:80]}”。",
        }
