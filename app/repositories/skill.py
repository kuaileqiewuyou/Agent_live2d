from app.db.models import Skill
from app.repositories.base import SQLAlchemyRepository


class SkillRepository(SQLAlchemyRepository[Skill]):
    def __init__(self, session):
        super().__init__(session, Skill)

