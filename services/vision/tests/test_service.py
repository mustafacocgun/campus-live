import json
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from conftest import (
    EXAMPLE_CAMERAS,
    NOW,
    fake_yolo,
    synthetic_camera,
    synthetic_pixels,
    write_clip,
    write_wildtrack,
)
from vision.cameras import CameraConfig, load_cameras
from vision.config import Settings
from vision.registry import load_registry
from vision.service import build_workers, projector_for

THRESHOLDS = "thresholds: {medium: 1, high: 2}"


def test_service_defaults_to_yolo(monkeypatch) -> None:
    # Live YOLO is the only data source in the app (CLAUDE.md §3.4).
    for name in ("VISION_DETECTOR", "VISION_PUBLISH_INTERVAL_S"):
        monkeypatch.delenv(name, raising=False)
    settings = Settings(_env_file=None)
    assert (settings.detector, settings.publish_interval_s) == ("yolo", 0.5)


def test_status_lists_running_cameras_without_frames(monkeypatch, tmp_path) -> None:
    clip = write_clip(str(tmp_path / "c.avi"), [[(10, 40, 20, 80)]] * 30)
    config = tmp_path / "cameras.yaml"
    # Kantin has no footage: it does not run, and the map shows it grey.
    config.write_text(
        f"cameras:\n  - {{id: tas-kafe, kind: crowd, source: '{clip}', {THRESHOLDS}}}\n"
        f"  - {{id: kantin, kind: crowd, {THRESHOLDS}}}\n"
    )
    monkeypatch.setenv("VISION_DETECTOR", "test-boxes")
    monkeypatch.setenv("VISION_CAMERAS_FILE", str(config))
    monkeypatch.setenv("VISION_API_URL", "http://127.0.0.1:9")  # nothing listens: publishing just fails
    from vision.service import app

    with TestClient(app) as client:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            status = client.get("/status").json()
            if status["cameras"][0]["lastReadingAt"]:
                break
            time.sleep(0.05)
    assert status["detector"] == "test-boxes"
    assert [c["cameraId"] for c in status["cameras"]] == ["tas-kafe"]
    assert status["cameras"][0]["lastReadingAt"] is not None
    # Numbers and short strings only: no image data ever leaves the service (CLAUDE.md §0.2).
    for camera in status["cameras"]:
        assert all(
            v is None or isinstance(v, int | float | bool) or len(str(v)) < 60 for v in camera.values()
        )


def test_unknown_camera_fails_at_startup(tmp_path) -> None:
    # A reading for a camera the API does not know would be rejected: say so before running.
    config = tmp_path / "cameras.yaml"
    config.write_text(f"cameras:\n  - {{id: nowhere, kind: crowd, source: x.mp4, {THRESHOLDS}}}\n")
    with pytest.raises(ValueError, match="nowhere"):
        build_workers(Settings(_env_file=None), load_cameras(config), load_registry())


def test_wildtrack_camera_projects_through_its_calibration(tmp_path) -> None:
    rotation, t = synthetic_camera()
    write_wildtrack(tmp_path, "CVLab1", rotation, t)
    camera = CameraConfig.model_validate(
        {
            "id": "kutuphane-meydani-1",
            "kind": "crowd",
            "thresholds": {"medium": 1, "high": 2},
            "wildtrack": {
                "camera": 1,
                "dataset_dir": str(tmp_path),
                "anchor": {"lat": 40.7415, "lng": 30.3326},
            },
        }
    )
    project = projector_for(camera, load_registry()["kutuphane-meydani-1"])
    x, y = synthetic_pixels(rotation, t, np.array([[0.0, 1000.0]]))[0]  # 10 m north of the anchor
    [(lat, lng)] = project(np.array([[x - 10, y - 80, x + 10, y]]), (1920, 1080))
    assert (lat - 40.7415) * 111_320 == pytest.approx(10, abs=0.01)
    assert lng == pytest.approx(30.3326, abs=1e-7)


def test_other_cameras_project_through_their_registered_pose() -> None:
    camera = CameraConfig(id="tas-kafe", kind="crowd", thresholds={"medium": 1, "high": 2})
    registered = load_registry()["tas-kafe"]
    project = projector_for(camera, registered)
    # The bottom centre of the image lands in front of the camera, along its heading.
    [(lat, lng)] = project(np.array([[45.0, 80.0, 55.0, 100.0]]), (100, 100))
    north = (lat - registered.latitude) * 111_320
    east = (lng - registered.longitude) * 111_320 * np.cos(np.radians(registered.latitude))
    bearing = np.degrees(np.arctan2(east, north)) % 360
    assert bearing == pytest.approx(registered.heading, abs=0.5)


def test_test_clips_are_labelled_simulated_and_footage_demo(tmp_path) -> None:
    # Readings from synthetic clips must never pass for footage, and footage never for a real camera.
    config = tmp_path / "cameras.yaml"
    config.write_text(f"cameras:\n  - {{id: tas-kafe, kind: crowd, source: x.avi, {THRESHOLDS}}}\n")
    cameras, registry = load_cameras(config), load_registry()
    [boxes] = build_workers(Settings(_env_file=None, detector="test-boxes"), cameras, registry)
    [yolo] = build_workers(Settings(_env_file=None, detector="yolo"), cameras, registry)
    assert (boxes.source_kind, yolo.source_kind) == ("simulated", "demo-footage")


def _registered(camera_id: str, kind: str, place: str, indoor: bool = False) -> dict:
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
        "place": place,
        "indoor": indoor,
    }


def _one_camera_of_each_kind(tmp_path) -> tuple[list[CameraConfig], dict]:
    registry_file = tmp_path / "registry.json"
    registry_file.write_text(
        json.dumps(
            {
                "cameras": [
                    _registered("meydan", "crowd", "meydan"),
                    _registered("muh-ic", "crowd", "muhendislik", indoor=True),
                    _registered("otopark-1", "parking", "otopark-1"),
                    _registered("yol-1", "traffic", "kampus-ici-yolu"),
                ]
            }
        )
    )
    config = tmp_path / "cameras.yaml"
    config.write_text(
        "cameras:\n"
        f"  - {{id: meydan, kind: crowd, source: a.avi, {THRESHOLDS}}}\n"
        f"  - {{id: muh-ic, kind: crowd, source: a.avi, {THRESHOLDS}}}\n"
        "  - {id: otopark-1, kind: parking, source: a.avi,"
        " slots: [[[0.1, 0.5], [0.4, 0.5], [0.4, 0.9], [0.1, 0.9]]]}\n"
        f"  - {{id: yol-1, kind: traffic, source: a.avi, {THRESHOLDS}}}\n"
    )
    return load_cameras(config), load_registry(registry_file)


def test_each_kind_of_camera_gets_its_analyzer_and_classes(tmp_path) -> None:
    workers = build_workers(
        Settings(_env_file=None, detector="test-boxes"), *_one_camera_of_each_kind(tmp_path)
    )
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    frame[50:90, 10:20] = 255  # a person
    frame[55:85, 60:90] = (0, 220, 255)  # a car
    seen, readings = {}, {}
    for worker in workers:
        detections = worker.detector_factory()(frame)
        seen[worker.camera.id] = detections.class_id.tolist()
        readings[worker.camera.id] = worker.analyzer_factory().update(
            detections, (100, 100), NOW, "simulated"
        )
    assert seen == {"meydan": [0], "muh-ic": [0], "otopark-1": [2], "yol-1": [2]}
    assert readings["meydan"].cells  # outdoors: where people are
    assert readings["muh-ic"].cells is None  # indoors: counts only
    assert (readings["otopark-1"].kind, readings["otopark-1"].parking.total) == ("parking", 1)
    assert (readings["yol-1"].kind, readings["yol-1"].count) == ("traffic", 1)


def test_parking_cameras_detect_at_1280_px(monkeypatch, tmp_path) -> None:
    # At 640 px YOLO misses most parked cars; at 1280 two of three PKLot lots match the labels (#50).
    calls = fake_yolo(monkeypatch)
    workers = build_workers(Settings(_env_file=None, detector="yolo"), *_one_camera_of_each_kind(tmp_path))
    sizes = {}
    for worker in workers:
        worker.detector_factory()(np.zeros((72, 128, 3), dtype=np.uint8))
        sizes[worker.camera.id] = calls[-1].get("imgsz")
    assert sizes == {"meydan": None, "muh-ic": None, "otopark-1": 1280, "yol-1": None}


def _dataset(tmp_path, *lines: dict) -> str:
    path = tmp_path / "demo.jsonl"
    path.write_text("".join(json.dumps(line) + "\n" for line in lines), encoding="utf-8")
    return str(path)


CROWD_LINE = {"offsetS": 0.0, "kind": "crowd", "count": 4, "level": "low", "source": "demo-footage"}
PARKING_LINE = {
    "offsetS": 0.0,
    "kind": "parking",
    "count": 1,
    "level": "low",
    "parking": {"total": 1, "free": 0},
    "source": "demo-footage",
}


def test_replay_runs_the_recorded_cameras_and_leaves_the_rest_grey(tmp_path) -> None:
    # Nothing is made up for a camera without recorded readings (CLAUDE.md §4.3): it does not run.
    dataset = _dataset(
        tmp_path, CROWD_LINE | {"cameraId": "meydan"}, PARKING_LINE | {"cameraId": "otopark-1"}
    )
    settings = Settings(_env_file=None, detector="replay", replay_file=dataset)
    workers = build_workers(settings, *_one_camera_of_each_kind(tmp_path))
    assert {worker.camera.id: worker.mode for worker in workers} == {
        "meydan": "replay",
        "otopark-1": "replay",
    }


def test_replay_refuses_to_start_without_its_dataset(tmp_path) -> None:
    settings = Settings(_env_file=None, detector="replay", replay_file=str(tmp_path / "missing.jsonl"))
    with pytest.raises(FileNotFoundError):
        build_workers(settings, *_one_camera_of_each_kind(tmp_path))


def test_replay_service_reports_replay(monkeypatch, tmp_path) -> None:
    camera = load_cameras(EXAMPLE_CAMERAS)[0]
    monkeypatch.setenv("VISION_DETECTOR", "replay")
    monkeypatch.setenv("VISION_CAMERAS_FILE", str(EXAMPLE_CAMERAS))
    monkeypatch.setenv("VISION_REPLAY_FILE", _dataset(tmp_path, CROWD_LINE | {"cameraId": camera.id}))
    monkeypatch.setenv("VISION_API_URL", "http://127.0.0.1:9")
    from vision.service import app

    with TestClient(app) as client:
        status = client.get("/status").json()
    assert status["detector"] == "replay"
    assert [(c["cameraId"], c["mode"]) for c in status["cameras"]] == [(camera.id, "replay")]
