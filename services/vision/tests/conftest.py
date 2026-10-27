from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import supervision as sv

VISION_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = VISION_DIR.parents[1]
EXAMPLE_CAMERAS = VISION_DIR / "configs" / "cameras.example.yaml"
NOW = datetime(2026, 10, 27, 7, 0, tzinfo=UTC)


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


def detect_white_boxes(frame: np.ndarray) -> sv.Detections:
    """Stands in for YOLO: one person per white blob."""
    import cv2

    _, mask = cv2.threshold(frame[..., 0], 127, 255, cv2.THRESH_BINARY)
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask)
    boxes = [[x, y, x + w, y + h] for x, y, w, h, _ in stats[1:count]]
    return people(*boxes)
