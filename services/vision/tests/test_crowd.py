import supervision as sv

from conftest import NOW, people
from vision.analyzers.crowd import CrowdAnalyzer
from vision.cameras import CameraConfig

FRAME = (100, 100)  # width, height
LOWER_HALF = [(0, 0.5), (1, 0.5), (1, 1), (0, 1)]


def _camera(zone=None) -> CameraConfig:
    return CameraConfig(id="kafe-merkez", kind="crowd", zone=zone, thresholds={"medium": 2, "high": 5})


def test_counts_people_inside_zone() -> None:
    # Feet (box bottom-centre) at y=90 and y=60 are in the lower half; y=30 is not. The middle box's
    # centre (y=45) is outside the zone, so counting by box centre instead of feet would give 1.
    analyzer = CrowdAnalyzer(_camera(zone=LOWER_HALF))
    reading = analyzer.update(
        people([10, 70, 20, 90], [40, 30, 50, 60], [70, 10, 80, 30]), FRAME, NOW, "demo-footage"
    )
    assert (reading.kind, reading.count, reading.level) == ("crowd", 2, "medium")


def test_counts_everyone_without_zone() -> None:
    analyzer = CrowdAnalyzer(_camera())
    reading = analyzer.update(
        people([10, 70, 20, 90], [40, 40, 50, 60], [70, 10, 80, 30]), FRAME, NOW, "demo-footage"
    )
    assert reading.count == 3


def test_median_hides_one_missed_frame() -> None:
    analyzer = CrowdAnalyzer(_camera())
    five = people(*[[i * 10, 50, i * 10 + 5, 60] for i in range(5)])
    frames = [five, five, sv.Detections.empty(), five, five]
    counts = [analyzer.update(d, FRAME, NOW, "simulated").count for d in frames]
    assert counts == [5, 5, 5, 5, 5]
