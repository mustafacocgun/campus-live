import math

import cv2
import numpy as np
import pytest

from vision.calibration import CalibratedProjection, MapAnchor, load_wildtrack_calibration

LAT, LNG = 40.7415, 30.3326
M_PER_DEG = 111_320
K = np.array([[1000.0, 0, 960], [0, 1000.0, 540], [0, 0, 1]])
DIST = np.array([-0.25, 0.08, 0.001, -0.0005, 0.0])  # k1 k2 p1 p2 k3: strong barrel, like a GoPro
# Ground points in front of the camera, in the dataset's unit (cm), on the plane Z = 0.
GROUND_CM = np.array([[x, y] for x in (-400, -200, 0, 200, 400) for y in (-800, -400, 0, 400, 800)], float)


def camera() -> tuple[np.ndarray, np.ndarray]:
    """R (world -> camera) and t: 15 m behind the world origin, 5 m up, looking along +y, 20 deg down."""
    tilt = math.radians(20)
    forward = np.array([0.0, math.cos(tilt), -math.sin(tilt)])
    right = np.array([1.0, 0.0, 0.0])
    rotation = np.stack([right, np.cross(forward, right), forward])
    return rotation, -rotation @ np.array([0.0, -1500.0, 500.0])


def pixels(rotation: np.ndarray, t: np.ndarray, ground_cm: np.ndarray) -> np.ndarray:
    world = np.column_stack([ground_cm, np.zeros(len(ground_cm))])
    px, _ = cv2.projectPoints(world, cv2.Rodrigues(rotation)[0], t, K, DIST)
    return px.reshape(-1, 2)


def metres_from_anchor(lat: float, lng: float) -> tuple[float, float]:
    return (lng - LNG) * M_PER_DEG * math.cos(math.radians(LAT)), (lat - LAT) * M_PER_DEG


def projection(rotation: np.ndarray, t: np.ndarray, anchor_rotation: float = 0) -> CalibratedProjection:
    anchor = MapAnchor(lat=LAT, lng=LNG, rotation_deg=anchor_rotation)
    return CalibratedProjection(K, DIST, cv2.Rodrigues(rotation)[0], t, world_unit_m=0.01, anchor=anchor)


def test_calibrated_round_trip() -> None:
    rotation, t = camera()
    px = pixels(rotation, t, GROUND_CM)
    assert ((px >= 0) & (px <= [1920, 1080])).all()  # every point is in view
    back = [metres_from_anchor(*point) for point in projection(rotation, t).project(px)]
    np.testing.assert_allclose(back, GROUND_CM * 0.01, atol=0.01)  # within 1 cm


def test_anchor_rotation_moves_points_on_the_map() -> None:
    rotation, t = camera()
    px = pixels(rotation, t, np.array([[0.0, 1000.0]]))  # 10 m along the dataset's +y axis
    [north] = projection(rotation, t, anchor_rotation=0).project(px)
    [east] = projection(rotation, t, anchor_rotation=90).project(px)
    assert metres_from_anchor(*north) == pytest.approx((0, 10), abs=0.01)
    assert metres_from_anchor(*east) == pytest.approx((10, 0), abs=0.01)  # turned clockwise


def test_pixels_that_miss_the_ground_in_range_are_dropped() -> None:
    rotation, t = camera()
    far = pixels(rotation, t, np.array([[0.0, 10_000.0]]))[0]  # 115 m away, beyond max_range_m (60 m)
    # The top centre looks 8 degrees above the horizon; the bottom centre sees the ground.
    kept = projection(rotation, t).project(np.array([[960.0, 0.0], far, [960.0, 1080.0]]))
    assert len(kept) == 1


def test_cone_covers_the_ground_in_view() -> None:
    rotation, t = camera()
    proj = projection(rotation, t)
    cone = [metres_from_anchor(*point) for point in proj.cone((1920, 1080))]
    bottom = [metres_from_anchor(*point) for point in proj.project(np.array([[0.0, 1080], [1920, 1080]]))]
    assert cone[:2] == pytest.approx(bottom, abs=0.01)
    # The top corners look above the horizon: cut at max_range_m from the camera (0, -15 m).
    for east, north in cone[2:]:
        assert math.hypot(east, north + 15) == pytest.approx(proj.max_range_m, abs=0.01)
        assert north > 0  # in front of the camera, which looks north


def test_a_world_with_z_down_is_not_mirrored_on_the_map() -> None:
    # Whether WILDTRACK's Z axis points up or down is unverified: the map must look the same either way.
    rotation, t = camera()
    z_down = rotation @ np.diag([1.0, -1.0, -1.0])  # the same scene, world y and z flipped
    px = pixels(rotation, t, GROUND_CM)
    np.testing.assert_allclose(
        projection(z_down, t).project(px), projection(rotation, t).project(px), atol=1e-9
    )


def test_wildtrack_xml_loader_reads_opencv_storage(tmp_path) -> None:
    # Synthetic files in the dataset's layout and formats (the real ones are never committed): the
    # intrinsics as OpenCV FileStorage matrices, the extrinsics as plain numbers.
    (tmp_path / "calibrations/intrinsic_zero").mkdir(parents=True)
    (tmp_path / "calibrations/extrinsic").mkdir(parents=True)
    storage = cv2.FileStorage(
        str(tmp_path / "calibrations/intrinsic_zero/intr_IDIAP1.xml"), cv2.FILE_STORAGE_WRITE
    )
    storage.write("camera_matrix", K)
    storage.write("distortion_coefficients", DIST.reshape(1, 5))
    storage.release()
    (tmp_path / "calibrations/extrinsic/extr_IDIAP1.xml").write_text(
        '<?xml version="1.0"?>\n<opencv_storage>\n<rvec>0.1 -0.2 0.3</rvec>\n'
        "<tvec>-100.5 50.25 900</tvec>\n</opencv_storage>\n"
    )
    k, dist, rvec, tvec = load_wildtrack_calibration(tmp_path, 5)  # C5 is IDIAP1
    np.testing.assert_array_equal(k, K)
    np.testing.assert_array_equal(dist, DIST)
    np.testing.assert_array_equal(rvec, [0.1, -0.2, 0.3])
    np.testing.assert_array_equal(tvec, [-100.5, 50.25, 900])
