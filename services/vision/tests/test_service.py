import json
import os
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from conftest import VISION_DIR


def test_status_lists_cameras_without_frames(monkeypatch) -> None:
    monkeypatch.setenv("VISION_DETECTOR", "simulated")
    monkeypatch.setenv("VISION_API_URL", "http://127.0.0.1:9")  # nothing listens: publishing just fails
    from vision.service import app

    with TestClient(app) as client:
        status = client.get("/status").json()
    assert status["detector"] == "simulated"
    assert [c["cameraId"] for c in status["cameras"]] == [
        "kutuphane-giris",
        "kafe-merkez",
        "otopark-a",
        "ana-yol",
    ]
    # Numbers and short strings only: no image data ever leaves the service (CLAUDE.md §0.2).
    for camera in status["cameras"]:
        assert all(
            v is None or isinstance(v, int | float | bool) or len(str(v)) < 60 for v in camera.values()
        )


def _replay_dataset(tmp_path) -> str:
    path = tmp_path / "demo.jsonl"
    line = {"offsetS": 0.0, "cameraId": "kafe-merkez", "kind": "crowd", "count": 4, "level": "low"}
    path.write_text(json.dumps({**line, "source": "demo-footage"}) + "\n", encoding="utf-8")
    return str(path)


def test_replay_service_replays_recorded_cameras_and_simulates_the_rest(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("VISION_DETECTOR", "replay")
    monkeypatch.setenv("VISION_REPLAY_FILE", _replay_dataset(tmp_path))
    monkeypatch.setenv("VISION_API_URL", "http://127.0.0.1:9")
    from vision.service import app

    with TestClient(app) as client:
        status = client.get("/status").json()
    assert status["detector"] == "replay"
    modes = {camera["cameraId"]: camera["mode"] for camera in status["cameras"]}
    assert modes == {
        "kutuphane-giris": "simulated",
        "kafe-merkez": "replay",
        "otopark-a": "simulated",
        "ana-yol": "simulated",
    }


def test_replay_service_refuses_to_start_without_its_dataset(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("VISION_DETECTOR", "replay")
    monkeypatch.setenv("VISION_REPLAY_FILE", str(tmp_path / "missing.jsonl"))
    from vision.service import app

    with pytest.raises(FileNotFoundError), TestClient(app):
        pass


def test_replay_service_starts_without_opencv(tmp_path) -> None:
    code = "import sys, vision.replay; sys.exit('cv2' in sys.modules or 'supervision' in sys.modules)"
    env = {
        **os.environ,
        "VISION_DETECTOR": "replay",
        "VISION_REPLAY_FILE": _replay_dataset(tmp_path),
        "PYTHONPATH": str(VISION_DIR / "src"),
    }
    assert subprocess.run([sys.executable, "-c", code], cwd=VISION_DIR, env=env).returncode == 0


def test_simulated_service_starts_without_opencv() -> None:
    # OpenCV needs system libraries (libGL) that slim images may lack; simulated mode must not load it.
    code = "import sys, vision.service; sys.exit('cv2' in sys.modules or 'supervision' in sys.modules)"
    env = {**os.environ, "VISION_DETECTOR": "simulated", "PYTHONPATH": str(VISION_DIR / "src")}
    assert subprocess.run([sys.executable, "-c", code], cwd=VISION_DIR, env=env).returncode == 0
