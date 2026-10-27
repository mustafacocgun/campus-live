"""Synthetic test clips: one per camera, white boxes walking across the frame, plus a camera config.

For the test-boxes detector only: automated tests, and a live check on a PC without a GPU
(CLAUDE.md §3.4). The clips are not footage and show nobody; their readings are labelled "simulated".

    python tools/make_test_clips.py --out videos/test-clips
    VISION_DETECTOR=test-boxes VISION_CAMERAS_FILE=videos/test-clips/cameras.yaml python -m vision
"""

import argparse
import random
from pathlib import Path

import cv2
import numpy as np
import yaml

from vision.cameras import load_cameras

EXAMPLE = Path(__file__).resolve().parents[1] / "configs" / "cameras.example.yaml"
WIDTH, HEIGHT = 320, 180
BOX = (8, 20)  # width, height of one "person"
TOP = HEIGHT * 0.35  # feet stay in the lower part of the frame, like people on the ground

Walker = tuple[float, float, float, float]  # x, feet y, and their speed in pixels per frame


def walkers(rng: random.Random, count: int) -> list[Walker]:
    return [
        (
            rng.uniform(0, WIDTH),
            rng.uniform(TOP + BOX[1], HEIGHT - 1),
            rng.choice((-1, 1)) * rng.uniform(1, 3),
            rng.uniform(-0.6, 0.6),
        )
        for _ in range(count)
    ]


def write_clip(path: Path, people: list[Walker], frames: int, fps: float) -> None:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (WIDTH, HEIGHT))
    for index in range(frames):
        frame = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
        for x, y, dx, dy in people:
            left = int((x + dx * index) % (WIDTH - BOX[0]))
            feet = int(TOP + BOX[1] + (y - TOP - BOX[1] + dy * index) % (HEIGHT - TOP - BOX[1]))
            frame[feet - BOX[1] : feet, left : left + BOX[0]] = 255
        writer.write(frame)
    writer.release()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Synthetic test clips for the test-boxes detector.")
    parser.add_argument("--out", type=Path, default=Path("videos/test-clips"))
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--fps", type=float, default=10.0)
    args = parser.parse_args(argv)
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    entries = []
    for index, camera in enumerate(load_cameras(EXAMPLE)):
        rng = random.Random(index)
        clip = out / f"{camera.id}.avi"
        write_clip(clip, walkers(rng, rng.randint(2, 12)), round(args.seconds * args.fps), args.fps)
        # Synthetic clips go through the estimated pose, never a dataset's calibration.
        entry = camera.model_dump(exclude_none=True, exclude={"wildtrack"})
        entries.append({**entry, "source": str(clip)})
    header = "# Synthetic test clips from tools/make_test_clips.py: not footage, for test-boxes only.\n"
    (out / "cameras.yaml").write_text(header + yaml.safe_dump({"cameras": entries}, sort_keys=False))
    print(f"wrote {len(entries)} clips and cameras.yaml to {out}")


if __name__ == "__main__":
    main()
