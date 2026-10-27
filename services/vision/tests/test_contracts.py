import json
from datetime import datetime, timedelta, timezone

import jsonschema
import pytest
from pydantic import ValidationError

from conftest import NOW, REPO_ROOT
from vision.contracts import CameraReading, ParkingState

SCHEMA = json.loads((REPO_ROOT / "packages/contracts/schemas/camera-reading.schema.json").read_text())


def test_readings_match_contract_schema() -> None:
    crowd = CameraReading(
        camera_id="kafe-merkez", kind="crowd", count=3, level="low", source="simulated", measured_at=NOW
    )
    parking = CameraReading(
        camera_id="otopark-a",
        kind="parking",
        count=28,
        level="medium",
        parking=ParkingState(total=40, free=12),
        source="demo-footage",
        measured_at=NOW,
    )
    for reading in (crowd, parking):
        jsonschema.validate(reading.to_json(), SCHEMA)


def test_model_rejects_parking_on_crowd() -> None:
    with pytest.raises(ValidationError):
        CameraReading(
            camera_id="kafe-merkez",
            kind="crowd",
            count=3,
            level="low",
            parking=ParkingState(total=10, free=2),
            source="simulated",
            measured_at=NOW,
        )


def test_measured_at_is_sent_as_utc() -> None:
    istanbul_ten = datetime(2026, 10, 27, 10, 0, tzinfo=timezone(timedelta(hours=3)))
    reading = CameraReading(
        camera_id="kafe-merkez",
        kind="crowd",
        count=0,
        level="low",
        source="simulated",
        measured_at=istanbul_ten,
    )
    assert reading.to_json()["measuredAt"] == "2026-10-27T07:00:00Z"
