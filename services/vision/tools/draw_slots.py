"""Outline a parking clip's slots once, by clicking. The outlines go next to the clip
(<clip>.slots.yaml), and tools/assign_clips.py hands them to every camera that plays it.

    python tools/draw_slots.py videos/parking/lot.mp4 [--at 2.0]

Click a slot's 4 corners, then the next slot's. u: undo the last corner, s: save and quit, q: quit.
"""

import argparse
from pathlib import Path

import yaml


def to_fractions(
    slots_px: list[list[tuple[float, float]]], frame_size: tuple[int, int]
) -> list[list[list[float]]]:
    """Pixel corners -> fractions of the frame (x / width, y / height), as the camera config wants."""
    width, height = frame_size
    return [[[round(x / width, 4), round(y / height, 4)] for x, y in slot] for slot in slots_px]


def save(path: Path, slots: list[list[list[float]]]) -> None:
    Path(path).write_text(yaml.safe_dump({"slots": slots}, default_flow_style=None))


def main(argv: list[str] | None = None) -> None:
    import cv2
    import numpy as np

    parser = argparse.ArgumentParser(description="Outline a parking clip's slots.")
    parser.add_argument("clip", type=Path)
    parser.add_argument(
        "--at", type=float, default=0.0, help="seconds into the clip for the frame to draw on"
    )
    args = parser.parse_args(argv)
    capture = cv2.VideoCapture(str(args.clip))
    capture.set(cv2.CAP_PROP_POS_MSEC, args.at * 1000)
    ok, frame = capture.read()
    capture.release()
    if not ok:
        raise SystemExit(f"cannot read a frame from {args.clip}")
    slots: list[list[tuple[int, int]]] = [[]]

    def click(event, x, y, _flags, _param) -> None:
        if event == cv2.EVENT_LBUTTONDOWN:
            slots[-1].append((x, y))
            if len(slots[-1]) == 4:
                slots.append([])

    window = "Campus Live: outline the parking slots (s: save, u: undo, q: quit)"
    cv2.namedWindow(window)
    cv2.setMouseCallback(window, click)
    while True:
        view = frame.copy()
        for slot in slots:
            for point in slot:
                cv2.circle(view, point, 3, (0, 255, 255), -1)
            if len(slot) == 4:
                cv2.polylines(view, [np.array(slot, dtype=np.int32)], True, (0, 255, 0), 2)
        cv2.imshow(window, view)
        key = cv2.waitKey(30) & 0xFF
        if key == ord("u"):
            if slots[-1]:
                slots[-1].pop()
            elif len(slots) > 1:
                slots.pop()
                slots[-1].pop()
        elif key == ord("s"):
            done = [slot for slot in slots if len(slot) == 4]
            height, width = frame.shape[:2]
            out = args.clip.with_name(args.clip.name + ".slots.yaml")
            save(out, to_fractions(done, (width, height)))
            print(f"saved {len(done)} slots to {out}")
            break
        elif key == ord("q"):
            break
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
