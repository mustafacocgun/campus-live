"""python -m vision.record: run each camera's clip once through the live pipeline and save its readings.

The cameras are those in the cameras file with a video `source`, each through the same detector and
analyzer as live (build_workers); the output is the dataset VISION_DETECTOR=replay plays back (see
vision.replay). Only numbers are written, never frames.
"""

import argparse
import logging
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from vision.cameras import CameraConfig, load_cameras
from vision.config import Settings
from vision.contracts import Camera, CameraReading
from vision.registry import load_registry
from vision.replay import UNSTAMPED, to_line, write_dataset
from vision.service import build_workers
from vision.worker import Analyzer, CameraWorker, Detector

logger = logging.getLogger(__name__)


class RecordingWorker(CameraWorker):
    """Runs a clip once, as fast as it decodes, and keeps every reading with its time in the clip."""

    mode = "record"

    def __init__(
        self,
        camera: CameraConfig,
        detector_factory: Callable[[], Detector],
        analyzer_factory: Callable[[], Analyzer],
        source_kind: str,
        fps: float,
    ) -> None:
        super().__init__(
            camera, detector_factory, analyzer_factory, source_kind=source_kind, loop=False, realtime=False
        )
        self._fps = fps
        self.readings: list[CameraReading] = []

    def _now(self) -> datetime:
        # The sampled frame's position in the clip, not the wall clock: offsets don't depend on speed.
        return UNSTAMPED + timedelta(seconds=(self.frames_read - 1) / self._fps)

    def _record(self, reading: CameraReading) -> None:
        super()._record(reading)
        self.readings.append(reading)


def clip_fps(source: str) -> float:
    import cv2

    capture = cv2.VideoCapture(source)
    try:
        # The same fallback as CameraWorker, so sampling and offsets agree.
        return capture.get(cv2.CAP_PROP_FPS) or 30.0
    finally:
        capture.release()


def record_cameras(
    settings: Settings, cameras: list[CameraConfig], registry: dict[str, Camera]
) -> list[dict[str, Any]]:
    """Dataset lines for every camera with footage. Fails on the first clip that cannot be read."""
    with_footage = [camera for camera in cameras if camera.source is not None]
    for camera in with_footage:
        if camera.source.isdigit():
            raise ValueError(f"camera {camera.id}: recording needs a video file, not a webcam")
    # The whole clip, from its start: a camera's start_s only staggers cameras that share a clip live.
    from_start = [camera.model_copy(update={"start_s": 0.0}) for camera in with_footage]
    lines: list[dict[str, Any]] = []
    for live in build_workers(settings, from_start, registry):
        worker = RecordingWorker(
            live.camera,
            live.detector_factory,
            live.analyzer_factory,
            live.source_kind,
            clip_fps(live.camera.source),
        )
        worker.run()
        if worker.error:
            raise RuntimeError(f"camera {worker.camera.id}: {worker.error}")
        lines += [
            to_line((reading.measured_at - UNSTAMPED).total_seconds(), reading) for reading in worker.readings
        ]
        logger.info(
            "camera %s: %d readings from %d frames",
            worker.camera.id,
            len(worker.readings),
            worker.frames_read,
        )
    if not lines:
        raise ValueError("no camera has footage (a video `source`) in the cameras file")
    return lines


def main(argv: list[str] | None = None) -> None:
    settings = Settings()
    parser = argparse.ArgumentParser(
        prog="python -m vision.record",
        description="Record readings from video once, for VISION_DETECTOR=replay.",
    )
    parser.add_argument("--cameras", default=settings.cameras_file, help="cameras file with video sources")
    parser.add_argument("--out", default=settings.replay_file, help="the dataset to write (JSON Lines)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # Recording is live YOLO on the footage, whatever .env says the service plays.
    if settings.detector == "replay":
        settings = settings.model_copy(update={"detector": "yolo"})
    lines = record_cameras(settings, load_cameras(args.cameras), load_registry())
    write_dataset(args.out, lines)
    logger.info("wrote %d readings to %s", len(lines), args.out)


if __name__ == "__main__":
    main()
