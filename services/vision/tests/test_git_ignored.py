import subprocess

import pytest

from conftest import VISION_DIR


@pytest.mark.parametrize(
    "path",
    [
        "videos/clip.mp4",
        "datasets/wildtrack/calibrations/extrinsic/extr_CVLab1.xml",
        "configs/cameras.yaml",
        "configs/cameras.part2.yaml",  # a second vision process's share of the cameras
    ],
)
def test_footage_datasets_and_local_config_are_never_committed(path) -> None:
    # Footage and datasets stay on each teammate's PC; cameras.yaml may hold private stream URLs (§0.3).
    result = subprocess.run(["git", "check-ignore", "--quiet", "--no-index", path], cwd=VISION_DIR)
    assert result.returncode == 0, f"{path} is not git-ignored"


def test_the_example_camera_config_stays_tracked() -> None:
    result = subprocess.run(
        ["git", "check-ignore", "--quiet", "--no-index", "configs/cameras.example.yaml"], cwd=VISION_DIR
    )
    assert result.returncode == 1, "configs/cameras.example.yaml is git-ignored"
