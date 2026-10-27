from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """VISION_* environment variables (or services/vision/.env)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="VISION_", extra="ignore")

    api_url: str = "http://localhost:4000"
    # Must equal the API's VISION_INGEST_TOKEN; a secret, so it lives in .env only.
    ingest_token: str = ""
    # The example file works out of the box in simulated mode; real sources go in configs/cameras.yaml.
    cameras_file: str = "configs/cameras.example.yaml"
    detector: Literal["simulated", "yolo", "replay"] = "simulated"
    # Written by `python -m vision.record`, played by VISION_DETECTOR=replay.
    replay_file: str = "recordings/demo.jsonl"
    publish_interval_s: float = 2.0
    port: int = 8001
