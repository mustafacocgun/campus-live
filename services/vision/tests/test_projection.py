import math

import numpy as np
import pytest

from vision.projection import CameraPose, ground_homography, project_feet

LAT, LNG = 40.742, 30.332
M_PER_DEG = 111_320


def bearing_and_distance(lat: float, lng: float) -> tuple[float, float]:
    """Compass bearing (degrees) and distance (m) from the camera, flat-earth like the code."""
    north = (lat - LAT) * M_PER_DEG
    east = (lng - LNG) * M_PER_DEG * math.cos(math.radians(LAT))
    return math.degrees(math.atan2(east, north)) % 360, math.hypot(east, north)


def where(heading: float, x: float, y: float, frame: tuple[int, int] = (100, 100)) -> tuple[float, float]:
    """Where a person whose feet are at pixel (x, y) stands: bearing and distance from the camera."""
    pose = CameraPose(lat=LAT, lng=LNG, heading=heading, fov_deg=60, range_m=40)
    box = np.array([[x - 1, y - 20, x + 1, y]])  # feet = the box's bottom centre
    [(lat, lng)] = project_feet(box, ground_homography(pose, frame), pose)
    return bearing_and_distance(lat, lng)


# Hand-derived: the image's bottom corners land on the near arc (5 m) at heading -/+ fov/2, its top
# corners on the far arc (40 m). The bottom centre lands mid-chord: 5 * cos(30 deg) = 4.330 m.
def test_feet_at_bottom_centre_land_at_near_distance_along_heading() -> None:
    assert where(0, 50, 100) == pytest.approx((0, 5 * math.cos(math.radians(30))), abs=0.01)
    assert where(90, 50, 100) == pytest.approx((90, 5 * math.cos(math.radians(30))), abs=0.01)


def test_top_centre_lands_at_range() -> None:
    assert where(200, 50, 0) == pytest.approx((200, 40 * math.cos(math.radians(30))), abs=0.01)


def test_left_edge_is_heading_minus_half_fov() -> None:
    # A wide frame, so width and height cannot be swapped unnoticed.
    assert where(0, 0, 90, frame=(160, 90)) == pytest.approx((330, 5), abs=0.01)
    assert where(0, 0, 0, frame=(160, 90)) == pytest.approx((330, 40), abs=0.01)
    assert where(0, 160, 90, frame=(160, 90)) == pytest.approx((30, 5), abs=0.01)


def test_no_boxes_project_to_nothing() -> None:
    pose = CameraPose(lat=LAT, lng=LNG, heading=0, fov_deg=60, range_m=40)
    assert project_feet(np.empty((0, 4)), ground_homography(pose, (100, 100)), pose) == []
