"""Finds people or vehicles in a frame with Ultralytics YOLO11n (AGPL-3.0; the `yolo` extra)."""

import os
import threading
from pathlib import Path

import numpy as np
import supervision as sv

# Downloaded on first use. services/vision/models/ is git-ignored.
WEIGHTS = Path(__file__).resolve().parents[2] / "models" / "yolo11n.pt"
PERSON = [0]
VEHICLES = [1, 2, 3, 5, 7]  # COCO: bicycle, car, motorcycle, bus, truck
# One model loads at a time: the first downloads the weights, the others then find the file (#10).
_LOAD = threading.Lock()


class YoloDetector:
    def __init__(self, classes: list[int], weights: Path = WEIGHTS) -> None:
        # Turns off Ultralytics' usage analytics; it must be set before the import. Downloads still work.
        # "true", not "1": Ultralytics 8.3.x only reads "true".
        os.environ.setdefault("YOLO_OFFLINE", "true")
        from ultralytics import YOLO

        # Each worker keeps its own model: Ultralytics models are not safe to share across threads.
        with _LOAD:
            self._model = YOLO(str(weights))
        self._classes = classes

    def __call__(self, frame: np.ndarray) -> sv.Detections:
        result = self._model(frame, classes=self._classes, verbose=False)[0]
        return sv.Detections.from_ultralytics(result)


def detect_test_boxes(frame: np.ndarray) -> sv.Detections:
    """For automated tests only (CLAUDE.md §3.4): one person per white rectangle in a synthetic clip."""
    import cv2

    white = (frame.min(axis=2) >= 200).astype(np.uint8)  # every channel bright; grey and colours are not
    count, _, stats, _ = cv2.connectedComponentsWithStats(white)
    boxes = [[x, y, x + w, y + h] for x, y, w, h, _ in stats[1:count]]
    if not boxes:
        return sv.Detections.empty()
    return sv.Detections(
        xyxy=np.array(boxes, dtype=float),
        confidence=np.ones(len(boxes)),
        class_id=np.zeros(len(boxes), dtype=int),
    )
