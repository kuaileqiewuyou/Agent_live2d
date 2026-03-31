from fastapi import APIRouter, Depends, status

from app.core.responses import api_response
from app.db.session import get_db_session
from app.schemas.common import ListData
from app.schemas.persona import PersonaCreate, PersonaRead, PersonaUpdate
from app.services.persona import PersonaService

router = APIRouter()


async def _service(session=Depends(get_db_session)) -> PersonaService:
    return PersonaService(session)


@router.get("")
async def list_personas(service: PersonaService = Depends(_service)):
    items = [PersonaRead.model_validate(item).model_dump(by_alias=True) for item in await service.list_personas()]
    return api_response(ListData(items=items, total=len(items)).model_dump(by_alias=True))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_persona(payload: PersonaCreate, service: PersonaService = Depends(_service)):
    entity = await service.create_persona(payload.model_dump())
    return api_response(PersonaRead.model_validate(entity).model_dump(by_alias=True))


@router.get("/{persona_id}")
async def get_persona(persona_id: str, service: PersonaService = Depends(_service)):
    entity = await service.get_persona(persona_id)
    return api_response(PersonaRead.model_validate(entity).model_dump(by_alias=True))


@router.patch("/{persona_id}")
async def update_persona(
    persona_id: str,
    payload: PersonaUpdate,
    service: PersonaService = Depends(_service),
):
    entity = await service.update_persona(persona_id, payload.model_dump(exclude_none=True))
    return api_response(PersonaRead.model_validate(entity).model_dump(by_alias=True))


@router.delete("/{persona_id}")
async def delete_persona(persona_id: str, service: PersonaService = Depends(_service)):
    await service.delete_persona(persona_id)
    return api_response({"deleted": True, "id": persona_id})

