"""A folder of frames (such as WILDTRACK's Image_subsets/C1) -> one video the vision service can play.

WILDTRACK's shipped calibration belongs to its undistorted frames, not to the raw videos
(docs/data-sources.md), so its cameras play these frames. Frames are taken in file-name order. The
zip's frames are numbered in steps of 5, i.e. 2 per second.

    python tools/frames_to_video.py datasets/wildtrack/Image_subsets/C1 videos/wildtrack/C1_000.mp4 --fps 2
"""

import argparse
from pathlib import Path

import cv2


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Frames in a folder -> one MP4 video.")
    parser.add_argument("frames", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--fps", type=float, default=2.0, help="the frames' own rate (WILDTRACK's zip: 2)")
    args = parser.parse_args(argv)
    paths = sorted(p for p in args.frames.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg"})
    if not paths:
        raise SystemExit(f"no .png or .jpg frames in {args.frames}")
    first = cv2.imread(str(paths[0]))
    if first is None:
        raise SystemExit(f"cannot read {paths[0]}")
    height, width = first.shape[:2]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(args.out), cv2.VideoWriter_fourcc(*"mp4v"), args.fps, (width, height))
    if not writer.isOpened():
        raise SystemExit(f"cannot write {args.out}")
    for path in paths:
        frame = cv2.imread(str(path))
        if frame is None or frame.shape[:2] != (height, width):
            raise SystemExit(f"{path.name}: unreadable, or not {width}x{height} like the first frame")
        writer.write(frame)
    writer.release()
    print(f"wrote {args.out}: {len(paths)} frames, {width}x{height}, {args.fps:g} fps")


if __name__ == "__main__":
    main()
