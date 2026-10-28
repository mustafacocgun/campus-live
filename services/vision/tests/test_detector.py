import os
import subprocess
import sys
import threading
import time
import types
from pathlib import Path

import numpy as np

from conftest import fake_yolo
from vision.detector import (
    PARKED,
    PERSON,
    VEHICLES,
    WEIGHTS,
    TestBoxesDetector,
    YoloDetector,
    detect_test_boxes,
)


def test_detector_turns_off_ultralytics_analytics(monkeypatch) -> None:
    # Ultralytics sends usage analytics unless YOLO_OFFLINE is set before it is imported.
    # Version 8.3.x only reads "true".
    seen = {}
    fake_ultralytics = types.ModuleType("ultralytics")
    fake_ultralytics.YOLO = lambda weights: seen.setdefault("offline", os.environ.get("YOLO_OFFLINE"))
    monkeypatch.setitem(sys.modules, "ultralytics", fake_ultralytics)
    monkeypatch.setattr(os, "environ", {k: v for k, v in os.environ.items() if k != "YOLO_OFFLINE"})
    YoloDetector(classes=[0])
    assert seen["offline"].lower() == "true"


def test_weights_path_is_git_ignored() -> None:
    # The weights download on first use: an AGPL-3.0 binary that must never end up in a commit.
    result = subprocess.run(["git", "check-ignore", "--quiet", str(WEIGHTS)], cwd=WEIGHTS.parent.parent)
    assert result.returncode == 0


def test_test_boxes_detector_finds_white_rectangles_only() -> None:
    # For automated tests: a white rectangle in a synthetic clip is a person; nothing else is.
    frame = np.zeros((60, 100, 3), dtype=np.uint8)
    frame[10:40, 5:15] = 255  # white: a person
    frame[10:40, 30:40] = 128  # grey
    frame[10:40, 60:70] = (0, 0, 255)  # red
    detections = detect_test_boxes(frame)
    assert detections.xyxy.tolist() == [[5, 10, 15, 40]]
    assert detections.class_id.tolist() == [0]


def test_weights_download_once_for_many_workers(monkeypatch, tmp_path) -> None:
    # Every crowd worker builds its own model (models are not thread-safe), but the first run must not
    # download the weights into the same file several times at once (#10).
    weights = tmp_path / "yolo11n.pt"
    downloads, inside, most_inside = [], [], []
    lock = threading.Lock()

    def fake_yolo(path):
        with lock:
            inside.append(1)
            most_inside.append(len(inside))
        if not Path(path).exists():
            time.sleep(0.05)  # a slow download
            downloads.append(path)
            Path(path).write_bytes(b"weights")
        with lock:
            inside.pop()
        return types.SimpleNamespace()

    fake_ultralytics = types.ModuleType("ultralytics")
    fake_ultralytics.YOLO = fake_yolo
    monkeypatch.setitem(sys.modules, "ultralytics", fake_ultralytics)
    workers = [threading.Thread(target=YoloDetector, args=([0], weights)) for _ in range(6)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(5)
    assert len(downloads) == 1
    assert max(most_inside) == 1


def test_detector_sets_the_input_size_only_when_asked(monkeypatch) -> None:
    # Distant cars are a few pixels at YOLO's default 640 px: parking cameras ask for more (#50).
    calls = fake_yolo(monkeypatch)
    frame = np.zeros((72, 128, 3), dtype=np.uint8)
    YoloDetector(PARKED, imgsz=1280)(frame)
    YoloDetector(PERSON)(frame)
    assert calls[0]["imgsz"] == 1280
    assert "imgsz" not in calls[1]


def test_test_boxes_detector_tells_people_from_cars() -> None:
    # White boxes are people, yellow boxes are cars; each kind of camera asks for its own classes.
    frame = np.zeros((60, 100, 3), dtype=np.uint8)
    frame[10:40, 5:15] = 255  # white: a person
    frame[30:50, 40:70] = (0, 220, 255)  # yellow (BGR): a car
    assert sorted(detect_test_boxes(frame).class_id.tolist()) == [0, 2]
    assert TestBoxesDetector(PERSON)(frame).xyxy.tolist() == [[5, 10, 15, 40]]
    assert TestBoxesDetector(VEHICLES)(frame).xyxy.tolist() == [[40, 30, 70, 50]]
    assert TestBoxesDetector(PARKED)(frame).class_id.tolist() == [2]
