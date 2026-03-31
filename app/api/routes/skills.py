from fastapi import APIRouter, Depends, status

from app.core.responses import api_response
from app.db.session import get_db_session
from app.schemas.common import ListData
from app.schemas.skill import SkillCreate, SkillRead, SkillToggleRequest, SkillUpdate
from app.services.skill import SkillService

router = APIRouter()


async def _service(session=Depends(get_db_session)) -> SkillService:
    return SkillService(session)


@router.get("")
async def list_skills(service: SkillService = Depends(_service)):
    items = [SkillRead.model_validate(item).model_dump(by_alias=True) for item in await service.list_skills()]
    return api_response(ListData(items=items, total=len(items)).model_dump(by_alias=True))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_skill(payload: SkillCreate, service: SkillService = Depends(_service)):
    entity = await service.create_skill(payload.model_dump())
    return api_response(SkillRead.model_validate(entity).model_dump(by_alias=True))


@router.get("/{skill_id}")
async def get_skill(skill_id: str, service: SkillService = Depends(_service)):
    entity = await service.get_skill(skill_id)
    return api_response(SkillRead.model_validate(entity).model_dump(by_alias=True))


@router.patch("/{skill_id}")
async def update_skill(skill_id: str, payload: SkillUpdate, service: SkillService = Depends(_service)):
    entity = await service.update_skill(skill_id, payload.model_dump(exclude_none=True))
    return api_response(SkillRead.model_validate(entity).model_dump(by_alias=True))


@router.delete("/{skill_id}")
async def delete_skill(skill_id: str, service: SkillService = Depends(_service)):
    await service.delete_skill(skill_id)
    return api_response({"deleted": True, "id": skill_id})


@router.post("/{skill_id}/toggle")
async def toggle_skill(
    skill_id: str,
    payload: SkillToggleRequest,
    service: SkillService = Depends(_service),
):
    entity = await service.toggle_skill(skill_id, payload.enabled)
    return api_response(SkillRead.model_validate(entity).model_dump(by_alias=True))

