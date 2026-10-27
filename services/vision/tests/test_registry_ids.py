import json

from conftest import EXAMPLE_CAMERAS, REPO_ROOT
from vision.cameras import load_cameras


def test_vision_camera_ids_exist_in_api_registry() -> None:
    # A reading for a camera the API does not know is rejected (422), so the two configs must agree.
    registry = json.loads((REPO_ROOT / "services/api/config/cameras.json").read_text(encoding="utf-8"))
    api_cameras = {camera["id"]: camera["kind"] for camera in registry["cameras"]}
    for camera in load_cameras(EXAMPLE_CAMERAS):
        assert api_cameras.get(camera.id) == camera.kind, (
            f"{camera.id} ({camera.kind}) not in the API registry"
        )
