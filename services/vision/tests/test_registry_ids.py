import json

from conftest import EXAMPLE_CAMERAS
from vision.cameras import load_cameras
from vision.registry import REGISTRY_FILE, load_registry


def test_shared_config_has_pose_for_every_vision_camera() -> None:
    # A reading for a camera the API does not know is rejected, and projection needs every pose.
    registry = load_registry(REGISTRY_FILE)
    for camera in load_cameras(EXAMPLE_CAMERAS):
        entry = registry.get(camera.id)
        assert entry is not None, f"{camera.id} is not in config/cameras.json"
        assert entry.kind == camera.kind
        assert 0 <= entry.heading < 360 and 10 <= entry.fov_deg <= 170 and 5 <= entry.range_m <= 150


def _inside(point: tuple[float, float], polygon: list[list[float]]) -> bool:
    x, y = point
    hit = False
    for (x1, y1), (x2, y2) in zip(polygon, polygon[1:], strict=False):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def test_every_camera_feeds_a_place_of_its_kind_inside_the_campus() -> None:
    places = json.loads((REGISTRY_FILE.parent / "places.json").read_text(encoding="utf-8"))
    by_id = {place["id"]: place for place in places["places"]}
    outline = places["campus"]["geometry"]["coordinates"][0]
    kinds = {
        ("crowd", False): "area",
        ("crowd", True): "building",
        ("parking", False): "parking",
        ("traffic", False): "road",
    }
    for camera in load_registry().values():
        place = by_id.get(camera.place)
        assert place is not None, f"{camera.id} feeds no known place"
        assert place["kind"] == kinds[(camera.kind, camera.indoor)], camera.id
        assert _inside((camera.longitude, camera.latitude), outline), f"{camera.id} is outside the campus"
        if camera.indoor:
            assert _inside((camera.longitude, camera.latitude), place["geometry"]["coordinates"][0]), (
                camera.id
            )


def test_no_place_has_a_camera_id() -> None:
    # Place ids are served to everyone and camera ids to no one (CLAUDE.md §0.2).
    places = json.loads((REGISTRY_FILE.parent / "places.json").read_text(encoding="utf-8"))
    assert not {place["id"] for place in places["places"]} & set(load_registry())
