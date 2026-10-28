import json

import jsonschema
import numpy as np
import pytest

from conftest import EXAMPLE_CAMERAS, REPO_ROOT
from vision.cameras import CameraConfig
from vision.config import Settings
from vision.record import main, record_cameras
from vision.registry import load_registry
from vision.replay import load_dataset, write_dataset

SCHEMA = json.loads((REPO_ROOT / "packages/contracts/schemas/camera-reading.schema.json").read_text())
TEST_BOXES = Settings(_env_file=None, detector="test-boxes")
PERSON_BOX = (10, 50, 20, 90)  # white
CAR_BOX = (60, 55, 90, 85)  # yellow
SLOT = [[0.55, 0.5], [0.95, 0.5], [0.95, 0.9], [0.55, 0.9]]  # under the car


def _clip(path, people_per_frame: list[int], car: bool = True, fps: float = 10.0) -> str:
    """A 100x100 MJPG clip: n white people side by side, and a yellow car in the slot."""
    import cv2

    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (100, 100))
    for n in people_per_frame:
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        for i in range(n):
            x1, y1, x2, y2 = PERSON_BOX
            frame[y1:y2, x1 + 12 * i : x2 + 12 * i] = 255
        if car:
            x1, y1, x2, y2 = CAR_BOX
            frame[y1:y2, x1:x2] = (0, 220, 255)  # BGR yellow
        writer.write(frame)
    writer.release()
    return str(path)


def _registry(tmp_path) -> dict:
    def registered(camera_id: str, kind: str) -> dict:
        return {
            "id": camera_id,
            "name": camera_id,
            "section": "s",
            "kind": kind,
            "latitude": 40.742,
            "longitude": 30.332,
            "heading": 0,
            "fovDeg": 60,
            "rangeM": 30,
            "place": camera_id,
            "indoor": False,
        }

    path = tmp_path / "registry.json"
    cameras = [
        registered("meydan", "crowd"),
        registered("otopark-1", "parking"),
        registered("yol-1", "traffic"),
    ]
    path.write_text(json.dumps({"cameras": cameras}), encoding="utf-8")
    return load_registry(path)


def _cameras(clip: str, **crowd) -> list[CameraConfig]:
    thresholds = {"medium": 2, "high": 5}
    return [
        CameraConfig(id="meydan", kind="crowd", source=clip, sample_fps=5, thresholds=thresholds, **crowd),
        CameraConfig(id="otopark-1", kind="parking", source=clip, sample_fps=5, slots=[SLOT]),
        CameraConfig(id="yol-1", kind="traffic", source=clip, sample_fps=5, thresholds=thresholds),
    ]


def test_records_every_sampled_frame_once_with_its_offset_in_the_clip(tmp_path) -> None:
    # 10 frames at 10 fps sampled at 5 fps: frames 0, 2, 4, 6, 8, i.e. 0.0 s to 0.8 s into the clip.
    clip = _clip(tmp_path / "c.avi", [1] * 4 + [3] * 6)
    lines = record_cameras(TEST_BOXES, _cameras(clip), _registry(tmp_path))
    crowd = [line for line in lines if line["cameraId"] == "meydan"]
    assert [line["offsetS"] for line in crowd] == [0.0, 0.2, 0.4, 0.6, 0.8]
    # Smoothed as live: the median of the last 5 samples (1, 1, 3, 3, 3), CLAUDE.md §3.3.
    assert [line["count"] for line in crowd] == [1, 1, 1, 3, 3]
    assert all(line["cells"] for line in crowd)  # outdoors: where the people are, as live


def test_records_parking_and_traffic_through_their_own_analyzers(tmp_path) -> None:
    clip = _clip(tmp_path / "c.avi", [1] * 10)
    lines = record_cameras(TEST_BOXES, _cameras(clip), _registry(tmp_path))
    parking = [line for line in lines if line["cameraId"] == "otopark-1"]
    traffic = [line for line in lines if line["cameraId"] == "yol-1"]
    assert {(line["parking"]["total"], line["parking"]["free"]) for line in parking} == {(1, 0)}
    assert {line["count"] for line in traffic} == {1}
    assert all("cells" not in line for line in parking + traffic)
    # Test clips stay labelled as what they are, recorded or not (CLAUDE.md §3.4).
    assert {line["source"] for line in lines} == {"simulated"}


def test_records_from_the_start_of_the_clip_whatever_its_live_start(tmp_path) -> None:
    clip = _clip(tmp_path / "c.avi", [1] * 10)
    lines = record_cameras(TEST_BOXES, _cameras(clip, start_s=0.5), _registry(tmp_path))
    assert [line["offsetS"] for line in lines if line["cameraId"] == "meydan"] == [0.0, 0.2, 0.4, 0.6, 0.8]


def test_recorded_dataset_matches_the_schema_and_loads_back(tmp_path) -> None:
    clip = _clip(tmp_path / "c.avi", [2] * 10)
    cameras = _cameras(clip)
    out = tmp_path / "out" / "demo.jsonl"
    write_dataset(out, record_cameras(TEST_BOXES, cameras, _registry(tmp_path)))
    stored = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]
    assert len(stored) == 15
    for line in stored:
        reading = {key: value for key, value in line.items() if key != "offsetS"}
        jsonschema.validate({**reading, "measuredAt": "2026-10-27T07:00:00Z"}, SCHEMA)
    assert sorted(load_dataset(out, cameras)) == ["meydan", "otopark-1", "yol-1"]


def test_skips_cameras_without_footage(tmp_path) -> None:
    clip = _clip(tmp_path / "c.avi", [1] * 4)
    cameras = _cameras(clip)
    cameras[1] = cameras[1].model_copy(update={"source": None})
    lines = record_cameras(TEST_BOXES, cameras, _registry(tmp_path))
    assert {line["cameraId"] for line in lines} == {"meydan", "yol-1"}


def test_refuses_a_webcam(tmp_path) -> None:
    with pytest.raises(ValueError, match="video file"):
        record_cameras(TEST_BOXES, _cameras("0"), _registry(tmp_path))


def test_fails_loudly_when_a_clip_cannot_be_read(tmp_path) -> None:
    with pytest.raises(RuntimeError, match="meydan"):
        record_cameras(TEST_BOXES, _cameras(str(tmp_path / "missing.avi")), _registry(tmp_path))


def test_cli_writes_nothing_when_there_is_nothing_to_record(tmp_path) -> None:
    # The example config lists every camera without footage.
    out = tmp_path / "demo.jsonl"
    with pytest.raises(ValueError, match="footage"):
        main(["--cameras", str(EXAMPLE_CAMERAS), "--out", str(out)])
    assert not out.exists()
