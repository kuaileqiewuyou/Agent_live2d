from http import HTTPStatus
from typing import Any


class AppError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = HTTPStatus.BAD_REQUEST,
        code: str = "app_error",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}


class NotFoundError(AppError):
    def __init__(self, resource: str) -> None:
        super().__init__(
            f"{resource} not found",
            status_code=HTTPStatus.NOT_FOUND,
            code="not_found",
        )


class ConflictError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=HTTPStatus.CONFLICT, code="conflict")
