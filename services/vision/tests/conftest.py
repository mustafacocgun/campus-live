import math
import sys
import types
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import supervision as sv

VISION_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = VISION_DIR.parents[1]
EXAMPLE_CAMERAS = VISION_DIR / "configs" / "cameras.example.yaml"
NOW = datetime(2026, 10, 27, 7, 0, tzinfo=UTC)


def fake_yolo(monkeypatch) -> list[dict]:
    """Stands in for Ultralytics, no GPU needed: records the keyword arguments of every model call."""
    calls: list[dict] = []

    def model(frame, **kwargs):
        calls.append(kwargs)
        return [None]

    fake_ultralytics = types.ModuleType("ultralytics")
    fake_ultralytics.YOLO = lambda weights: model
    monkeypatch.setitem(sys.modules, "ultralytics", fake_ultralytics)
    monkeypatch.setattr(sv.Detections, "from_ultralytics", staticmethod(lambda result: sv.Detections.empty()))
    return calls


def people(*boxes: list[float]) -> sv.Detections:
    """Person detections as YOLO would give them: boxes (x1, y1, x2, y2), confidence, class 0."""
    if not boxes:
        return sv.Detections.empty()
    return sv.Detections(
        xyxy=np.array(boxes, dtype=float),
        confidence=np.full(len(boxes), 0.9),
        class_id=np.zeros(len(boxes), dtype=int),
    )


def write_clip(path: str, boxes_per_frame: list[list[tuple[int, int, int, int]]], fps: float = 30.0) -> str:
    """A 100x100 MJPG clip; every box (x1, y1, x2, y2) is a white rectangle standing in for a person."""
    import cv2

    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), fps, (100, 100))
    for boxes in boxes_per_frame:
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        for x1, y1, x2, y2 in boxes:
            frame[y1:y2, x1:x2] = 255
        writer.write(frame)
    writer.release()
    return path


# A synthetic calibrated camera (OpenCV pinhole) with strong barrel distortion, like a GoPro: 15 m
# behind the world origin, 5 m up, looking along +y and 20 degrees down. World unit: cm.
SYNTHETIC_K = np.array([[1000.0, 0, 960], [0, 1000.0, 540], [0, 0, 1]])
SYNTHETIC_DIST = np.array([-0.25, 0.08, 0.001, -0.0005, 0.0])


def synthetic_camera() -> tuple[np.ndarray, np.ndarray]:
    """R (world -> camera) and t of the synthetic camera."""
    tilt = math.radians(20)
    forward = np.array([0.0, math.cos(tilt), -math.sin(tilt)])
    right = np.array([1.0, 0.0, 0.0])
    rotation = np.stack([right, np.cross(forward, right), forward])
    return rotation, -rotation @ np.array([0.0, -1500.0, 500.0])


def synthetic_pixels(rotation: np.ndarray, t: np.ndarray, ground_cm: np.ndarray) -> np.ndarray:
    """Where ground points (x, y in cm, on Z = 0) appear in the synthetic camera's 1920x1080 image."""
    import cv2

    world = np.column_stack([ground_cm, np.zeros(len(ground_cm))])
    px, _ = cv2.projectPoints(world, cv2.Rodrigues(rotation)[0], t, SYNTHETIC_K, SYNTHETIC_DIST)
    return px.reshape(-1, 2)


def write_wildtrack(root: Path, name: str, rotation: np.ndarray, t: np.ndarray) -> Path:
    """Calibration files in WILDTRACK's layout and formats (the real ones are never committed): the
    intrinsics as OpenCV FileStorage matrices, the extrinsics as plain numbers."""
    import cv2

    (root / "calibrations/intrinsic_zero").mkdir(parents=True, exist_ok=True)
    (root / "calibrations/extrinsic").mkdir(parents=True, exist_ok=True)
    storage = cv2.FileStorage(
        str(root / f"calibrations/intrinsic_zero/intr_{name}.xml"), cv2.FILE_STORAGE_WRITE
    )
    storage.write("camera_matrix", SYNTHETIC_K)
    storage.write("distortion_coefficients", SYNTHETIC_DIST.reshape(1, 5))
    storage.release()
    rvec = " ".join(repr(float(v)) for v in cv2.Rodrigues(rotation)[0].ravel())
    tvec = " ".join(repr(float(v)) for v in np.ravel(t))
    (root / f"calibrations/extrinsic/extr_{name}.xml").write_text(
        '<?xml version="1.0"?>\n<opencv_storage>\n'
        f"<rvec>{rvec}</rvec>\n<tvec>{tvec}</tvec>\n</opencv_storage>\n"
    )
    return root
