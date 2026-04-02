from collections.abc import Generator
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sse_starlette.sse import AppStatus


@pytest.fixture()
def client(tmp_path: Path) -> Generator[TestClient, None, None]:
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path / 'test.db'}"
    os.environ["DATA_DIR"] = str(tmp_path / "data")
    AppStatus.should_exit_event = None
    from app.config.settings import get_settings
    from app.db.session import get_engine, get_session_factory
    from app.main import create_app

    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
