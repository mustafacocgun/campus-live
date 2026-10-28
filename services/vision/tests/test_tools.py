import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import yaml

from conftest import VISION_DIR, write_clip
from vision.cameras import load_cameras
from vision.detector import PARKED, TestBoxesDetector, detect_test_boxes
from vision.registry import load_registry


def run_tool(*args: str) -> None:
    subprocess.run([sys.executable, *args], cwd=VISION_DIR, check=True, capture_output=True)


def test_make_test_clips_writes_a_moving_clip_and_a_config_per_camera(tmp_path) -> None:
    run_tool("tools/make_test_clips.py", "--out", str(tmp_path), "--seconds", "2")
    cameras = load_cameras(tmp_path / "cameras.yaml")
    assert [camera.id for camera in cameras] == list(load_registry())
    first = cameras[0]
    assert first.wildtrack is None  # synthetic clips use the estimated pose, never a dataset
    capture = cv2.VideoCapture(first.source)
    frames = []
    while (frame := capture.read()[1]) is not None:
        frames.append(frame)
    assert len(frames) == 2 * 10  # 2 s at 10 fps
    boxes = [detect_test_boxes(frame).xyxy for frame in (frames[0], frames[-1])]
    assert len(boxes[0]) >= 1
    assert not np.array_equal(boxes[0], boxes[1])  # people walk


def test_frames_to_video_keeps_order_size_and_rate(tmp_path) -> None:
    frames = tmp_path / "C1"
    frames.mkdir()
    for index in range(55, -1, -5):  # named like WILDTRACK's frames, written last first
        image = np.zeros((90, 160, 3), dtype=np.uint8)
        image[:, : 10 + index * 2] = 255
        cv2.imwrite(str(frames / f"{index:08d}.png"), image)
    out = tmp_path / "c1.mp4"
    run_tool("tools/frames_to_video.py", str(frames), str(out), "--fps", "10")
    capture = cv2.VideoCapture(str(out))
    assert capture.get(cv2.CAP_PROP_FPS) == 10
    widths = []
    while (frame := capture.read()[1]) is not None:
        assert frame.shape == (90, 160, 3)
        widths.append(int((frame[45].min(axis=1) > 127).sum()))
    assert len(widths) == 12
    assert widths == sorted(widths)  # 00000000, 00000005, ... in name order


def _registered(camera_id: str, kind: str) -> dict:
    return {
        "id": camera_id,
        "name": camera_id,
        "section": "s",
        "kind": kind,
        "latitude": 40.742,
        "longitude": 30.332,
        "heading": 90,
        "fovDeg": 60,
        "rangeM": 30,
        "place": camera_id,
    }


def test_make_test_clips_draws_cars_and_outlines_parking_slots(tmp_path) -> None:
    registry = tmp_path / "registry.json"
    registry.write_text(
        json.dumps(
            {
                "cameras": [
                    _registered(i, k)
                    for i, k in [("meydan", "crowd"), ("otopark-1", "parking"), ("yol-1", "traffic")]
                ]
            }
        )
    )
    config = tmp_path / "example.yaml"
    config.write_text(
        "cameras:\n"
        "  - {id: meydan, kind: crowd, thresholds: {medium: 1, high: 2}}\n"
        "  - {id: otopark-1, kind: parking}\n"
        "  - {id: yol-1, kind: traffic, thresholds: {medium: 1, high: 2}}\n"
    )
    out = tmp_path / "clips"
    run_tool(
        "tools/make_test_clips.py",
        "--out",
        str(out),
        "--seconds",
        "2",
        "--config",
        str(config),
        "--registry",
        str(registry),
    )
    cameras = {camera.id: camera for camera in load_cameras(out / "cameras.yaml")}
    lot = cameras["otopark-1"]
    assert lot.slots and len(lot.slots) >= 4
    parked = TestBoxesDetector(PARKED)(cv2.VideoCapture(lot.source).read()[1])
    assert 1 <= len(parked) < len(lot.slots)  # some slots taken, some free
    road = cv2.VideoCapture(cameras["yol-1"].source)
    first, last = road.read()[1], [road.read()[1] for _ in range(19)][-1]
    assert not np.array_equal(TestBoxesDetector(PARKED)(first).xyxy, TestBoxesDetector(PARKED)(last).xyxy)


def _plaza_config(path: Path) -> Path:
    anchor = "anchor: {lat: 40.7415, lng: 30.3326}"
    lines = ["cameras:"]
    lines += [
        f"  - {{id: p{n}, kind: crowd, thresholds: {{medium: 1, high: 2}},"
        f" wildtrack: {{camera: {n}, {anchor}}}}}"
        for n in range(1, 8)
    ]
    lines += [f"  - {{id: o{n}, kind: crowd, thresholds: {{medium: 1, high: 2}}}}" for n in range(3)]
    lines += ["  - {id: park, kind: parking}"]
    path.write_text("\n".join(lines) + "\n")
    return path


def test_assign_clips_is_reproducible_and_keeps_the_plaza_in_sync(tmp_path) -> None:
    clips = tmp_path / "clips"
    clips.mkdir()
    for view in range(1, 8):
        for index in range(3):
            write_clip(str(clips / f"C{view}_{index:03d}.avi"), [[(10, 40, 20, 80)]] * 20, fps=10.0)
    config = _plaza_config(tmp_path / "cameras.yaml")
    for out in ("a.yaml", "b.yaml"):
        run_tool(
            "tools/assign_clips.py",
            "--clips",
            str(clips),
            "--config",
            str(config),
            "--out",
            str(tmp_path / out),
            "--seed",
            "7",
        )
    assert (tmp_path / "a.yaml").read_text() == (tmp_path / "b.yaml").read_text()
    cameras = {camera.id: camera for camera in load_cameras(tmp_path / "a.yaml")}
    plaza = [cameras[f"p{n}"] for n in range(1, 8)]
    assert [Path(camera.source).stem.split("_")[0] for camera in plaza] == [f"C{n}" for n in range(1, 8)]
    assert len({Path(camera.source).stem.split("_")[1] for camera in plaza}) == 1  # one clip index
    assert len({camera.start_s for camera in plaza}) == 1  # one start: the 7 views stay in sync
    assert all(cameras[f"o{n}"].source for n in range(3))
    assert cameras["park"].source is None  # other kinds keep their footage


def test_assign_clips_gives_a_parking_clips_slots_to_its_cameras(tmp_path) -> None:
    clips = tmp_path / "parking"
    clips.mkdir()
    write_clip(str(clips / "lot.avi"), [[]] * 20, fps=10.0)
    (clips / "lot.avi.slots.yaml").write_text("slots:\n- [[0.1, 0.5], [0.4, 0.5], [0.4, 0.9], [0.1, 0.9]]\n")
    config = _plaza_config(tmp_path / "cameras.yaml")
    out = tmp_path / "out.yaml"
    run_tool(
        "tools/assign_clips.py",
        "--clips",
        str(clips),
        "--config",
        str(config),
        "--out",
        str(out),
        "--kind",
        "parking",
    )
    park = {camera.id: camera for camera in load_cameras(out)}["park"]
    assert Path(park.source).name == "lot.avi"
    assert park.slots == [[(0.1, 0.5), (0.4, 0.5), (0.4, 0.9), (0.1, 0.9)]]


def test_draw_slots_saves_outlines_as_fractions(tmp_path) -> None:
    spec = importlib.util.spec_from_file_location("draw_slots", VISION_DIR / "tools" / "draw_slots.py")
    draw_slots = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(draw_slots)
    slots = draw_slots.to_fractions([[(10, 20), (30, 20), (30, 40), (10, 40)]], (100, 200))
    assert slots == [[[0.1, 0.1], [0.3, 0.1], [0.3, 0.2], [0.1, 0.2]]]
    draw_slots.save(tmp_path / "lot.avi.slots.yaml", slots)
    assert yaml.safe_load((tmp_path / "lot.avi.slots.yaml").read_text()) == {"slots": slots}
