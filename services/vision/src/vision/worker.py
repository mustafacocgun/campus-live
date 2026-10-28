"""Runs one camera on video: reads frames, samples them, detects, analyzes, keeps the latest reading."""

import logging
from collections.abc import Callable
from time import monotonic
from typing import Protocol

import numpy as np
import supervision as sv

from vision.cameras import CameraConfig
from vision.contracts import CameraReading, ReadingSource
from vision.worker_base import WorkerBase

logger = logging.getLogger(__name__)

Detector = Callable[[np.ndarray], sv.Detections]


class Analyzer(Protocol):
    def update(
        self, detections: sv.Detections, frame_size: tuple[int, int], now, source: ReadingSource
    ) -> CameraReading: ...


def parse_source(source: str) -> int | str:
    """A webcam index such as "0", or a video file path."""
    return int(source) if source.isdigit() else source


class CameraWorker(WorkerBase):
    mode = "video"

    def __init__(
        self,
        camera: CameraConfig,
        detector_factory: Callable[[], Detector],
        analyzer_factory: Callable[[], Analyzer],
        *,
        source_kind: ReadingSource = "demo-footage",
        loop: bool = True,
        realtime: bool = True,
    ) -> None:
        super().__init__(camera)
        self.source = parse_source(camera.source) if camera.source else None
        self.detector_factory = detector_factory
        self.analyzer_factory = analyzer_factory
        # A webcam on teammates is demo footage too; "camera" is reserved for a permitted real camera.
        self.source_kind = source_kind
        self.loop = loop
        self.realtime = realtime
        self.frames_read = 0

    def run(self) -> None:
        import cv2

        capture = None
        self._mark_started()
        try:
            if self.source is None:
                raise RuntimeError("the camera has no source")
            # Loaded here, not at startup, so a slow or failing load (model weights, a dataset's
            # calibration files) turns this camera grey and never blocks the service.
            detect = self.detector_factory()
            analyzer = self.analyzer_factory()
            capture = cv2.VideoCapture(self.source)
            if not capture.isOpened():
                raise RuntimeError("could not open the video source")
            fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
            if self.camera.start_s:
                capture.set(cv2.CAP_PROP_POS_MSEC, self.camera.start_s * 1000)
            stride = max(1, round(fps / self.camera.sample_fps))
            is_file = isinstance(self.source, str)
            while not self._stop.is_set():
                started = monotonic()
                ok = capture.grab()
                if not ok and is_file and self.loop and self.frames_read:
                    capture.set(cv2.CAP_PROP_POS_FRAMES, 0)  # rewind the demo clip
                    ok = capture.grab()
                if not ok:
                    if is_file and not self.loop and self.frames_read:
                        break  # the clip has ended
                    raise RuntimeError("could not read a frame from the video source")
                self.frames_read += 1
                if (self.frames_read - 1) % stride == 0:
                    ok, frame = capture.retrieve()
                    if not ok:
                        raise RuntimeError("could not decode a frame")
                    height, width = frame.shape[:2]
                    self._record(
                        analyzer.update(detect(frame), (width, height), self._now(), self.source_kind)
                    )
                    # The frame goes out of scope here: frames are never stored (CLAUDE.md §0.2).
                if self.realtime and is_file:
                    self._stop.wait(max(0.0, 1 / fps - (monotonic() - started)))
        except Exception as exc:
            logger.exception("camera %s stopped", self.camera.id)
            self.error = f"{type(exc).__name__}: {exc}"
        finally:
            if capture is not None:
                capture.release()
