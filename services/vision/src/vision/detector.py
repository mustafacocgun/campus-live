"""Finds people or vehicles in a frame with Ultralytics YOLO11n (AGPL-3.0; the `yolo` extra)."""

import os
from pathlib import Path

import numpy as np
import supervision as sv

# Downloaded on first use. services/vision/models/ is git-ignored.
WEIGHTS = Path(__file__).resolve().parents[2] / "models" / "yolo11n.pt"
PERSON = [0]
VEHICLES = [1, 2, 3, 5, 7]  # COCO: bicycle, car, motorcycle, bus, truck


class YoloDetector:
    def __init__(self, classes: list[int], weights: Path = WEIGHTS) -> None:
        # Turns off Ultralytics' usage analytics; it must be set before the import. Downloads still work.
        # "true", not "1": Ultralytics 8.3.x only reads "true".
        os.environ.setdefault("YOLO_OFFLINE", "true")
        from ultralytics import YOLO

        self._model = YOLO(str(weights))
        self._classes = classes

    def __call__(self, frame: np.ndarray) -> sv.Detections:
        result = self._model(frame, classes=self._classes, verbose=False)[0]
        return sv.Detections.from_ultralytics(result)
