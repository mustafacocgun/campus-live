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
