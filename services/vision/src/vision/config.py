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
    # Live YOLO is the only data source in the app; test-boxes is for automated tests (CLAUDE.md §3.4).
    detector: Literal["yolo", "test-boxes"] = "yolo"
    publish_interval_s: float = 0.5
    port: int = 8001
