"""Pushes the workers' newest readings to the API (POST /internal/readings)."""

import logging
import threading
from datetime import datetime
from typing import Protocol

import httpx

from vision.contracts import CameraReading

logger = logging.getLogger(__name__)


class HasLatest(Protocol):
    def latest(self, now: datetime) -> CameraReading | None: ...


class Publisher:
    def __init__(self, api_url: str, token: str, workers: list[HasLatest], timeout_s: float = 2.0) -> None:
        self._url = f"{api_url.rstrip('/')}/internal/readings"
        self._headers = {"Authorization": f"Bearer {token}"}
        self._workers = workers
        self._timeout_s = timeout_s
        self._sent: dict[str, datetime] = {}

    def publish_once(self, now: datetime) -> bool:
        """Send readings the API has not seen yet. False when the API could not take them; never raises."""
        fresh = [
            reading
            for worker in self._workers
            if (reading := worker.latest(now)) and self._sent.get(reading.camera_id) != reading.measured_at
        ]
        if not fresh:
            return True
        try:
            response = httpx.post(
                self._url,
                json={"readings": [reading.to_json() for reading in fresh]},
                headers=self._headers,
                timeout=self._timeout_s,
            )
        except httpx.HTTPError as exc:
            logger.warning("could not reach the API: %s", type(exc).__name__)
            return False
        if response.status_code >= 300:
            hint = " (check VISION_INGEST_TOKEN)" if response.status_code == 401 else ""
            logger.warning("the API refused %d readings: HTTP %d%s", len(fresh), response.status_code, hint)
            return False
        for reading in fresh:
            self._sent[reading.camera_id] = reading.measured_at
        return True

    def run(self, interval_s: float, stop: threading.Event) -> None:
        while not stop.wait(interval_s):
            self.publish_once(datetime.now().astimezone())
