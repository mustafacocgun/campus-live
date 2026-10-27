"""python -m vision.frames: turn a folder of numbered frames into a clip the recorder can read.

Datasets such as WILDTRACK ship frames (00000000.png, 00000005.png, ...), not video, and OpenCV's
image-sequence reader needs consecutive numbers. The clip is footage like any other: it goes in
videos/ (git-ignored) and its dataset needs a line in docs/data-sources.md (CLAUDE.md §0.3).
"""

import argparse
from pathlib import Path

FRAME_SUFFIXES = {".png", ".jpg", ".jpeg"}


def frame_paths(folder: str | Path) -> list[Path]:
    """The folder's frames in order: image files named by a number; anything else is skipped."""
    frames = [
        path
        for path in Path(folder).iterdir()
        if path.suffix.lower() in FRAME_SUFFIXES and path.stem.isdigit()
    ]
    return sorted(frames, key=lambda path: int(path.stem))


def frames_to_clip(folder: str | Path, out: str | Path, fps: float) -> int:
    """Write the frames, in order, to an MJPG clip at `fps`. Returns the number of frames written."""
    import cv2

    frames = frame_paths(folder)
    if not frames:
        raise ValueError(f"{folder}: no frames (image files named by a number)")
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    writer = None
    try:
        for path in frames:
            frame = cv2.imread(str(path))
            if frame is None:
                raise ValueError(f"could not read {path.name}")
            height, width = frame.shape[:2]
            if writer is None:
                size = (width, height)
                writer = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*"MJPG"), fps, size)
                if not writer.isOpened():
                    raise RuntimeError(f"could not write {out}")
            elif (width, height) != size:
                raise ValueError(f"{path.name} is {width}x{height}; the first frame is {size[0]}x{size[1]}")
            writer.write(frame)
    finally:
        if writer is not None:
            writer.release()
    return len(frames)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="python -m vision.frames", description="Turn a folder of numbered frames into an MJPG clip."
    )
    parser.add_argument("folder", help="folder of frames named by a number, e.g. 00000005.png")
    parser.add_argument("out", help="the clip to write, e.g. videos/wildtrack-c1.avi")
    parser.add_argument("--fps", type=float, required=True, help="the rate the frames were taken at")
    args = parser.parse_args(argv)
    count = frames_to_clip(args.folder, args.out, args.fps)
    print(f"wrote {count} frames to {args.out} at {args.fps:g} fps")


if __name__ == "__main__":
    main()
