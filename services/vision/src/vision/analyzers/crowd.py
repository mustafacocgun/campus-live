"""Crowd: how many people a camera sees right now, and, outdoors, where they stand on the map."""

from collections import deque
from collections.abc import Callable
from datetime import datetime
from statistics import median_high

import numpy as np
import supervision as sv

from vision.analyzers.levels import level_for_count
from vision.cameras import CameraConfig
from vision.contracts import CameraReading, ReadingSource
from vision.density import DensityGrid

# Boxes (x1, y1, x2, y2) and the frame's (width, height) -> where each person's feet are, as (lat, lng).
FeetProjector = Callable[[np.ndarray, tuple[int, int]], list[tuple[float, float]]]


class CrowdAnalyzer:
    def __init__(
        self,
        camera: CameraConfig,
        project: FeetProjector | None,
        grid: DensityGrid | None = None,
        window: int = 5,
    ) -> None:
        self.camera = camera
        # None for indoor cameras: they send counts only, which light up the whole building (D21).
        self._project = project
        self._grid = grid or DensityGrid()
        self._counts: deque[int] = deque(maxlen=window)
        self._zone: sv.PolygonZone | None = None
        self._zone_frame: tuple[int, int] | None = None

    def update(
        self, detections: sv.Detections, frame_size: tuple[int, int], now: datetime, source: ReadingSource
    ) -> CameraReading:
        """One sampled frame. `frame_size` is (width, height); detections are people only."""
        people = self._in_zone(detections, frame_size)
        self._counts.append(len(people))
        # The median of the last few samples: one frame with missed people doesn't flicker the map.
        shown = int(median_high(self._counts))
        # Per-cell weights only: the people's positions are binned here and go no further.
        cells = self._grid.update(self._project(people.xyxy, frame_size)) if self._project else None
        return CameraReading(
            camera_id=self.camera.id,
            kind=self.camera.kind,
            count=shown,
            level=level_for_count(shown, self.camera.thresholds),
            cells=cells,
            source=source,
            measured_at=now,
        )

    def _in_zone(self, detections: sv.Detections, frame_size: tuple[int, int]) -> sv.Detections:
        if self.camera.zone is None or len(detections) == 0:
            return detections
        if self._zone_frame != frame_size:
            width, height = frame_size
            polygon = np.array(
                [(round(x * width), round(y * height)) for x, y in self.camera.zone], dtype=int
            )
            # People count where their feet are, so someone standing in front of the zone doesn't.
            self._zone = sv.PolygonZone(polygon=polygon, triggering_anchors=(sv.Position.BOTTOM_CENTER,))
            self._zone_frame = frame_size
        return detections[self._zone.trigger(detections)]
