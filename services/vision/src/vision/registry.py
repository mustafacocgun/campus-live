"""The shared camera registry, config/cameras.json at the repo root: every camera's name and pose."""

import json
from pathlib import Path

from vision.contracts import Camera

# src/vision/registry.py in services/vision -> the repo root.
REGISTRY_FILE = Path(__file__).resolve().parents[4] / "config" / "cameras.json"


def load_registry(path: str | Path = REGISTRY_FILE) -> dict[str, Camera]:
    """Cameras by id, in file order. The API refuses duplicate ids at startup."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return {camera.id: camera for camera in map(Camera.model_validate, data["cameras"])}
