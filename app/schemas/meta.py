from app.schemas.base import CamelModel


class MetaList(CamelModel):
    items: list[str]
