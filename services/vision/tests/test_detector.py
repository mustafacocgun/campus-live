import os
import subprocess
import sys
import types

from vision.detector import WEIGHTS, YoloDetector


def test_detector_turns_off_ultralytics_analytics(monkeypatch) -> None:
    # Ultralytics sends usage analytics unless YOLO_OFFLINE is set before it is imported.
    # Version 8.3.x only reads "true".
    seen = {}
    fake_ultralytics = types.ModuleType("ultralytics")
    fake_ultralytics.YOLO = lambda weights: seen.setdefault("offline", os.environ.get("YOLO_OFFLINE"))
    monkeypatch.setitem(sys.modules, "ultralytics", fake_ultralytics)
    monkeypatch.setattr(os, "environ", {k: v for k, v in os.environ.items() if k != "YOLO_OFFLINE"})
    YoloDetector(classes=[0])
    assert seen["offline"].lower() == "true"


def test_weights_path_is_git_ignored() -> None:
    # The weights download on first use: an AGPL-3.0 binary that must never end up in a commit.
    result = subprocess.run(["git", "check-ignore", "--quiet", str(WEIGHTS)], cwd=WEIGHTS.parent.parent)
    assert result.returncode == 0
