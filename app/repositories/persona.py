from app.db.models import Persona
from app.repositories.base import SQLAlchemyRepository


class PersonaRepository(SQLAlchemyRepository[Persona]):
    def __init__(self, session):
        super().__init__(session, Persona)

