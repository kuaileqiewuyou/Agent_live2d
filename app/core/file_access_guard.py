from __future__ import annotations

import os
import re
from http import HTTPStatus
from typing import Any

from app.core.errors import AppError

_PATH_LIKE_KEYS = {
    "path",
    "file",
    "dir",
    "folder",
    "root",
    "target",
    "source",
    "destination",
}

_URI_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


class FileAccessGuard:
    REASON_IN_BLACKLIST = "in_blacklist"
    REASON_NOT_IN_ALLOWLIST = "not_in_allowlist"

    @staticmethod
    def is_local_absolute_path(path: str) -> bool:
        normalized = str(path or "").strip()
        if not normalized:
            return False
        if normalized.startswith("\\\\"):
            return True
        if normalized.startswith("/"):
            return True
        return bool(re.match(r"^[a-zA-Z]:[\\/]", normalized))

    @staticmethod
    def is_remote_or_virtual_uri(path: str) -> bool:
        normalized = str(path or "").strip()
        if not normalized:
            return False
        if FileAccessGuard.is_local_absolute_path(normalized):
            return False
        if normalized.startswith("\\\\"):
            return False
        return bool(_URI_SCHEME_RE.match(normalized))

    @classmethod
    def normalize_path(cls, path: str) -> str:
        normalized = str(path or "").strip()
        if not normalized:
            return ""
        normalized = normalized.replace("\\", "/")
        if normalized.startswith("//"):
            normalized = f"//{re.sub(r'/+', '/', normalized[2:])}"
        else:
            normalized = re.sub(r"/+", "/", normalized)
        if re.match(r"^[a-zA-Z]:/", normalized):
            normalized = f"{normalized[0].upper()}:{normalized[2:]}"
        is_drive_root = bool(re.match(r"^[a-zA-Z]:/$", normalized))
        is_unix_root = normalized == "/"
        if not is_drive_root and not is_unix_root:
            normalized = normalized.rstrip("/")
        return normalized

    @classmethod
    def _comparison_key(cls, path: str) -> str:
        normalized = cls.normalize_path(path)
        if re.match(r"^[a-zA-Z]:/", normalized) or normalized.startswith("//"):
            return normalized.lower()
        return normalized

    @classmethod
    def normalize_folders(cls, folders: list[str] | None) -> list[str]:
        if not isinstance(folders, list):
            return []
        normalized: list[str] = []
        seen: set[str] = set()
        for item in folders:
            if not isinstance(item, str):
                continue
            path = cls.normalize_path(item)
            if not path or not cls.is_local_absolute_path(path):
                continue
            key = cls._comparison_key(path)
            if key in seen:
                continue
            seen.add(key)
            normalized.append(path)
        return normalized

    @classmethod
    def _is_within_any_folder(cls, target: str, folders: list[str]) -> bool:
        target_key = cls._comparison_key(target)
        for folder in folders:
            folder_key = cls._comparison_key(folder)
            if target_key == folder_key or target_key.startswith(f"{folder_key}/"):
                return True
        return False

    @classmethod
    def suggest_folder(cls, path: str) -> str | None:
        normalized = cls.normalize_path(path)
        if not normalized or not cls.is_local_absolute_path(normalized):
            return None

        if re.match(r"^[a-zA-Z]:/$", normalized) or normalized == "/":
            return normalized

        trailing_slash = str(path or "").strip().endswith(("/", "\\"))
        if trailing_slash:
            return normalized

        base_name = os.path.basename(normalized)
        if "." not in base_name:
            return normalized

        parent = normalized.rsplit("/", 1)[0] if "/" in normalized else normalized
        return parent or normalized

    @classmethod
    def evaluate_path_access(
        cls,
        path: str,
        *,
        folders: list[str] | None,
        allow_all: bool | None = None,
        blacklist: list[str] | None = None,
    ) -> tuple[bool, str | None]:
        candidate = str(path or "").strip()
        if not candidate:
            return True, None
        if cls.is_remote_or_virtual_uri(candidate):
            return True, None
        if not cls.is_local_absolute_path(candidate):
            return True, None

        normalized_target = cls.normalize_path(candidate)
        normalized_blacklist = cls.normalize_folders(blacklist)
        if cls._is_within_any_folder(normalized_target, normalized_blacklist):
            return False, cls.REASON_IN_BLACKLIST

        normalized_folders = cls.normalize_folders(folders)

        # Legacy behavior when allow_all is not explicitly provided.
        if allow_all is None:
            if not normalized_folders:
                return True, None
            return cls._is_within_any_folder(normalized_target, normalized_folders), cls.REASON_NOT_IN_ALLOWLIST

        if allow_all:
            return True, None

        return cls._is_within_any_folder(normalized_target, normalized_folders), cls.REASON_NOT_IN_ALLOWLIST

    @classmethod
    def is_allowed(
        cls,
        path: str,
        folders: list[str] | None,
        *,
        allow_all: bool | None = None,
        blacklist: list[str] | None = None,
    ) -> bool:
        allowed, _ = cls.evaluate_path_access(
            path,
            folders=folders,
            allow_all=allow_all,
            blacklist=blacklist,
        )
        return allowed

    @classmethod
    def assert_allowed(
        cls,
        path: str,
        folders: list[str] | None,
        *,
        allow_all: bool | None = None,
        blacklist: list[str] | None = None,
        context: str = "file access",
    ) -> None:
        allowed, reason = cls.evaluate_path_access(
            path,
            folders=folders,
            allow_all=allow_all,
            blacklist=blacklist,
        )
        if allowed:
            return

        normalized_path = cls.normalize_path(path)
        raise AppError(
            f"forbidden_path: {path}. {context} blocked this path. 请在 设置 -> 文件访问权限 中授权对应目录后重试。",
            status_code=HTTPStatus.FORBIDDEN,
            code="forbidden_path",
            details={
                "path": normalized_path or str(path or "").strip(),
                "reason": reason or cls.REASON_NOT_IN_ALLOWLIST,
                "context": context,
                "suggested_folder": cls.suggest_folder(path),
            },
        )

    @classmethod
    def collect_path_like_values(cls, payload: Any) -> list[str]:
        values: list[str] = []

        def append_strings(value: Any) -> None:
            if isinstance(value, str):
                trimmed = value.strip()
                if trimmed:
                    values.append(trimmed)
                return
            if isinstance(value, list):
                for item in value:
                    append_strings(item)
                return
            if isinstance(value, dict):
                for nested in value.values():
                    append_strings(nested)

        def walk(node: Any) -> None:
            if isinstance(node, dict):
                for key, value in node.items():
                    key_name = str(key).strip().lower() if isinstance(key, str) else ""
                    if key_name in _PATH_LIKE_KEYS:
                        append_strings(value)
                    else:
                        walk(value)
            elif isinstance(node, list):
                for item in node:
                    walk(item)

        walk(payload)
        return values
