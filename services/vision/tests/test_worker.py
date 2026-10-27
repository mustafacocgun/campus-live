from datetime import timedelta

from conftest import NOW, write_clip
from vision.analyzers.crowd import CrowdAnalyzer
from vision.cameras import CameraConfig
from vision.detector import detect_test_boxes as detect_white_boxes
from vision.projection import CameraPose, PoseProjector
from vision.worker import CameraWorker

TWO_PEOPLE = [(10, 40, 20, 80), (60, 40, 70, 80)]


def _camera(source: str, sample_fps: float = 30.0) -> CameraConfig:
    return CameraConfig(
        id="tas-kafe",
        kind="crowd",
        source=source,
        sample_fps=sample_fps,
        thresholds={"medium": 2, "high": 5},
    )


POSE = CameraPose(lat=40.742, lng=30.332, heading=0, fov_deg=60, range_m=40)


def _worker(camera: CameraConfig, detector_factory, *, loop: bool = False) -> CameraWorker:
    def analyzer():
        return CrowdAnalyzer(camera, PoseProjector(POSE))

    return CameraWorker(camera, detector_factory, analyzer, loop=loop, realtime=False)


def test_worker_reads_crowd_from_clip(tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 10)
    worker = _worker(_camera(clip), lambda: detect_white_boxes)
    worker.run()
    reading = worker.last_reading
    assert worker.error is None
    assert (reading.camera_id, reading.count, reading.level, reading.source) == (
        "tas-kafe",
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


def test_worker_puts_cells_on_crowd_readings(tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 10)
    worker = _worker(_camera(clip), lambda: detect_white_boxes)
    worker.run()
    assert worker.error is None
    assert worker.last_reading.cells  # the two people, projected through the pose


def test_analyzer_load_failure_is_reported(tmp_path) -> None:
    # A WILDTRACK camera whose calibration files are missing turns grey; the service keeps running.
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 3)

    def analyzer():
        raise FileNotFoundError("datasets/wildtrack/calibrations/intrinsic_zero/intr_CVLab1.xml")

    worker = CameraWorker(_camera(clip), lambda: detect_white_boxes, analyzer, realtime=False)
    worker.run()
    assert worker.error.startswith("FileNotFoundError")
    assert worker.latest(NOW) is None


def test_worker_starts_at_the_camera_offset(tmp_path) -> None:
    # Frame i shows i // 10 + 1 people: 1 in the first second, 3 from 2 s on (10 fps).
    frames = [[(5 + 25 * n, 40, 15 + 25 * n, 80) for n in range(i // 10 + 1)] for i in range(30)]
    clip = write_clip(str(tmp_path / "c.avi"), frames, fps=10.0)
    camera = CameraConfig(
        id="tas-kafe",
        kind="crowd",
        source=clip,
        sample_fps=10,
        start_s=2.0,
        thresholds={"medium": 2, "high": 5},
    )
    seen = []

    def detector(frame):
        found = detect_white_boxes(frame)
        seen.append(len(found))
        return found

    _worker(camera, lambda: detector).run()
    assert seen[0] == 3
