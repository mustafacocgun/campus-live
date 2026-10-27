"""What every camera worker shares: a background thread, the latest reading, staleness and status."""

import threading
from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import Any

from vision.cameras import CameraConfig
from vision.contracts import CameraReading

# Older than this, a reading means the worker has stalled; the API then shows the camera as stale.
STALE_AFTER = timedelta(seconds=10)


class WorkerBase:
    mode = "base"

    def __init__(self, camera: CameraConfig) -> None:
        self.camera = camera
        self.error: str | None = None
        self.last_reading: CameraReading | None = None
        self.readings_made = 0
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._started_at: float | None = None

    def run(self) -> None:
        raise NotImplementedError

    def start(self) -> None:
        threading.Thread(target=self.run, name=f"camera-{self.camera.id}", daemon=True).start()

    def stop(self) -> None:
        self._stop.set()

    def latest(self, now: datetime) -> CameraReading | None:
        """The newest reading, or None when there is none to trust: not started, failed or stalled."""
        with self._lock:
            if self.error or self.last_reading is None:
                return None
            if now - self.last_reading.measured_at > STALE_AFTER:
                return None
            return self.last_reading

    def status(self) -> dict[str, Any]:
        with self._lock:
            reading = self.last_reading
            elapsed = monotonic() - self._started_at if self._started_at else 0.0
            return {
                "cameraId": self.camera.id,
                "kind": self.camera.kind,
                "mode": self.mode,
                "readingsPerSecond": round(self.readings_made / elapsed, 2) if elapsed else 0.0,
                "lastReadingAt": reading.measured_at.isoformat() if reading else None,
                # The exception type only; details (which may name the source) stay in the log.
                "error": self.error.split(":", 1)[0] if self.error else None,
            }

    def _record(self, reading: CameraReading) -> None:
        with self._lock:
            self.last_reading = reading
            self.readings_made += 1

    def _mark_started(self) -> None:
        self._started_at = monotonic()

    @staticmethod
    def _now() -> datetime:
        return datetime.now(UTC)
