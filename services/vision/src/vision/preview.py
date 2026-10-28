"""The stage preview (D33): a camera's newest frame with YOLO's boxes drawn on it, as one JPEG kept in
memory, replaced by the next. Only with VISION_PREVIEW on, only while someone watches, never written
to disk (CLAUDE.md §0.2)."""

import threading
from time import monotonic

import numpy as np
import supervision as sv

# The preview is scaled down to this width: enough to see the boxes, light to stream.
WIDTH = 640
JPEG_QUALITY = 70
# A watcher keeps frames coming this long; with nobody watching, no frame is encoded.
WATCH_S = 5.0
# BGR: people in green, vehicles in amber.
PERSON_COLOR = (80, 200, 60)
VEHICLE_COLOR = (0, 170, 255)


class Preview:
    """One camera's latest annotated JPEG, numbered so a stream sends each frame once."""

    def __init__(self, watch_s: float = WATCH_S) -> None:
        self._lock = threading.Lock()
        self._jpeg: bytes | None = None
        self._number = 0
        self._watch_s = watch_s
        self._watched_until = 0.0

    def watch(self) -> None:
        """Someone is looking: keep encoding frames for a while."""
        self._watched_until = monotonic() + self._watch_s

    def wanted(self) -> bool:
        return monotonic() < self._watched_until

    def put(self, jpeg: bytes) -> None:
        with self._lock:
            self._jpeg = jpeg
            self._number += 1

    def newer_than(self, number: int) -> tuple[int, bytes] | None:
        """The latest frame and its number, if it is newer than `number`."""
        with self._lock:
            if self._jpeg is None or self._number <= number:
                return None
            return self._number, self._jpeg


def annotate(frame: np.ndarray, detections: sv.Detections) -> bytes:
    """The frame, scaled down, with a box around each detection, as a JPEG. No text: the apps show
    the numbers."""
    import cv2

    scale = min(1.0, WIDTH / frame.shape[1])
    image = cv2.resize(frame, None, fx=scale, fy=scale) if scale < 1 else frame.copy()
    classes = detections.class_id if detections.class_id is not None else np.zeros(len(detections), int)
    for (x1, y1, x2, y2), class_id in zip((detections.xyxy * scale).astype(int), classes, strict=True):
        color = PERSON_COLOR if class_id == 0 else VEHICLE_COLOR
        cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise RuntimeError("could not encode the preview")
    return encoded.tobytes()
