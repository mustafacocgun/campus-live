"""Give every camera of one kind a clip from a folder, at random but reproducibly, each with a random
start, so cameras sharing footage do not show the same moment.

    python tools/assign_clips.py --clips videos/wildtrack --out configs/cameras.yaml
    python tools/assign_clips.py --clips videos/parking --kind parking \
        --config configs/cameras.yaml --out configs/cameras.yaml

WILDTRACK clips named <view>_<index> (C1_000.mp4 ... C7_011.mp4) keep the plaza in sync: its cameras
(the ones with a `wildtrack` block) all take the same index and start. A parking clip's slot outlines
(<clip>.slots.yaml, from tools/draw_slots.py) go to every camera that plays it.
"""

import argparse
import random
import re
from pathlib import Path

import cv2
import yaml

from vision.cameras import load_cameras

VIDEO_SUFFIXES = {".mp4", ".avi", ".mov", ".mkv"}
VIEW_CLIP = re.compile(r"^C([1-7])_(\d+)$")


def duration_s(path: Path) -> float:
    capture = cv2.VideoCapture(str(path))
    frames, fps = capture.get(cv2.CAP_PROP_FRAME_COUNT), capture.get(cv2.CAP_PROP_FPS)
    capture.release()
    return frames / fps if fps else 0.0


def random_start(rng: random.Random, clip: Path) -> float:
    """Somewhere in the first 80 % of the clip, to a tenth of a second."""
    return round(rng.uniform(0, duration_s(clip) * 0.8), 1)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Assign clips to cameras at random, reproducibly.")
    parser.add_argument("--clips", type=Path, required=True)
    parser.add_argument("--config", type=Path, default=Path("configs/cameras.example.yaml"))
    parser.add_argument("--out", type=Path, default=Path("configs/cameras.yaml"))
    parser.add_argument("--kind", choices=("crowd", "parking", "traffic"), default="crowd")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args(argv)
    clips = sorted(p for p in args.clips.iterdir() if p.suffix.lower() in VIDEO_SUFFIXES)
    if not clips:
        raise SystemExit(f"no video clips in {args.clips}")
    rng = random.Random(args.seed)
    views: dict[int, dict[str, Path]] = {}
    for clip in clips:
        if match := VIEW_CLIP.match(clip.stem):
            views.setdefault(int(match.group(1)), {})[match.group(2)] = clip
    shared = sorted(set.intersection(*(set(v) for v in views.values()))) if len(views) == 7 else []
    plaza_index = rng.choice(shared) if shared else None
    plaza_start: float | None = None
    entries = []
    for camera in load_cameras(args.config):
        entry = camera.model_dump(mode="json", exclude_none=True)
        if camera.kind == args.kind:
            if camera.wildtrack and plaza_index is not None:
                clip = views[camera.wildtrack.camera][plaza_index]
                plaza_start = random_start(rng, clip) if plaza_start is None else plaza_start
                start = plaza_start
            else:
                clip = rng.choice(clips)
                start = random_start(rng, clip)
            entry |= {"source": str(clip.resolve()), "start_s": start}
            slots = clip.with_name(clip.name + ".slots.yaml")
            if camera.kind == "parking" and slots.is_file():
                entry["slots"] = yaml.safe_load(slots.read_text())["slots"]
        entries.append(entry)
    header = f"# Clips assigned by tools/assign_clips.py (seed {args.seed}); edit freely.\n"
    args.out.write_text(header + yaml.safe_dump({"cameras": entries}, sort_keys=False))
    print(f"assigned {args.kind} clips from {args.clips} -> {args.out}")


if __name__ == "__main__":
    main()
