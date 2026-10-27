"""Python mirror of packages/contracts. Tests check it against the generated JSON Schema."""

from datetime import UTC, datetime
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt, field_validator, model_validator
from pydantic.alias_generators import to_camel

CameraKind = Literal["crowd", "parking", "traffic"]
Level = Literal["low", "medium", "high"]
ReadingSource = Literal["simulated", "demo-footage", "camera"]


class _Contract(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)


class Camera(_Contract):
    """A camera as the map shows it: where it stands and where it looks (config/cameras.json)."""

    id: str = Field(pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=1)
    section: str = Field(min_length=1)
    kind: CameraKind
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    # Where the camera looks, in degrees clockwise from north.
    heading: float = Field(ge=0, lt=360)
    # Horizontal view angle in degrees, and the far edge of the view in metres.
    fov_deg: float = Field(ge=10, le=170)
    range_m: float = Field(ge=5, le=150)


class DensityCell(_Contract):
    """People in one 3 m cell of the campus grid, smoothed, at the cell's centre. Never a person."""

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    weight: float = Field(ge=0, allow_inf_nan=False)


class ParkingState(_Contract):
    total: NonNegativeInt
    free: NonNegativeInt


class CameraReading(_Contract):
    camera_id: str
    kind: CameraKind
    # People (crowd) or vehicles (parking, traffic) in view.
    count: NonNegativeInt
    level: Level
    # Crowd cameras only: where the people are, per 3 m cell (CLAUDE.md §3.1).
    cells: list[DensityCell] | None = Field(default=None, max_length=2000)
    parking: ParkingState | None = None
    source: ReadingSource
    measured_at: datetime

    @field_validator("measured_at")
    @classmethod
    def _as_utc(cls, value: datetime) -> datetime:
        if value.utcoffset() is None:
            raise ValueError("measured_at must be timezone-aware")
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def _parking_rules(self) -> Self:
        if (self.kind == "parking") != (self.parking is not None):
            raise ValueError("parking is required for, and only for, parking cameras")
        if self.parking and self.parking.free > self.parking.total:
            raise ValueError("free cannot exceed total")
        return self

    @model_validator(mode="after")
    def _cells_only_for_crowd(self) -> Self:
        if self.cells is not None and self.kind != "crowd":
            raise ValueError("cells are for crowd cameras only")
        return self

    def to_json(self) -> dict[str, Any]:
        """The wire format: camelCase, no null fields, UTC with a Z suffix."""
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)
