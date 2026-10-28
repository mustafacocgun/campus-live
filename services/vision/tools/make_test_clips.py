"""Synthetic test clips: one per camera, plus a camera config. Crowd cameras see white boxes walking;
parking cameras a lot of outlined slots where yellow cars park and leave; traffic cameras yellow cars
driving past.

For the test-boxes detector only: automated tests, and a live check on a PC without a GPU
(CLAUDE.md §3.4). The clips are not footage and show nobody; their readings are labelled "simulated".

    python tools/make_test_clips.py --out videos/test-clips
    VISION_DETECTOR=test-boxes VISION_CAMERAS_FILE=videos/test-clips/cameras.yaml python -m vision
"""

import argparse
import math
import random
from pathlib import Path

import cv2
import numpy as np
import yaml

from vision.cameras import load_cameras
from vision.contracts import Camera
from vision.projection import CameraPose, ground_homography
from vision.registry import REGISTRY_FILE, load_registry

EXAMPLE = Path(__file__).resolve().parents[1] / "configs" / "cameras.example.yaml"
WIDTH, HEIGHT = 320, 180
YELLOW = (0, 220, 255)  # BGR: a car for the test-boxes detector


class Walker:
    """Someone walking across the camera's view, in metres east and north of the camera."""

    def __init__(self, rng: random.Random, pose: CameraPose) -> None:
        self.pose = pose
        bearing = math.radians(pose.heading + rng.uniform(-0.4, 0.4) * pose.fov_deg)
        distance = rng.uniform(pose.near_m + 1, pose.range_m * 0.9)
        self.east, self.north = distance * math.sin(bearing), distance * math.cos(bearing)
        direction, speed = rng.uniform(0, 2 * math.pi), rng.uniform(0.8, 1.6)  # m/s
        self.v_east, self.v_north = speed * math.sin(direction), speed * math.cos(direction)

    def step(self, seconds: float) -> None:
        east, north = self.east + self.v_east * seconds, self.north + self.v_north * seconds
        if not self._in_view(east, north):  # turn back at the edge of the view
            self.v_east, self.v_north = -self.v_east, -self.v_north
            return
        self.east, self.north = east, north

    def _in_view(self, east: float, north: float) -> bool:
        distance = math.hypot(east, north)
        off = (math.degrees(math.atan2(east, north)) - self.pose.heading + 180) % 360 - 180
        return (
            self.pose.near_m + 0.5 < distance < self.pose.range_m * 0.95
            and abs(off) < self.pose.fov_deg * 0.45
        )


def write_clip(path: Path, camera: Camera, people: int, frames: int, fps: float, rng: random.Random) -> None:
    pose = CameraPose(camera.latitude, camera.longitude, camera.heading, camera.fov_deg, camera.range_m)
    # The pose's own projection, inverted: people walk on the ground and are drawn where the camera sees them.
    to_image = np.linalg.inv(ground_homography(pose, (WIDTH, HEIGHT)))
    walkers = [Walker(rng, pose) for _ in range(people)]
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (WIDTH, HEIGHT))
    for _ in range(frames):
        frame = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
        ground = np.array([[[w.east, w.north]] for w in walkers], dtype=np.float64)
        for (x, y), walker in zip(
            cv2.perspectiveTransform(ground, to_image).reshape(-1, 2), walkers, strict=True
        ):
            # Nearer people look bigger; feet at (x, y).
            height = int(np.clip(60 * pose.near_m / math.hypot(walker.east, walker.north), 6, 40))
            left, feet = int(x) - height // 5, min(int(y), HEIGHT - 1)
            frame[max(0, feet - height) : feet, max(0, left) : left + max(2, height * 2 // 5)] = 255
            walker.step(1 / fps)
        writer.write(frame)
    writer.release()


def write_parking_clip(path: Path, frames: int, fps: float, rng: random.Random) -> list[list[list[float]]]:
    """Two rows of four slots; cars park and leave every two seconds. Returns the slots' outlines."""
    slots = [
        (20 + col * 72, 50 + row * 62, 80 + col * 72, 100 + row * 62) for row in range(2) for col in range(4)
    ]
    taken = set(rng.sample(range(len(slots)), rng.randint(1, len(slots) - 1)))
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (WIDTH, HEIGHT))
    for index in range(frames):
        if index and index % round(fps * 2) == 0:
            taken ^= {rng.randrange(len(slots))}  # one car arrives or leaves
            taken = taken or {0}
        frame = np.full((HEIGHT, WIDTH, 3), 40, dtype=np.uint8)
        for number, (x1, y1, x2, y2) in enumerate(slots):
            cv2.rectangle(frame, (x1, y1), (x2, y2), (120, 120, 120), 1)
            if number in taken:
                frame[y1 + 6 : y2 - 6, x1 + 6 : x2 - 6] = YELLOW
        writer.write(frame)
    writer.release()
    return [
        [
            [x1 / WIDTH, y1 / HEIGHT],
            [x2 / WIDTH, y1 / HEIGHT],
            [x2 / WIDTH, y2 / HEIGHT],
            [x1 / WIDTH, y2 / HEIGHT],
        ]
        for x1, y1, x2, y2 in slots
    ]


def write_traffic_clip(path: Path, frames: int, fps: float, rng: random.Random) -> None:
    """Cars driving left to right along a road, at different speeds."""
    cars = [
        (rng.uniform(0, WIDTH), rng.choice((75, 105)), rng.uniform(25, 60)) for _ in range(rng.randint(2, 4))
    ]
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (WIDTH, HEIGHT))
    for index in range(frames):
        frame = np.full((HEIGHT, WIDTH, 3), 40, dtype=np.uint8)
        frame[70:135] = 90  # the road
        for x, y, speed in cars:
            left = int((x + speed * index / fps) % (WIDTH - 40))
            frame[y : y + 22, left : left + 40] = YELLOW
        writer.write(frame)
    writer.release()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Synthetic test clips for the test-boxes detector.")
    parser.add_argument("--out", type=Path, default=Path("videos/test-clips"))
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--fps", type=float, default=10.0)
    parser.add_argument("--config", type=Path, default=EXAMPLE)
    parser.add_argument("--registry", type=Path, default=REGISTRY_FILE)
    args = parser.parse_args(argv)
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    registry = load_registry(args.registry)
    entries = []
    for index, camera in enumerate(load_cameras(args.config)):
        rng = random.Random(index)
        clip = out / f"{camera.id}.avi"
        frames = round(args.seconds * args.fps)
        # Synthetic clips go through the estimated pose, never a dataset's calibration.
        entry = camera.model_dump(mode="json", exclude_none=True, exclude={"wildtrack"})
        if camera.kind == "parking":
            entry["slots"] = write_parking_clip(clip, frames, args.fps, rng)
        elif camera.kind == "traffic":
            write_traffic_clip(clip, frames, args.fps, rng)
        else:
            write_clip(clip, registry[camera.id], rng.randint(2, 12), frames, args.fps, rng)
        entries.append({**entry, "source": str(clip)})
    header = "# Synthetic test clips from tools/make_test_clips.py: not footage, for test-boxes only.\n"
    (out / "cameras.yaml").write_text(header + yaml.safe_dump({"cameras": entries}, sort_keys=False))
    print(f"wrote {len(entries)} clips and cameras.yaml to {out}")


if __name__ == "__main__":
    main()
