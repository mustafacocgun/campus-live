import pytest
from pydantic import ValidationError

from conftest import EXAMPLE_CAMERAS
from vision.cameras import load_cameras
from vision.registry import load_registry


def test_example_config_covers_every_registered_camera() -> None:
    # The template teammates copy: one entry per camera on the map, in the registry's order.
    cameras = load_cameras(EXAMPLE_CAMERAS)
    assert [c.id for c in cameras] == list(load_registry())


def test_rejects_zone_outside_the_frame(tmp_path) -> None:
    config = tmp_path / "cameras.yaml"
    config.write_text(
        "cameras:\n"
        "  - {id: a, kind: crowd, zone: [[0, 0], [1.5, 0], [1, 1]], thresholds: {medium: 1, high: 2}}\n"
    )
    with pytest.raises(ValidationError):
        load_cameras(config)


def test_rejects_duplicate_camera_ids(tmp_path) -> None:
    config = tmp_path / "cameras.yaml"
    config.write_text(
        "cameras:\n"
        "  - {id: a, kind: crowd, thresholds: {medium: 1, high: 2}}\n"
        "  - {id: a, kind: crowd, thresholds: {medium: 1, high: 2}}\n"
    )
    with pytest.raises(ValueError, match="duplicate"):
        load_cameras(config)
