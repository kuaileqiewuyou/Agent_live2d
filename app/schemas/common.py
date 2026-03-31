from datetime import datetime
from typing import Generic, TypeVar

from pydantic import Field

from app.schemas.base import CamelModel

T = TypeVar("T")


class TimestampedSchema(CamelModel):
    created_at: datetime
    updated_at: datetime


class ListData(CamelModel, Generic[T]):
    items: list[T]
    total: int


class ApiEnvelope(CamelModel, Generic[T]):
    success: bool = True
    data: T
    message: str | None = None


class HealthPayload(CamelModel):
    status: str = "ok"
    app_name: str = Field(alias="appName")
    environment: str

