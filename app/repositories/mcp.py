from app.db.models import MCPServer
from app.repositories.base import SQLAlchemyRepository


class MCPServerRepository(SQLAlchemyRepository[MCPServer]):
    def __init__(self, session):
        super().__init__(session, MCPServer)

