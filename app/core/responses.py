from typing import Any


def api_response(data: Any, *, success: bool = True, message: str | None = None) -> dict[str, Any]:
    return {
        "success": success,
        "data": data,
        "message": message,
    }

