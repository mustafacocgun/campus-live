from datetime import timedelta

from conftest import NOW, detect_white_boxes, write_clip
from vision.analyzers.crowd import CrowdAnalyzer
from vision.cameras import CameraConfig
from vision.worker import CameraWorker

TWO_PEOPLE = [(10, 40, 20, 80), (60, 40, 70, 80)]


def _camera(source: str, sample_fps: float = 30.0) -> CameraConfig:
    return CameraConfig(
        id="kafe-merkez",
        kind="crowd",
        source=source,
        sample_fps=sample_fps,
        thresholds={"medium": 2, "high": 5},
    )


def _worker(camera: CameraConfig, detector_factory, *, loop: bool = False) -> CameraWorker:
    return CameraWorker(camera, detector_factory, CrowdAnalyzer(camera), loop=loop, realtime=False)


def test_worker_reads_crowd_from_clip(tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 10)
    worker = _worker(_camera(clip), lambda: detect_white_boxes)
    worker.run()
    reading = worker.last_reading
    assert worker.error is None
    assert (reading.camera_id, reading.count, reading.level, reading.source) == (
        "kafe-merkez",
        2,
        "medium",
        "demo-footage",
    )


def test_worker_samples_frames(tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 30, fps=30.0)
    calls = []

    def detector(frame):
        calls.append(1)
        return detect_white_boxes(frame)

    worker = _worker(_camera(clip, sample_fps=5), lambda: detector)
    worker.run()
    assert (worker.frames_read, len(calls)) == (30, 5)


def test_worker_loops_clip(tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 10)
    calls = []

    def detector(frame):
        calls.append(1)
        if len(calls) == 25:
            worker.stop()
        return detect_white_boxes(frame)

    worker = _worker(_camera(clip), lambda: detector, loop=True)
    worker.run()
    assert worker.error is None
    assert worker.frames_read == 25  # 2.5 passes of a 10-frame clip


def test_missing_source_is_reported(tmp_path) -> None:
    worker = _worker(_camera(str(tmp_path / "nope.mp4")), lambda: detect_white_boxes)
    worker.run()
    assert worker.error is not None
    assert worker.latest(NOW) is None


def test_detector_load_failure_is_reported(tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 3)

    def factory():
        raise ImportError("No module named 'ultralytics'")

    worker = _worker(_camera(clip), factory)
    worker.run()
    assert worker.error is not None
    assert worker.latest(NOW) is None


def test_reading_goes_stale(tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 3)
    worker = _worker(_camera(clip), lambda: detect_white_boxes)
    worker.run()
    measured = worker.last_reading.measured_at
    assert worker.latest(measured + timedelta(seconds=9)) is not None
    assert worker.latest(measured + timedelta(seconds=11)) is None


def test_reading_disappears_when_counting_fails(tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 10)
    calls = []

    def detector(frame):
        calls.append(1)
        if len(calls) == 5:
            raise RuntimeError("CUDA out of memory")
        return detect_white_boxes(frame)

    worker = _worker(_camera(clip), lambda: detector)
    worker.run()
    assert worker.error is not None
    assert worker.latest(worker.last_reading.measured_at) is None
