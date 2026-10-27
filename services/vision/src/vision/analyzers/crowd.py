"""Crowd level: how many people are in a camera's area right now."""

from collections import deque
from datetime import datetime
from statistics import median_high

import numpy as np
import supervision as sv

from vision.analyzers.levels import level_for_count
from vision.cameras import CameraConfig
from vision.contracts import CameraReading, ReadingSource


class CrowdAnalyzer:
    def __init__(self, camera: CameraConfig, window: int = 5) -> None:
        self.camera = camera
        self._counts: deque[int] = deque(maxlen=window)
        self._zone: sv.PolygonZone | None = None
        self._zone_frame: tuple[int, int] | None = None

    def update(
        self, detections: sv.Detections, frame_size: tuple[int, int], now: datetime, source: ReadingSource
    ) -> CameraReading:
        """Count the people in one frame. `frame_size` is (width, height); detections are people only."""
        self._counts.append(self._count(detections, frame_size))
        # The median of the last few samples: one frame with missed people doesn't flicker the map.
        shown = int(median_high(self._counts))
        return CameraReading(
            camera_id=self.camera.id,
            kind="crowd",
            count=shown,
            level=level_for_count(shown, self.camera.thresholds),
            source=source,
            measured_at=now,
        )

    def _count(self, detections: sv.Detections, frame_size: tuple[int, int]) -> int:
        if self.camera.zone is None or len(detections) == 0:
            return len(detections)
        if self._zone_frame != frame_size:
            width, height = frame_size
            polygon = np.array(
                [(round(x * width), round(y * height)) for x, y in self.camera.zone], dtype=int
            )
            # People count where their feet are, so someone standing in front of the zone doesn't.
            self._zone = sv.PolygonZone(polygon=polygon, triggering_anchors=(sv.Position.BOTTOM_CENTER,))
            self._zone_frame = frame_size
        return int(self._zone.trigger(detections).sum())
