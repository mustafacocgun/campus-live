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
