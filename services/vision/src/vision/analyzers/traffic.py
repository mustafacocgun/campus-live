"""Traffic: how many vehicles a road camera sees in its zone right now."""

from vision.analyzers.crowd import CrowdAnalyzer
from vision.cameras import CameraConfig


class TrafficAnalyzer(CrowdAnalyzer):
    """The vehicles in the road zone, smoothed like a crowd count; no positions leave."""

    def __init__(self, camera: CameraConfig, window: int = 5) -> None:
        super().__init__(camera, None, window=window)
