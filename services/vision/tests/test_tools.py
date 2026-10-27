import subprocess
import sys

import cv2
import numpy as np

from conftest import VISION_DIR
from vision.cameras import load_cameras
from vision.detector import detect_test_boxes
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
