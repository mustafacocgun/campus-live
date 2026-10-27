"""Feet -> map through the footage's own calibration (OpenCV pinhole model), instead of a pose estimate.

A calibrated dataset gives each camera's intrinsics (K, distortion) and extrinsics (rvec, tvec) for a
ground plane at Z = 0. A pixel is undistorted, turned into a ray from the camera and intersected with
the ground. The dataset's world coordinates are scaled to metres and placed on campus at a map anchor.
"""

import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from vision.projection import feet_of, offset

# WILDTRACK's cameras C1..C7, as its calibration files name them. The order comes from public code
# that reads the dataset (MVDet), not from EPFL [WEAK]: check it against the files when downloading.
WILDTRACK_CAMERAS = ("CVLab1", "CVLab2", "CVLab3", "CVLab4", "IDIAP1", "IDIAP2", "IDIAP3")
# The resolution WILDTRACK's calibration belongs to [EVIDENCED, paper arXiv 1707.09299].
WILDTRACK_FRAME = (1920, 1080)


@dataclass(frozen=True)
class MapAnchor:
    """Where the dataset's world origin sits on campus, and how its axes are turned."""

    lat: float
    lng: float
    # Compass bearing of the world's +y axis: 0 puts +y north and +x east; 90 turns both clockwise.
    rotation_deg: float = 0.0


class CalibratedProjection:
    def __init__(
        self,
        K: np.ndarray,
        dist: np.ndarray,
        rvec: np.ndarray,
        tvec: np.ndarray,
        world_unit_m: float,
        anchor: MapAnchor,
        max_range_m: float = 60.0,
        frame_size: tuple[int, int] | None = None,
    ) -> None:
        self.K = np.asarray(K, dtype=np.float64).reshape(3, 3)
        self.dist = np.asarray(dist, dtype=np.float64).ravel()
        self.world_unit_m = world_unit_m
        self.anchor = anchor
        self.max_range_m = max_range_m
        # The resolution K belongs to; a resized video would put people in the wrong place.
        self.frame_size = frame_size
        self._rotation, _ = cv2.Rodrigues(np.asarray(rvec, dtype=np.float64).reshape(3, 1))
        # The camera's position in world units: C = -R^T t.
        self._centre = -self._rotation.T @ np.asarray(tvec, dtype=np.float64).reshape(3)
        # The ground seen from the cameras' side: when the world's Z points down (cameras below
        # Z = 0), its y axis is flipped so the map is not mirrored.
        self._y_sign = -1.0 if self._centre[2] < 0 else 1.0

    def _ground(self, points_px: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Each pixel's ray, cut at Z = 0: (ground x/y in world units, hits the ground in range)."""
        pixels = np.asarray(points_px, dtype=np.float64).reshape(-1, 1, 2)
        if not len(pixels):
            return np.empty((0, 2)), np.empty(0, dtype=bool)
        # Undistorted and divided by the focal length: (x/z, y/z) of each pixel's ray.
        normalized = cv2.undistortPoints(pixels, self.K, self.dist)
        rays = np.column_stack([normalized.reshape(-1, 2), np.ones(len(pixels))]) @ self._rotation
        with np.errstate(divide="ignore"):
            along = -self._centre[2] / rays[:, 2]
        ground = self._centre[:2] + along[:, None] * rays[:, :2]
        reach_m = np.hypot(*(ground - self._centre[:2]).T) * self.world_unit_m
        hits = (along > 0) & (reach_m <= self.max_range_m)
        # A ray that misses the ground (above the horizon) or lands too far is cut at max_range_m.
        heading = rays[:, :2] / np.hypot(*rays[:, :2].T)[:, None]
        cut = self._centre[:2] + heading * (self.max_range_m / self.world_unit_m)
        return np.where(hits[:, None], ground, cut), hits

    def _to_map(self, world_xy: np.ndarray) -> list[tuple[float, float]]:
        metres = np.asarray(world_xy, dtype=np.float64).reshape(-1, 2) * self.world_unit_m
        metres[:, 1] *= self._y_sign
        turn = math.radians(self.anchor.rotation_deg)
        east = metres[:, 0] * math.cos(turn) + metres[:, 1] * math.sin(turn)
        north = -metres[:, 0] * math.sin(turn) + metres[:, 1] * math.cos(turn)
        return [offset(self.anchor.lat, self.anchor.lng, e, n) for e, n in zip(east, north, strict=True)]

    def project(self, points_px: np.ndarray) -> list[tuple[float, float]]:
        """(lat, lng) of each pixel's ground point. Pixels that miss the ground in range are dropped."""
        ground, hits = self._ground(points_px)
        return self._to_map(ground[hits])

    def __call__(self, boxes_xyxy: np.ndarray, frame_size: tuple[int, int]) -> list[tuple[float, float]]:
        """(lat, lng) of each box's feet, for frames at the calibrated size."""
        if self.frame_size and tuple(frame_size) != tuple(self.frame_size):
            expected, got = (f"{w}x{h}" for w, h in (self.frame_size, frame_size))
            raise ValueError(f"the calibration is for {expected} frames, the video is {got}")
        return self.project(feet_of(boxes_xyxy))

    def cone(self, frame_size: tuple[int, int]) -> list[tuple[float, float]]:
        """The ground in view, for the map: the image's bottom-left, bottom-right, top-right and
        top-left corners, each cut at max_range_m when it looks above the horizon or too far."""
        width, height = frame_size
        ground, _ = self._ground(np.float64([[0, height], [width, height], [width, 0], [0, 0]]))
        return self._to_map(ground)


def load_wildtrack_calibration(
    root: str | Path, camera: int, intrinsics: str = "intrinsic_zero"
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """K, distortion, rvec and tvec of WILDTRACK camera C1..C7, from the dataset's own files.

    intrinsic_zero belongs to the undistorted frames in the dataset zip; the raw videos need the
    intrinsic_original set, which EPFL reportedly gives on request [WEAK]. World unit: centimetres.
    """
    name = WILDTRACK_CAMERAS[camera - 1]
    calibrations = Path(root) / "calibrations"
    intrinsic = calibrations / intrinsics / f"intr_{name}.xml"
    if not intrinsic.is_file():
        raise FileNotFoundError(intrinsic)
    storage = cv2.FileStorage(str(intrinsic), cv2.FILE_STORAGE_READ)
    K = storage.getNode("camera_matrix").mat()
    dist = storage.getNode("distortion_coefficients").mat().ravel()
    storage.release()
    # The extrinsics are plain numbers, not OpenCV matrices (as the dataset's own toolkit reads them).
    extrinsic = ET.parse(calibrations / "extrinsic" / f"extr_{name}.xml").getroot()
    rvec, tvec = (np.array(extrinsic.findtext(tag).split(), dtype=np.float64) for tag in ("rvec", "tvec"))
    return K, dist, rvec, tvec
