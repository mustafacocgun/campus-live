import json
import threading
from datetime import UTC, datetime, timedelta
from itertools import islice

import jsonschema
import pytest

from conftest import EXAMPLE_CAMERAS, NOW, REPO_ROOT
from vision.cameras import load_cameras
from vision.contracts import CameraReading, ParkingState
from vision.replay import ReplayWorker, load_dataset, restamp, schedule, to_line, write_dataset

SCHEMA = json.loads((REPO_ROOT / "packages/contracts/schemas/camera-reading.schema.json").read_text())
CAMERAS = load_cameras(EXAMPLE_CAMERAS)
RECORDED_AT = datetime(2000, 1, 1, tzinfo=UTC)


def _crowd(count: int, source: str = "demo-footage") -> CameraReading:
    level = "low" if count < 10 else "medium"
    return CameraReading(
        camera_id="kafe-merkez",
        kind="crowd",
        count=count,
        level=level,
        source=source,
        measured_at=RECORDED_AT,
    )


def _parking(free: int) -> CameraReading:
    return CameraReading(
        camera_id="otopark-a",
        kind="parking",
        count=40 - free,
        level="low",
        parking=ParkingState(total=40, free=free),
        source="demo-footage",
        measured_at=RECORDED_AT,
    )


def _write(tmp_path, lines: list[dict]) -> str:
    path = tmp_path / "demo.jsonl"
    write_dataset(path, lines)
    return str(path)


def test_lines_store_offsets_not_times_and_match_the_schema_once_stamped(tmp_path) -> None:
    lines = [to_line(0.0, _crowd(3)), to_line(0.5, _crowd(4)), to_line(0.0, _parking(12))]
    path = _write(tmp_path, lines)
    stored = [json.loads(line) for line in open(path, encoding="utf-8")]
    assert [line["offsetS"] for line in stored] == [0.0, 0.5, 0.0]
    for line in stored:
        assert "measuredAt" not in line
        reading = {key: value for key, value in line.items() if key != "offsetS"}
        jsonschema.validate({**reading, "measuredAt": "2026-10-27T07:00:00Z"}, SCHEMA)


def test_load_groups_by_camera_and_sorts_by_offset(tmp_path) -> None:
    path = _write(tmp_path, [to_line(1.0, _crowd(5)), to_line(0.0, _parking(12)), to_line(0.5, _crowd(4))])
    tracks = load_dataset(path, CAMERAS)
    assert sorted(tracks) == ["kafe-merkez", "otopark-a"]
    assert [(offset, reading.count) for offset, reading in tracks["kafe-merkez"]] == [(0.5, 4), (1.0, 5)]
    assert tracks["otopark-a"][0][1].parking == ParkingState(total=40, free=12)


def test_load_refuses_unknown_cameras_and_kind_mismatches(tmp_path) -> None:
    unknown = to_line(0.0, _crowd(3)) | {"cameraId": "nope"}
    with pytest.raises(ValueError, match="nope"):
        load_dataset(_write(tmp_path, [unknown]), CAMERAS)
    wrong_kind = to_line(0.0, _crowd(3)) | {"cameraId": "ana-yol"}  # a traffic camera
    with pytest.raises(ValueError, match="ana-yol"):
        load_dataset(_write(tmp_path, [wrong_kind]), CAMERAS)


def test_load_refuses_bad_lines_and_empty_files(tmp_path) -> None:
    path = tmp_path / "bad.jsonl"
    path.write_text('{"offsetS": -1, "cameraId": "kafe-merkez"}\n', encoding="utf-8")
    with pytest.raises(ValueError, match="line 1"):
        load_dataset(path, CAMERAS)
    path.write_text("\n", encoding="utf-8")
    with pytest.raises(ValueError, match="no readings"):
        load_dataset(path, CAMERAS)
    with pytest.raises(FileNotFoundError):
        load_dataset(tmp_path / "missing.jsonl", CAMERAS)


def test_restamp_sets_now_and_demo_footage_whatever_was_recorded() -> None:
    for source in ("demo-footage", "camera", "simulated"):
        reading = restamp(_crowd(7, source=source), NOW)
        assert reading.measured_at == NOW
        assert reading.source == "demo-footage"
        assert reading.count == 7
        jsonschema.validate(reading.to_json(), SCHEMA)


def test_schedule_loops_forever_with_the_recorded_spacing() -> None:
    track = [(0.0, _crowd(1)), (0.5, _crowd(2)), (1.0, _crowd(3))]
    played = list(islice(schedule(track), 7))
    assert [at for at, _ in played] == [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
    assert [reading.count for _, reading in played] == [1, 2, 3, 1, 2, 3, 1]


def test_schedule_of_one_reading_repeats_every_second() -> None:
    assert [at for at, _ in islice(schedule([(0.0, _crowd(1))]), 3)] == [0.0, 1.0, 2.0]


def test_worker_replays_in_a_loop_restamped_to_now() -> None:
    camera = next(camera for camera in CAMERAS if camera.id == "kafe-merkez")
    worker = ReplayWorker(camera, [(0.0, _crowd(1)), (0.01, _crowd(2)), (0.02, _crowd(3))])
    thread = threading.Thread(target=worker.run)
    before = datetime.now(UTC)
    thread.start()
    threading.Event().wait(0.2)
    worker.stop()
    thread.join(timeout=1)
    assert not thread.is_alive()
    assert worker.error is None
    assert worker.readings_made > 3  # past the end of the track, so it looped
    reading = worker.latest(datetime.now(UTC))
    assert reading is not None
    assert reading.source == "demo-footage"
    assert before <= reading.measured_at <= datetime.now(UTC)
    assert worker.status()["mode"] == "replay"


def test_worker_keeps_the_recorded_spacing() -> None:
    camera = next(camera for camera in CAMERAS if camera.id == "kafe-merkez")
    worker = ReplayWorker(camera, [(0.0, _crowd(1)), (5.0, _crowd(2))])
    thread = threading.Thread(target=worker.run)
    thread.start()
    threading.Event().wait(0.2)
    worker.stop()
    thread.join(timeout=1)
    assert worker.readings_made == 1  # the second reading is 5 s into the clip
    assert worker.last_reading.count == 1
    assert worker.latest(worker.last_reading.measured_at + timedelta(seconds=1)) is not None
