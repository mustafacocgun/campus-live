import math

import cv2
import numpy as np
import pytest

from conftest import SYNTHETIC_DIST, SYNTHETIC_K, synthetic_camera, synthetic_pixels, write_wildtrack
from vision.calibration import CalibratedProjection, MapAnchor, load_wildtrack_calibration

LAT, LNG = 40.7415, 30.3326
M_PER_DEG = 111_320
# Ground points in front of the synthetic camera, in the dataset's unit (cm), on the plane Z = 0.
GROUND_CM = np.array([[x, y] for x in (-400, -200, 0, 200, 400) for y in (-800, -400, 0, 400, 800)], float)


def metres_from_anchor(lat: float, lng: float) -> tuple[float, float]:
    return (lng - LNG) * M_PER_DEG * math.cos(math.radians(LAT)), (lat - LAT) * M_PER_DEG


def projection(rotation: np.ndarray, t: np.ndarray, anchor_rotation: float = 0) -> CalibratedProjection:
    anchor = MapAnchor(lat=LAT, lng=LNG, rotation_deg=anchor_rotation)
    rvec = cv2.Rodrigues(rotation)[0]
    return CalibratedProjection(SYNTHETIC_K, SYNTHETIC_DIST, rvec, t, world_unit_m=0.01, anchor=anchor)


def test_calibrated_round_trip() -> None:
    rotation, t = synthetic_camera()
    px = synthetic_pixels(rotation, t, GROUND_CM)
    assert ((px >= 0) & (px <= [1920, 1080])).all()  # every point is in view
    back = [metres_from_anchor(*point) for point in projection(rotation, t).project(px)]
    np.testing.assert_allclose(back, GROUND_CM * 0.01, atol=0.01)  # within 1 cm


def test_anchor_rotation_moves_points_on_the_map() -> None:
    rotation, t = synthetic_camera()
    px = synthetic_pixels(rotation, t, np.array([[0.0, 1000.0]]))  # 10 m along the dataset's +y axis
    [north] = projection(rotation, t, anchor_rotation=0).project(px)
    [east] = projection(rotation, t, anchor_rotation=90).project(px)
    assert metres_from_anchor(*north) == pytest.approx((0, 10), abs=0.01)
    assert metres_from_anchor(*east) == pytest.approx((10, 0), abs=0.01)  # turned clockwise


def test_pixels_that_miss_the_ground_in_range_are_dropped() -> None:
    rotation, t = synthetic_camera()
    far = synthetic_pixels(rotation, t, np.array([[0.0, 10_000.0]]))[0]  # 115 m away, beyond 60 m
    # The top centre looks 8 degrees above the horizon; the bottom centre sees the ground.
    kept = projection(rotation, t).project(np.array([[960.0, 0.0], far, [960.0, 1080.0]]))
    assert len(kept) == 1


def test_cone_covers_the_ground_in_view() -> None:
    rotation, t = synthetic_camera()
    proj = projection(rotation, t)
    cone = [metres_from_anchor(*point) for point in proj.cone((1920, 1080))]
    bottom = [metres_from_anchor(*point) for point in proj.project(np.array([[0.0, 1080], [1920, 1080]]))]
    np.testing.assert_allclose(cone[:2], bottom, atol=0.01)  # pairs: pytest.approx takes flat data only
    # The top corners look above the horizon: cut at max_range_m from the camera (0, -15 m).
    for east, north in cone[2:]:
        assert math.hypot(east, north + 15) == pytest.approx(proj.max_range_m, abs=0.01)
        assert north > 0  # in front of the camera, which looks north


def test_a_world_with_z_down_is_not_mirrored_on_the_map() -> None:
    # Whether WILDTRACK's Z axis points up or down is unverified: the map must look the same either way.
    rotation, t = synthetic_camera()
    z_down = rotation @ np.diag([1.0, -1.0, -1.0])  # the same scene, world y and z flipped
    px = synthetic_pixels(rotation, t, GROUND_CM)
    np.testing.assert_allclose(
        projection(z_down, t).project(px), projection(rotation, t).project(px), atol=1e-9
    )


def test_feet_of_boxes_are_projected_at_the_calibrated_frame_size_only() -> None:
    rotation, t = synthetic_camera()
    proj = CalibratedProjection(
        SYNTHETIC_K,
        SYNTHETIC_DIST,
        cv2.Rodrigues(rotation)[0],
        t,
        world_unit_m=0.01,
        anchor=MapAnchor(lat=LAT, lng=LNG),
        frame_size=(1920, 1080),
    )
    x, y = synthetic_pixels(rotation, t, np.array([[0.0, 1000.0]]))[0]
    [(lat, lng)] = proj(np.array([[x - 10, y - 80, x + 10, y]]), (1920, 1080))  # feet at (x, y)
    assert metres_from_anchor(lat, lng) == pytest.approx((0, 10), abs=0.01)
    # A resized video would land people in the wrong place: refuse it.
    with pytest.raises(ValueError, match="1920x1080"):
        proj(np.array([[x - 10, y - 80, x + 10, y]]), (1280, 720))


def test_wildtrack_xml_loader_reads_opencv_storage(tmp_path) -> None:
    rotation, t = synthetic_camera()
    write_wildtrack(tmp_path, "IDIAP1", rotation, t)
    K, dist, rvec, tvec = load_wildtrack_calibration(tmp_path, 5)  # C5 is IDIAP1
    np.testing.assert_array_equal(K, SYNTHETIC_K)
    np.testing.assert_array_equal(dist, SYNTHETIC_DIST)
    np.testing.assert_array_equal(rvec, cv2.Rodrigues(rotation)[0].ravel())
    np.testing.assert_array_equal(tvec, t)
