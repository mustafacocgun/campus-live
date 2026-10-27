import numpy as np
import supervision as sv

from conftest import NOW
from vision.analyzers.traffic import TrafficAnalyzer
from vision.cameras import CameraConfig

FRAME = (100, 100)
ROAD = [(0, 0.4), (1, 0.4), (1, 0.8), (0, 0.8)]


def vehicles(*boxes: list[float]) -> sv.Detections:
    return sv.Detections(
        xyxy=np.array(boxes, dtype=float),
        confidence=np.full(len(boxes), 0.9),
        class_id=np.full(len(boxes), 2),
    )


def test_traffic_counts_vehicles_on_the_road() -> None:
    camera = CameraConfig(
        id="kampus-ici-yolu-1", kind="traffic", zone=ROAD, thresholds={"medium": 2, "high": 4}
    )
    # Two cars on the road band; one parked above it (its wheels at y = 30) does not count.
    reading = TrafficAnalyzer(camera).update(
        vehicles([10, 50, 30, 70], [50, 55, 70, 75], [80, 10, 95, 30]), FRAME, NOW, "demo-footage"
    )
    assert (reading.kind, reading.count, reading.level, reading.cells) == ("traffic", 2, "medium", None)
