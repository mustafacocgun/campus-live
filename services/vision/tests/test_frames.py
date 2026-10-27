import cv2
import numpy as np
import pytest

from vision.frames import frames_to_clip, main


def _frames(folder, numbers: list[int], size: tuple[int, int] = (64, 48)) -> None:
    """PNG frames named like WILDTRACK's (00000000.png, 00000005.png, ...); gray level = the number."""
    folder.mkdir(exist_ok=True)
    width, height = size
    for number in numbers:
        cv2.imwrite(str(folder / f"{number:08d}.png"), np.full((height, width, 3), number, dtype=np.uint8))


def _read(path: str) -> tuple[float, list[int]]:
    capture = cv2.VideoCapture(path)
    fps = capture.get(cv2.CAP_PROP_FPS)
    levels = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        levels.append(int(round(frame.mean())))
    capture.release()
    return fps, levels


def test_frames_with_gaps_in_their_numbers_become_one_clip_in_order(tmp_path) -> None:
    # Written out of order, numbered in steps of 5: OpenCV's image-sequence reader cannot read these.
    _frames(tmp_path / "C1", [100, 0, 50, 5, 200, 10])
    out = tmp_path / "videos" / "c1.avi"
    assert frames_to_clip(tmp_path / "C1", out, fps=2.0) == 6
    fps, levels = _read(str(out))
    assert fps == 2.0
    # MJPG is lossy, so the gray levels come back approximately.
    assert levels == pytest.approx([0, 5, 10, 50, 100, 200], abs=3)


def test_orders_by_number_not_by_name(tmp_path) -> None:
    folder = tmp_path / "unpadded"
    folder.mkdir()
    for number in (100, 5, 10):  # by name: 10, 100, 5
        cv2.imwrite(str(folder / f"{number}.png"), np.full((48, 64, 3), number, dtype=np.uint8))
    frames_to_clip(folder, tmp_path / "u.avi", fps=2.0)
    assert _read(str(tmp_path / "u.avi"))[1] == pytest.approx([5, 10, 100], abs=3)


def test_ignores_files_that_are_not_frames(tmp_path) -> None:
    _frames(tmp_path / "C1", [0, 5])
    (tmp_path / "C1" / ".DS_Store").write_bytes(b"\0")
    (tmp_path / "C1" / "notes.txt").write_text("x", encoding="utf-8")
    assert frames_to_clip(tmp_path / "C1", tmp_path / "c1.avi", fps=2.0) == 2


def test_refuses_an_empty_folder_and_frames_of_different_sizes(tmp_path) -> None:
    (tmp_path / "empty").mkdir()
    with pytest.raises(ValueError, match="no frames"):
        frames_to_clip(tmp_path / "empty", tmp_path / "e.avi", fps=2.0)
    _frames(tmp_path / "mixed", [0], size=(64, 48))
    _frames(tmp_path / "mixed", [5], size=(32, 24))
    with pytest.raises(ValueError, match="00000005.png"):
        frames_to_clip(tmp_path / "mixed", tmp_path / "m.avi", fps=2.0)


def test_cli(tmp_path) -> None:
    _frames(tmp_path / "C4", [0, 5, 10])
    main([str(tmp_path / "C4"), str(tmp_path / "c4.avi"), "--fps", "2"])
    assert _read(str(tmp_path / "c4.avi"))[0] == 2.0
