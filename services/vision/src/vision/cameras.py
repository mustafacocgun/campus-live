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


class CameraConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")  # a typo in the YAML fails loudly

    id: str = Field(pattern=r"^[a-z0-9-]+$")
    kind: CameraKind
    # A video file path or a webcam index; not needed in simulated mode.
    source: str | None = None
    sample_fps: float = Field(default=2.0, gt=0, le=30)
    zone: list[Point] | None = None
    thresholds: Thresholds | None = None
    # Parking slots the simulated feed pretends to have.
    simulated_total: int = Field(default=20, ge=1)

    @model_validator(mode="after")
    def _valid(self) -> Self:
        if self.zone is not None:
            if len(self.zone) < 3:
                raise ValueError("a zone needs at least 3 points")
            if any(not (0 <= x <= 1 and 0 <= y <= 1) for x, y in self.zone):
                raise ValueError("zone points are fractions of the frame, between 0 and 1")
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
