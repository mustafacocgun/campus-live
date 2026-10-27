"""Per-camera processing config, loaded from configs/*.yaml."""

from pathlib import Path
from typing import Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from vision.contracts import CameraKind

# x, y as fractions of the frame's width and height.
Point = tuple[float, float]


class Thresholds(BaseModel):
    """Counts at which the level becomes medium and high. Guesses until a hand count calibrates them."""

    medium: int = Field(ge=1)
    high: int = Field(ge=1)

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.medium >= self.high:
            raise ValueError("medium must be below high")
        return self


class Anchor(BaseModel):
    """Where the dataset's world origin sits on campus, and the compass bearing of its +y axis."""

    model_config = ConfigDict(extra="forbid")

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    rotation_deg: float = 0.0


class WildtrackCalibration(BaseModel):
    """Project through WILDTRACK's own calibration instead of the registry's estimated pose."""

    model_config = ConfigDict(extra="forbid")

    camera: int = Field(ge=1, le=7)  # C1..C7
    anchor: Anchor
    dataset_dir: str = "datasets/wildtrack"
    # Belongs to the dataset's undistorted frames; the raw videos need "intrinsic_original".
    intrinsics: str = "intrinsic_zero"
    world_unit_m: float = Field(default=0.01, gt=0)  # centimetres


class CameraConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")  # a typo in the YAML fails loudly

    id: str = Field(pattern=r"^[a-z0-9-]+$")
    kind: CameraKind
    # A video file path or a webcam index. A camera without one does not run (grey on the map).
    source: str | None = None
    # Seconds into the clip to start from, so cameras sharing footage do not show the same moment.
    start_s: float = Field(default=0.0, ge=0)
    sample_fps: float = Field(default=5.0, gt=0, le=30)
    zone: list[Point] | None = None
    # Parking cameras: each slot's outline, x, y as fractions of the frame (tools/draw_slots.py).
    slots: list[list[Point]] | None = None
    thresholds: Thresholds | None = None
    wildtrack: WildtrackCalibration | None = None

    @model_validator(mode="after")
    def _valid(self) -> Self:
        if self.zone is not None:
            if len(self.zone) < 3:
                raise ValueError("a zone needs at least 3 points")
            if any(not (0 <= x <= 1 and 0 <= y <= 1) for x, y in self.zone):
                raise ValueError("zone points are fractions of the frame, between 0 and 1")
        for slot in self.slots or []:
            if len(slot) < 3 or any(not (0 <= x <= 1 and 0 <= y <= 1) for x, y in slot):
                raise ValueError("a slot needs at least 3 points, as fractions of the frame")
        if self.kind in ("crowd", "traffic") and self.thresholds is None:
            raise ValueError(f"{self.kind} cameras need thresholds")
        return self


def load_cameras(path: str | Path) -> list[CameraConfig]:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    cameras = [CameraConfig.model_validate(item) for item in data["cameras"]]
    ids = [camera.id for camera in cameras]
    if duplicates := {i for i in ids if ids.count(i) > 1}:
        raise ValueError(f"duplicate camera ids: {sorted(duplicates)}")
    return cameras
