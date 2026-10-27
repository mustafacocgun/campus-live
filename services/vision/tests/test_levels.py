from vision.analyzers.levels import level_for_count, level_for_parking
from vision.cameras import Thresholds


def test_level_boundaries() -> None:
    thresholds = Thresholds(medium=10, high=25)
    levels = [level_for_count(n, thresholds) for n in (0, 9, 10, 24, 25, 99)]
    assert levels == ["low", "low", "medium", "medium", "high", "high"]


def test_parking_levels() -> None:
    assert level_for_parking(2, 40) == "high"  # 5 % free
    assert level_for_parking(4, 40) == "medium"  # exactly 10 %
    assert level_for_parking(10, 40) == "medium"  # 25 %
    assert level_for_parking(12, 40) == "low"  # exactly 30 %
    assert level_for_parking(20, 40) == "low"
