from __future__ import annotations

import pytest

from app.core.errors import AppError
from app.core.file_access_guard import FileAccessGuard


def test_is_allowed_compat_mode_with_empty_whitelist():
    assert FileAccessGuard.is_allowed("D:\\work\\model\\a.model3.json", [])
    assert FileAccessGuard.is_allowed("/opt/models/a.model3.json", [])


def test_is_allowed_windows_same_folder_and_subfolder_case_insensitive():
    folders = ["d:/Else/live2d"]
    assert FileAccessGuard.is_allowed("D:/Else/live2d/Laffey.model3.json", folders)
    assert FileAccessGuard.is_allowed("D:/Else/live2d/sub/tex.png", folders)
    assert not FileAccessGuard.is_allowed("D:/Else/other/tex.png", folders)


def test_is_allowed_unc_and_unix_paths():
    folders = ["\\\\server\\share\\models", "/srv/live2d"]
    assert FileAccessGuard.is_allowed("\\\\server\\share\\models\\a.model3.json", folders)
    assert FileAccessGuard.is_allowed("/srv/live2d/a.model3.json", folders)
    assert not FileAccessGuard.is_allowed("/srv/other/a.model3.json", folders)


def test_is_allowed_skips_non_local_uri():
    folders = ["D:/Else/live2d"]
    assert FileAccessGuard.is_allowed("http://example.com/model3.json", folders)
    assert FileAccessGuard.is_allowed("data:application/json;base64,xxx", folders)
    assert FileAccessGuard.is_allowed("blob:http://localhost/abc", folders)


def test_blacklist_has_higher_priority_than_allow_all():
    assert not FileAccessGuard.is_allowed(
        "D:/Else/live2d/private/secret.txt",
        folders=["D:/Else/live2d"],
        allow_all=True,
        blacklist=["D:/Else/live2d/private"],
    )


def test_allow_all_false_requires_allowlist_match():
    assert not FileAccessGuard.is_allowed(
        "D:/Else/live2d/model.model3.json",
        folders=[],
        allow_all=False,
        blacklist=[],
    )
    assert FileAccessGuard.is_allowed(
        "D:/Else/live2d/model.model3.json",
        folders=["D:/Else/live2d"],
        allow_all=False,
        blacklist=[],
    )


def test_collect_path_like_values_walks_nested_payload():
    payload = {
        "query": "not-a-path-field",
        "target": {
            "path": "D:/Else/live2d/model.model3.json",
            "extra": [
                {"source": "D:/Else/live2d/tex.png"},
                {"destination": "/srv/live2d/model.model3.json"},
            ],
        },
        "metadata": {"file": ["D:/Else/live2d/a.txt", "  "]},
    }
    values = FileAccessGuard.collect_path_like_values(payload)
    assert "D:/Else/live2d/model.model3.json" in values
    assert "D:/Else/live2d/tex.png" in values
    assert "/srv/live2d/model.model3.json" in values
    assert "D:/Else/live2d/a.txt" in values


def test_assert_allowed_raises_forbidden_path():
    with pytest.raises(AppError) as exc_info:
        FileAccessGuard.assert_allowed(
            "D:/secret/a.txt",
            ["D:/Else/live2d"],
            allow_all=False,
            blacklist=[],
            context="MCP tools/call.arguments",
        )

    exc = exc_info.value
    assert exc.code == "forbidden_path"
    assert "D:/secret/a.txt" in exc.message
    assert "设置 -> 文件访问权限" in exc.message
    assert exc.details["path"] == "D:/secret/a.txt"
    assert exc.details["reason"] == FileAccessGuard.REASON_NOT_IN_ALLOWLIST
    assert exc.details["context"] == "MCP tools/call.arguments"
    assert exc.details["suggested_folder"] == "D:/secret"
