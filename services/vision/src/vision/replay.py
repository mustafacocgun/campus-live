"""Replays readings recorded from demo footage (python -m vision.record) in a loop, stamped with now.

The dataset is JSON Lines, one reading per line: the CameraReading wire format with `measuredAt`
replaced by `offsetS`, the seconds from the start of its clip. Numbers only, never frames.
"""

import json
from collections import defaultdict
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic
from typing import Any

from pydantic import ValidationError

from vision.cameras import CameraConfig
from vision.contracts import CameraReading
from vision.worker_base import WorkerBase

# A recorded reading's own time is meaningless: replay stamps it with now. Any aware time will do.
UNSTAMPED = datetime(2000, 1, 1, tzinfo=UTC)

# (seconds from the start of the clip, reading), sorted by offset.
Track = list[tuple[float, CameraReading]]


def to_line(offset_s: float, reading: CameraReading) -> dict[str, Any]:
    line = reading.to_json()
    del line["measuredAt"]
    return {"offsetS": round(offset_s, 3), **line}


def write_dataset(path: str | Path, lines: Iterable[dict[str, Any]]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(line) + "\n" for line in lines), encoding="utf-8")


def load_dataset(path: str | Path, cameras: list[CameraConfig]) -> dict[str, Track]:
    """Each camera's track. A bad line, an unknown camera or a kind mismatch fails loudly."""
    kinds = {camera.id: camera.kind for camera in cameras}
    tracks: dict[str, Track] = defaultdict(list)
    for number, text in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), start=1):
        if not text.strip():
            continue
        try:
            line = json.loads(text)
            offset = line.pop("offsetS")
            if not isinstance(offset, int | float) or offset < 0:
                raise ValueError("offsetS must be a number of seconds, 0 or more")
            reading = CameraReading.model_validate({**line, "measuredAt": UNSTAMPED})
        except (ValueError, KeyError, TypeError, AttributeError, ValidationError) as exc:
            raise ValueError(f"{path} line {number}: {exc}") from exc
        if kinds.get(reading.camera_id) != reading.kind:
            raise ValueError(
                f"{path} line {number}: {reading.camera_id} ({reading.kind}) is not in the cameras file"
            )
        tracks[reading.camera_id].append((float(offset), reading))
    if not tracks:
        raise ValueError(f"{path} has no readings")
    return {camera_id: sorted(track, key=lambda item: item[0]) for camera_id, track in tracks.items()}


def restamp(reading: CameraReading, now: datetime) -> CameraReading:
    # Recorded footage is demo data whatever it was recorded as (CLAUDE.md §0.5).
    return reading.model_copy(update={"measured_at": now, "source": "demo-footage"})


def schedule(track: Track) -> Iterator[tuple[float, CameraReading]]:
    """(seconds since replay started, reading), forever: the clip repeats with its recorded spacing."""
    last = track[-1][0]
    gap = last - track[-2][0] if len(track) > 1 else 0.0
    # One more gap after the last reading, so the loop's seam looks like any other step.
    period = last + (gap if gap > 0 else 1.0)
    loop = 0
    while True:
        for offset, reading in track:
            yield loop * period + offset, reading
        loop += 1


class ReplayWorker(WorkerBase):
    """Plays one camera's recorded readings in a loop; no video, no OpenCV, no GPU."""

    mode = "replay"

    def __init__(self, camera: CameraConfig, track: Track) -> None:
        super().__init__(camera)
        self._track = track

    def run(self) -> None:
        self._mark_started()
        started = monotonic()
        for at, reading in schedule(self._track):
            if self._stop.wait(max(0.0, started + at - monotonic())):
                return
            self._record(restamp(reading, self._now()))
