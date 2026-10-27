import json
import math

import jsonschema
import supervision as sv

from conftest import NOW, REPO_ROOT, people
from vision.analyzers.crowd import CrowdAnalyzer
from vision.cameras import CameraConfig
from vision.projection import CameraPose, PoseProjector

FRAME = (100, 100)  # width, height
LOWER_HALF = [(0, 0.5), (1, 0.5), (1, 1), (0, 1)]
# Looks east; 60 degree view out to 40 m.
POSE = CameraPose(lat=40.742, lng=30.332, heading=90, fov_deg=60, range_m=40)
SCHEMA = json.loads((REPO_ROOT / "packages/contracts/schemas/camera-reading.schema.json").read_text())


def _analyzer(zone=None) -> CrowdAnalyzer:
    camera = CameraConfig(id="tas-kafe", kind="crowd", zone=zone, thresholds={"medium": 2, "high": 5})
    return CrowdAnalyzer(camera, PoseProjector(POSE))


def _from_camera(lat: float, lng: float) -> tuple[float, float]:
    """East and north metres from the camera."""
    return (lng - POSE.lng) * 111_320 * math.cos(math.radians(POSE.lat)), (lat - POSE.lat) * 111_320


def test_counts_people_inside_zone() -> None:
    # Feet (box bottom-centre) at y=90 and y=60 are in the lower half; y=30 is not. The middle box's
    # centre (y=45) is outside the zone, so counting by box centre instead of feet would give 1.
    reading = _analyzer(zone=LOWER_HALF).update(
        people([10, 70, 20, 90], [40, 30, 50, 60], [70, 10, 80, 30]), FRAME, NOW, "demo-footage"
    )
    assert (reading.kind, reading.count, reading.level) == ("crowd", 2, "medium")


def test_counts_everyone_without_zone() -> None:
    reading = _analyzer().update(
        people([10, 70, 20, 90], [40, 40, 50, 60], [70, 10, 80, 30]), FRAME, NOW, "demo-footage"
    )
    assert reading.count == 3


def test_median_hides_one_missed_frame() -> None:
    analyzer = _analyzer()
    five = people(*[[i * 10, 50, i * 10 + 5, 60] for i in range(5)])
    frames = [five, five, sv.Detections.empty(), five, five]
    counts = [analyzer.update(d, FRAME, NOW, "simulated").count for d in frames]
    assert counts == [5, 5, 5, 5, 5]


def test_crowd_reading_has_cells_inside_the_cone() -> None:
    reading = _analyzer().update(
        people([5, 20, 15, 40], [45, 30, 55, 50], [85, 25, 95, 45]), FRAME, NOW, "demo-footage"
    )
    assert reading.cells
    for cell in reading.cells:
        east, north = _from_camera(cell.lat, cell.lng)
        # East of the camera, inside the 60 degree view (plus half a 3 m cell for the binning).
        assert east > 0
        assert abs(north) <= east * math.tan(math.radians(30)) + 2.2
        assert math.hypot(east, north) <= POSE.range_m + 2.2


def test_people_outside_the_zone_make_no_cells() -> None:
    reading = _analyzer(zone=LOWER_HALF).update(people([70, 10, 80, 30]), FRAME, NOW, "demo-footage")
    assert (reading.count, reading.cells) == (0, [])


def test_reading_carries_only_contract_fields() -> None:
    # Counts and per-cell weights only: no boxes, tracks or per-person positions (CLAUDE.md §0.2).
    reading = _analyzer().update(people([10, 70, 20, 90], [12, 72, 22, 92]), FRAME, NOW, "demo-footage")
    data = reading.to_json()
    jsonschema.validate(data, SCHEMA)
    assert set(data) == {"cameraId", "kind", "count", "level", "cells", "source", "measuredAt"}
    assert all(set(cell) == {"lat", "lng", "weight"} for cell in data["cells"])
