"""People's feet in the image -> where they stand on the campus map, estimated from the camera's pose.

The image's bottom corners land on the near arc (near_m from the camera) and its top corners on the
far arc (range_m), at heading -/+ fov/2. The homography through those four pairs maps any image
point onto the ground. It is an estimate: footage with its own calibration uses vision.calibration.
"""

import math
from dataclasses import dataclass

import cv2
import numpy as np

# Metres per degree of latitude; a degree of longitude is this times cos(latitude). The clients use
# the same flat-earth numbers, so cells and cones line up on the map.
M_PER_DEG_LAT = 111_320.0


def offset(lat: float, lng: float, east_m: float, north_m: float) -> tuple[float, float]:
    """The point east_m and north_m metres away from (lat, lng)."""
    return lat + north_m / M_PER_DEG_LAT, lng + east_m / (M_PER_DEG_LAT * math.cos(math.radians(lat)))


@dataclass(frozen=True)
class CameraPose:
    lat: float
    lng: float
    heading: float  # where the camera looks, degrees clockwise from north
    fov_deg: float  # horizontal view angle
    range_m: float  # the far edge of the view
    # The near edge of the view. 5 m suits a camera mounted 4-5 m up; nearer than that, the lower part
    # of the image squeezes into the first few metres and the heat sits on the camera itself.
    near_m: float = 5.0


def _along(bearing: float, distance: float) -> tuple[float, float]:
    """East and north metres for a compass bearing and a distance."""
    rad = math.radians(bearing)
    return distance * math.sin(rad), distance * math.cos(rad)


def ground_homography(pose: CameraPose, frame_size: tuple[int, int]) -> np.ndarray:
    """The 3x3 homography from image pixels to east/north metres around the camera.

    frame_size is (width, height). The image's left edge looks along heading - fov/2.
    """
    width, height = frame_size
    left, right = pose.heading - pose.fov_deg / 2, pose.heading + pose.fov_deg / 2
    image = np.float32([[0, height], [width, height], [width, 0], [0, 0]])
    ground = np.float32(
        [
            _along(left, pose.near_m),
            _along(right, pose.near_m),
            _along(right, pose.range_m),
            _along(left, pose.range_m),
        ]
    )
    return cv2.getPerspectiveTransform(image, ground)


def feet_of(boxes_xyxy: np.ndarray) -> np.ndarray:
    """Each box's bottom centre (x, y): where that person's feet touch the ground."""
    boxes = np.asarray(boxes_xyxy, dtype=np.float64).reshape(-1, 4)
    return np.stack([(boxes[:, 0] + boxes[:, 2]) / 2, boxes[:, 3]], axis=1)


def project_feet(
    boxes_xyxy: np.ndarray, homography: np.ndarray, pose: CameraPose
) -> list[tuple[float, float]]:
    """(lat, lng) of each box's feet."""
    feet = feet_of(boxes_xyxy)
    if not len(feet):
        return []
    ground = cv2.perspectiveTransform(feet.reshape(-1, 1, 2), homography).reshape(-1, 2)
    return [offset(pose.lat, pose.lng, east, north) for east, north in ground]


class PoseProjector:
    """Feet -> map through a camera's pose, with one homography per frame size."""

    def __init__(self, pose: CameraPose) -> None:
        self.pose = pose
        self._homographies: dict[tuple[int, int], np.ndarray] = {}

    def __call__(self, boxes_xyxy: np.ndarray, frame_size: tuple[int, int]) -> list[tuple[float, float]]:
        if frame_size not in self._homographies:
            self._homographies[frame_size] = ground_homography(self.pose, frame_size)
        return project_feet(boxes_xyxy, self._homographies[frame_size], self.pose)
