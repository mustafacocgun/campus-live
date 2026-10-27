import json

import jsonschema
import pytest

from conftest import EXAMPLE_CAMERAS, REPO_ROOT, detect_white_boxes, write_clip
from vision.cameras import CameraConfig, load_cameras
from vision.record import main, record_cameras
from vision.replay import load_dataset, write_dataset

SCHEMA = json.loads((REPO_ROOT / "packages/contracts/schemas/camera-reading.schema.json").read_text())
TWO_PEOPLE = [(10, 40, 20, 80), (60, 40, 70, 80)]
THREE_PEOPLE = [*TWO_PEOPLE, (40, 40, 50, 80)]


def _camera(source: str | None, kind: str = "crowd", camera_id: str = "kafe-merkez") -> CameraConfig:
    thresholds = None if kind == "parking" else {"medium": 2, "high": 5}
    return CameraConfig(id=camera_id, kind=kind, source=source, sample_fps=5.0, thresholds=thresholds)


def test_records_every_sampled_frame_once_with_its_offset_in_the_clip(tmp_path) -> None:
    # 10 frames at 10 fps sampled at 5 fps: frames 0, 2, 4, 6, 8, i.e. 0.0 s to 0.8 s into the clip.
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 4 + [THREE_PEOPLE] * 6, fps=10.0)
    lines = record_cameras([_camera(clip)], lambda: detect_white_boxes)
    assert [line["offsetS"] for line in lines] == [0.0, 0.2, 0.4, 0.6, 0.8]
    # Smoothed as live: the median of the last 5 samples (2, 2, 3, 3, 3), CLAUDE.md §3.3.
    assert [line["count"] for line in lines] == [2, 2, 2, 3, 3]
    assert {line["cameraId"] for line in lines} == {"kafe-merkez"}
    assert {line["source"] for line in lines} == {"demo-footage"}


def test_recorded_dataset_matches_the_contract_schema(tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 10, fps=10.0)
    out = tmp_path / "out" / "demo.jsonl"
    write_dataset(out, record_cameras([_camera(clip)], lambda: detect_white_boxes))
    stored = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]
    assert stored
    for line in stored:
        reading = {key: value for key, value in line.items() if key != "offsetS"}
        jsonschema.validate({**reading, "measuredAt": "2026-10-27T07:00:00Z"}, SCHEMA)
    tracks = load_dataset(out, load_cameras(EXAMPLE_CAMERAS))
    assert [offset for offset, _ in tracks["kafe-merkez"]] == [0.0, 0.2, 0.4, 0.6, 0.8]


def test_skips_cameras_without_a_source_or_an_analyzer(tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [TWO_PEOPLE] * 4, fps=10.0)
    cameras = [
        _camera(None, camera_id="kutuphane-giris"),
        _camera(clip, kind="parking", camera_id="otopark-a"),
        _camera(clip),
    ]
    lines = record_cameras(cameras, lambda: detect_white_boxes)
    assert {line["cameraId"] for line in lines} == {"kafe-merkez"}


def test_refuses_a_webcam(tmp_path) -> None:
    with pytest.raises(ValueError, match="video file"):
        record_cameras([_camera("0")], lambda: detect_white_boxes)


def test_fails_loudly_when_a_clip_cannot_be_read(tmp_path) -> None:
    with pytest.raises(RuntimeError, match="kafe-merkez"):
        record_cameras([_camera(str(tmp_path / "missing.avi"))], lambda: detect_white_boxes)


def test_fails_when_there_is_nothing_to_record() -> None:
    with pytest.raises(ValueError, match="source"):
        record_cameras(load_cameras(EXAMPLE_CAMERAS), lambda: detect_white_boxes)


def test_cli_writes_nothing_when_recording_fails(tmp_path) -> None:
    out = tmp_path / "demo.jsonl"
    with pytest.raises(ValueError):
        main(["--cameras", str(EXAMPLE_CAMERAS), "--out", str(out)])
    assert not out.exists()
