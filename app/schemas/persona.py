from app.schemas.base import CamelModel
from app.schemas.common import TimestampedSchema


class PersonaBase(CamelModel):
    name: str
    avatar: str
    description: str
    personality_tags: list[str]
    speaking_style: str
    background_story: str
    opening_message: str
    long_term_memory_enabled: bool = True
    live2d_model: str | None = None
    default_layout_mode: str = "chat"
    system_prompt_template: str


class PersonaCreate(PersonaBase):
    pass


class PersonaUpdate(CamelModel):
    name: str | None = None
    avatar: str | None = None
    description: str | None = None
    personality_tags: list[str] | None = None
    speaking_style: str | None = None
    background_story: str | None = None
    opening_message: str | None = None
    long_term_memory_enabled: bool | None = None
    live2d_model: str | None = None
    default_layout_mode: str | None = None
    system_prompt_template: str | None = None


class PersonaRead(PersonaBase, TimestampedSchema):
    id: str

