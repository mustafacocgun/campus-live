"""Plausible readings without video or a GPU, for development and as the stage fallback (CLAUDE.md §3.4)."""

import random
from datetime import datetime

from vision.analyzers.levels import level_for_count, level_for_parking
from vision.cameras import CameraConfig
from vision.contracts import CameraReading, ParkingState


class SimulatedCamera:
    """A bounded random walk per camera: free slots for parking, people or vehicles otherwise."""

    def __init__(self, camera: CameraConfig, seed: int) -> None:
        self.camera = camera
        self._random = random.Random(seed)
        if camera.kind == "parking":
            self._ceiling = camera.simulated_total
        else:
            self._ceiling = max(1, int(camera.thresholds.high * 1.5))
        self._value = self._random.randint(0, self._ceiling)

    def next_reading(self, now: datetime) -> CameraReading:
        step = self._random.choice((-2, -1, 0, 0, 1, 2))
        self._value = min(max(self._value + step, 0), self._ceiling)
        if self.camera.kind == "parking":
            free, total = self._value, self._ceiling
            return CameraReading(
                camera_id=self.camera.id,
                kind="parking",
                count=total - free,
                level=level_for_parking(free, total),
                parking=ParkingState(total=total, free=free),
                source="simulated",
                measured_at=now,
            )
        return CameraReading(
            camera_id=self.camera.id,
            kind=self.camera.kind,
            count=self._value,
            level=level_for_count(self._value, self.camera.thresholds),
            source="simulated",
            measured_at=now,
        )
