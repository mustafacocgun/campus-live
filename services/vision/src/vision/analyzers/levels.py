from vision.cameras import Thresholds
from vision.contracts import Level


def level_for_count(count: int, thresholds: Thresholds) -> Level:
    if count >= thresholds.high:
        return "high"
    if count >= thresholds.medium:
        return "medium"
    return "low"


def level_for_parking(free: int, total: int) -> Level:
    """Busy when few slots are free: under 10 % free is high, under 30 % is medium."""
    if total == 0 or free / total < 0.10:
        return "high"
    if free / total < 0.30:
        return "medium"
    return "low"
