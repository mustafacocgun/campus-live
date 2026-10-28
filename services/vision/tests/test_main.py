"""python -m vision: where the service listens."""

import uvicorn

from vision.__main__ import main
from vision.config import Settings


def test_vision_listens_on_localhost_by_default(monkeypatch) -> None:
    monkeypatch.delenv("VISION_HOST", raising=False)
    assert Settings(_env_file=None).host == "127.0.0.1"


def test_main_listens_where_vision_host_says(monkeypatch, tmp_path) -> None:
    # A second demo PC opens its stage preview to the API's machine (D33); no .env in this folder.
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("VISION_HOST", "0.0.0.0")
    monkeypatch.setenv("VISION_PORT", "8011")
    calls = []
    monkeypatch.setattr(uvicorn, "run", lambda app, **options: calls.append(options))
    main()
    assert calls == [{"host": "0.0.0.0", "port": 8011}]
