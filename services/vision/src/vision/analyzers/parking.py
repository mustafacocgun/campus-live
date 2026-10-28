"""Parking: which of a lot's outlined slots are taken, as free/total."""

from collections import deque
from datetime import datetime
from statistics import median_high

import cv2
import numpy as np
import supervision as sv

from vision.analyzers.levels import level_for_parking
from vision.cameras import CameraConfig
from vision.contracts import CameraReading, ParkingState, ReadingSource

# A slot is taken when a vehicle's box covers at least this share of it: a car driving past, or
# parked next to it, only touches a corner.
TAKEN_SHARE = 0.4


class ParkingAnalyzer:
    def __init__(self, camera: CameraConfig, window: int = 5) -> None:
        if not camera.slots:
            raise ValueError(f"parking camera {camera.id} has no outlined slots (tools/draw_slots.py)")
        self.camera = camera
        self._taken: list[deque[int]] = [deque(maxlen=window) for _ in camera.slots]
        self._polygons: list[np.ndarray] = []
        self._frame: tuple[int, int] | None = None

    def update(
        self, detections: sv.Detections, frame_size: tuple[int, int], now: datetime, source: ReadingSource
    ) -> CameraReading:
        """One sampled frame. `frame_size` is (width, height); detections are vehicles only."""
        if self._frame != frame_size:
            width, height = frame_size
            # The convex hull: corners clicked in any order (reading order crosses the outline) give
            # the same slot, and intersectConvexConvex needs a convex one.
            self._polygons = [
                cv2.convexHull(
                    np.array([(x * width, y * height) for x, y in slot], dtype=np.float32)
                ).reshape(-1, 2)
                for slot in self.camera.slots
            ]
            self._frame = frame_size
        boxes = [
            np.array([(x1, y1), (x2, y1), (x2, y2), (x1, y2)], dtype=np.float32)
            for x1, y1, x2, y2 in detections.xyxy
        ]
        for history, slot in zip(self._taken, self._polygons, strict=True):
            history.append(int(any(_covers(box, slot) for box in boxes)))
        # Per slot, the median of the last few samples: one missed frame does not free a slot.
        taken = sum(median_high(history) for history in self._taken)
        total = len(self._taken)
        return CameraReading(
            camera_id=self.camera.id,
            kind="parking",
            count=taken,
            level=level_for_parking(total - taken, total),
            parking=ParkingState(total=total, free=total - taken),
            source=source,
            measured_at=now,
        )


def _covers(box: np.ndarray, slot: np.ndarray) -> bool:
    area = cv2.contourArea(slot)
    if area <= 0:
        return False
    shared, _ = cv2.intersectConvexConvex(box, slot)
    return shared / area >= TAKEN_SHARE
