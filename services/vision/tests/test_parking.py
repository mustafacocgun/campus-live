import numpy as np
import pytest
import supervision as sv

from conftest import NOW
from vision.analyzers.parking import ParkingAnalyzer
from vision.cameras import CameraConfig

FRAME = (100, 100)  # width, height
# Two slots side by side in the lower half of the frame (fractions of width and height).
SLOTS = [
    [(0.1, 0.5), (0.4, 0.5), (0.4, 0.9), (0.1, 0.9)],
    [(0.6, 0.5), (0.9, 0.5), (0.9, 0.9), (0.6, 0.9)],
]


def cars(*boxes: list[float]) -> sv.Detections:
    if not boxes:
        return sv.Detections.empty()
    return sv.Detections(
        xyxy=np.array(boxes, dtype=float),
        confidence=np.full(len(boxes), 0.9),
        class_id=np.full(len(boxes), 2),
    )


def _analyzer(slots=SLOTS) -> ParkingAnalyzer:
    return ParkingAnalyzer(CameraConfig(id="otopark-1", kind="parking", slots=slots))


def test_a_slot_is_taken_only_by_a_car_covering_it() -> None:
    # A car fills the left slot; another only touches the right slot's corner while driving past.
    reading = _analyzer().update(cars([12, 52, 38, 88], [85, 85, 99, 99]), FRAME, NOW, "demo-footage")
    assert (reading.kind, reading.count) == ("parking", 1)
    assert (reading.parking.total, reading.parking.free) == (2, 1)
    assert reading.cells is None


def test_one_missed_frame_does_not_free_a_slot() -> None:
    analyzer = _analyzer()
    parked = cars([12, 52, 38, 88])
    frames = [parked, parked, sv.Detections.empty(), parked]
    assert [analyzer.update(d, FRAME, NOW, "demo-footage").parking.free for d in frames] == [1, 1, 1, 1]


def test_a_full_lot_is_busy() -> None:
    reading = _analyzer().update(cars([12, 52, 38, 88], [62, 52, 88, 88]), FRAME, NOW, "demo-footage")
    assert (reading.parking.free, reading.level) == (0, "high")


def test_a_parking_camera_needs_outlined_slots() -> None:
    with pytest.raises(ValueError, match="slot"):
        _analyzer(slots=None)
