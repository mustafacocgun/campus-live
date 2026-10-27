"""Python mirror of packages/contracts. Tests check it against the generated JSON Schema."""

from datetime import UTC, datetime
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, NonNegativeInt, field_validator, model_validator
from pydantic.alias_generators import to_camel

CameraKind = Literal["crowd", "parking", "traffic"]
Level = Literal["low", "medium", "high"]
ReadingSource = Literal["simulated", "demo-footage", "camera"]


class _Contract(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)


class ParkingState(_Contract):
    total: NonNegativeInt
    free: NonNegativeInt


class CameraReading(_Contract):
    camera_id: str
    kind: CameraKind
    # People (crowd) or vehicles (parking, traffic) in view.
    count: NonNegativeInt
    level: Level
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

    def to_json(self) -> dict[str, Any]:
        """The wire format: camelCase, no null fields, UTC with a Z suffix."""
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)
