from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """VISION_* environment variables (or services/vision/.env)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="VISION_", extra="ignore")

    api_url: str = "http://localhost:4000"
    # Must equal the API's VISION_INGEST_TOKEN; a secret, so it lives in .env only.
    ingest_token: str = ""
    # The example lists every camera without footage, so nothing runs; configs/cameras.yaml (your copy,
    # git-ignored) sets each camera's video.
    cameras_file: str = "configs/cameras.example.yaml"
    # Live YOLO by default; replay plays readings recorded once from footage (D32); test-boxes is for
    # automated tests (CLAUDE.md §3.4).
    detector: Literal["yolo", "test-boxes", "replay"] = "yolo"
    # Written by `python -m vision.record`, played by VISION_DETECTOR=replay. Git-ignored, like the
    # footage it is made from.
    replay_file: str = "recordings/demo.jsonl"
    publish_interval_s: float = 0.5
    # The stage preview (D33): each camera's newest frame with its boxes, served at /preview/<id> for
    # the API to pass to the place detail on web and phone. Off unless the demo machine turns it on.
    preview: bool = False
    port: int = 8001
