import importlib
import os
from pathlib import Path

import pytest


def test_real_yolo_finds_the_people_in_ultralytics_bus_photo() -> None:
    # The real detector, end to end: weights download, model load, inference, person class only.
    # Skipped without the yolo extra, except where VISION_REQUIRE_YOLO is set (CI's yolo-smoke job):
    # there a broken torch or ultralytics install must fail, not skip.
    if os.environ.get("VISION_REQUIRE_YOLO"):
        ultralytics = importlib.import_module("ultralytics")
    else:
        ultralytics = pytest.importorskip("ultralytics")
    import cv2

    from vision.detector import PERSON, YoloDetector

    frame = cv2.imread(str(Path(ultralytics.__file__).parent / "assets" / "bus.jpg"))
    detections = YoloDetector(PERSON)(frame)
    assert len(detections) >= 3  # the photo shows four people in front of a bus
    assert set(detections.class_id.tolist()) == {0}
