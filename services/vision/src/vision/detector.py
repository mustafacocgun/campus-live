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
PARKED = [2, 3, 5, 7]  # what takes a parking slot: car, motorcycle, bus, truck
# One model loads at a time: the first downloads the weights, the others then find the file (#10).
_LOAD = threading.Lock()


class YoloDetector:
    def __init__(self, classes: list[int], weights: Path = WEIGHTS, imgsz: int | None = None) -> None:
        # Turns off Ultralytics' usage analytics; it must be set before the import. Downloads still work.
        # "true", not "1": Ultralytics 8.3.x only reads "true".
        os.environ.setdefault("YOLO_OFFLINE", "true")
        from ultralytics import YOLO

        # Each worker keeps its own model: Ultralytics models are not safe to share across threads.
        with _LOAD:
            self._model = YOLO(str(weights))
        self._classes = classes
        # The input size YOLO scales each frame to; None keeps Ultralytics' default (640).
        self._size = {"imgsz": imgsz} if imgsz else {}

    def __call__(self, frame: np.ndarray) -> sv.Detections:
        result = self._model(frame, classes=self._classes, verbose=False, **self._size)[0]
        return sv.Detections.from_ultralytics(result)


def detect_test_boxes(frame: np.ndarray) -> sv.Detections:
    """For automated tests only (CLAUDE.md §3.4): in a synthetic clip, a white rectangle is a person
    and a yellow one a car."""
    import cv2

    blue, green, red = (frame[..., i].astype(int) for i in range(3))
    white = (frame.min(axis=2) >= 200).astype(np.uint8)  # every channel bright; grey and colours are not
    yellow = ((red >= 200) & (green >= 180) & (blue <= 80)).astype(np.uint8)
    boxes, classes = [], []
    for mask, class_id in ((white, 0), (yellow, 2)):
        count, _, stats, _ = cv2.connectedComponentsWithStats(mask)
        boxes += [[x, y, x + w, y + h] for x, y, w, h, _ in stats[1:count]]
        classes += [class_id] * (count - 1)
    if not boxes:
        return sv.Detections.empty()
    return sv.Detections(
        xyxy=np.array(boxes, dtype=float),
        confidence=np.ones(len(boxes)),
        class_id=np.array(classes, dtype=int),
    )


class TestBoxesDetector:
    """detect_test_boxes, keeping the classes a camera asks for (like YoloDetector)."""

    __test__ = False  # not a pytest class

    def __init__(self, classes: list[int], imgsz: int | None = None) -> None:
        self._classes = classes  # imgsz: accepted like YoloDetector's, and not needed here

    def __call__(self, frame: np.ndarray) -> sv.Detections:
        detections = detect_test_boxes(frame)
        return detections[np.isin(detections.class_id, self._classes)] if len(detections) else detections
