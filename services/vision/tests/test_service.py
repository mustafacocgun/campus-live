import os
import subprocess
import sys

from fastapi.testclient import TestClient

from conftest import EXAMPLE_CAMERAS, VISION_DIR
from vision.cameras import load_cameras


def test_status_lists_cameras_without_frames(monkeypatch) -> None:
    monkeypatch.setenv("VISION_DETECTOR", "simulated")
    monkeypatch.setenv("VISION_API_URL", "http://127.0.0.1:9")  # nothing listens: publishing just fails
    from vision.service import app

    with TestClient(app) as client:
        status = client.get("/status").json()
    assert status["detector"] == "simulated"
    assert [c["cameraId"] for c in status["cameras"]] == [c.id for c in load_cameras(EXAMPLE_CAMERAS)]
    # Numbers and short strings only: no image data ever leaves the service (CLAUDE.md §0.2).
    for camera in status["cameras"]:
        assert all(
            v is None or isinstance(v, int | float | bool) or len(str(v)) < 60 for v in camera.values()
        )


def test_simulated_service_starts_without_opencv() -> None:
    # OpenCV needs system libraries (libGL) that slim images may lack; simulated mode must not load it.
    code = "import sys, vision.service; sys.exit('cv2' in sys.modules or 'supervision' in sys.modules)"
    env = {**os.environ, "VISION_DETECTOR": "simulated", "PYTHONPATH": str(VISION_DIR / "src")}
    assert subprocess.run([sys.executable, "-c", code], cwd=VISION_DIR, env=env).returncode == 0
