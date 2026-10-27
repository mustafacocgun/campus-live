"""python -m vision.record: run each camera's clip once through the pipeline and save its readings.

The cameras are those in the cameras file with a video `source`; the output is the dataset that
VISION_DETECTOR=replay plays back (see vision.replay). Only numbers are written, never frames.
"""

import argparse
import logging
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from vision.cameras import CameraConfig, load_cameras
from vision.config import Settings
from vision.contracts import CameraReading
from vision.replay import UNSTAMPED, to_line, write_dataset
from vision.worker import Analyzer, CameraWorker, Detector

logger = logging.getLogger(__name__)


class RecordingWorker(CameraWorker):
    """Runs a clip once, as fast as it decodes, and keeps every reading with its time in the clip."""

    mode = "record"

    def __init__(
        self, camera: CameraConfig, detector_factory: Callable[[], Detector], analyzer: Analyzer, fps: float
    ) -> None:
        super().__init__(camera, detector_factory, analyzer, loop=False, realtime=False)
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
    cameras: list[CameraConfig], detector_factory: Callable[[], Detector]
) -> list[dict[str, Any]]:
    """Dataset lines for every camera with a video source. Fails on the first clip that cannot be read."""
    from vision.analyzers.crowd import CrowdAnalyzer

    lines: list[dict[str, Any]] = []
    for camera in cameras:
        if camera.source is None:
            continue
        if camera.kind != "crowd":
            logger.warning("no %s analyzer yet: camera %s is not recorded", camera.kind, camera.id)
            continue
        if camera.source.isdigit():
            raise ValueError(f"camera {camera.id}: recording needs a video file, not a webcam")
        worker = RecordingWorker(camera, detector_factory, CrowdAnalyzer(camera), clip_fps(camera.source))
        worker.run()
        if worker.error:
            raise RuntimeError(f"camera {camera.id}: {worker.error}")
        lines += [
            to_line((reading.measured_at - UNSTAMPED).total_seconds(), reading) for reading in worker.readings
        ]
        logger.info(
            "camera %s: %d readings from %d frames", camera.id, len(worker.readings), worker.frames_read
        )
    if not lines:
        raise ValueError("no crowd camera has a video `source` in the cameras file")
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

    from vision.detector import PERSON, YoloDetector

    lines = record_cameras(load_cameras(args.cameras), lambda: YoloDetector(PERSON))
    write_dataset(args.out, lines)
    logger.info("wrote %d readings to %s", len(lines), args.out)


if __name__ == "__main__":
    main()
