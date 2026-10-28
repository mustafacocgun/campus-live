import asyncio

import cv2
import numpy as np
import supervision as sv
from fastapi.testclient import TestClient

from conftest import write_clip
from vision.analyzers.crowd import CrowdAnalyzer
from vision.cameras import CameraConfig
from vision.config import Settings
from vision.detector import detect_test_boxes
from vision.preview import PERSON_COLOR, Preview, annotate
from vision.service import mjpeg
from vision.worker import CameraWorker

TWO_PEOPLE = [(10, 40, 20, 80), (60, 40, 70, 80)]


def _worker(clip: str, preview: Preview | None) -> CameraWorker:
    camera = CameraConfig(
        id="tas-kafe", kind="crowd", source=clip, sample_fps=30.0, thresholds={"medium": 2, "high": 5}
    )
    return CameraWorker(
        camera,
        lambda: detect_test_boxes,
        lambda: CrowdAnalyzer(camera, None),
        loop=False,
        realtime=False,
        preview=preview,
    )


def test_preview_is_off_by_default(monkeypatch) -> None:
    # Frames never leave vision unless the demo machine turns the preview on (CLAUDE.md §0.2, D33).
    monkeypatch.delenv("VISION_PREVIEW", raising=False)
    assert Settings(_env_file=None).preview is False


def test_annotate_draws_a_box_per_detection() -> None:
    frame = np.zeros((100, 200, 3), np.uint8)
    detections = sv.Detections(xyxy=np.array([[20.0, 20.0, 60.0, 80.0]]), class_id=np.array([0]))
    image = cv2.imdecode(np.frombuffer(annotate(frame, detections), np.uint8), cv2.IMREAD_COLOR)
    assert image.shape == (100, 200, 3)
    # The box's left edge carries the person colour; the middle of the box stays black.
    assert np.abs(image[50, 20].astype(int) - PERSON_COLOR).max() < 40
    assert image[50, 40].max() < 40


def test_annotate_scales_wide_frames_down() -> None:
    image = cv2.imdecode(
        np.frombuffer(annotate(np.zeros((1080, 1920, 3), np.uint8), sv.Detections.empty()), np.uint8),
        cv2.IMREAD_COLOR,
    )
    assert image.shape[1] == 640


def test_worker_fills_the_preview_only_while_watched(tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 5)
    unwatched = Preview()
    _worker(clip, unwatched).run()
    assert unwatched.newer_than(0) is None  # nobody watched: nothing was encoded

    watched = Preview()
    watched.watch()
    worker = _worker(clip, watched)
    worker.run()
    assert worker.error is None
    number, jpeg = watched.newer_than(0)
    assert number == 5 and jpeg[:2] == b"\xff\xd8"  # one JPEG per processed frame


def test_worker_without_preview_still_counts(tmp_path) -> None:
    worker = _worker(write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 3), None)
    worker.run()
    assert worker.last_reading.count == 2


def test_preview_route_is_404_when_off(monkeypatch, tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 30)
    config = tmp_path / "cameras.yaml"
    config.write_text(
        f"cameras:\n  - {{id: tas-kafe, kind: crowd, source: '{clip}', thresholds: {{medium: 1, high: 2}}}}\n"
    )
    monkeypatch.setenv("VISION_DETECTOR", "test-boxes")
    monkeypatch.setenv("VISION_CAMERAS_FILE", str(config))
    monkeypatch.setenv("VISION_API_URL", "http://127.0.0.1:9")
    monkeypatch.setenv("VISION_PREVIEW", "false")
    from vision.service import app

    with TestClient(app) as client:
        assert client.get("/preview/tas-kafe").status_code == 404
        assert client.get("/preview/no-such-camera").status_code == 404


def test_mjpeg_sends_each_frame_once_as_a_multipart_part() -> None:
    preview = Preview()
    preview.put(b"\xff\xd8first")

    async def first_two() -> list[bytes]:
        stream = mjpeg(preview, poll_s=0.01)
        first = await anext(stream)
        preview.put(b"\xff\xd8second")
        second = await anext(stream)
        await stream.aclose()
        return [first, second]

    first, second = asyncio.run(first_two())
    assert first.startswith(b"--frame\r\nContent-Type: image/jpeg\r\n")
    assert first.endswith(b"\xff\xd8first\r\n") and second.endswith(b"\xff\xd8second\r\n")
    assert preview.wanted()  # a stream keeps the worker encoding
