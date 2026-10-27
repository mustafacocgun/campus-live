# Campus Live vision service

Camera video in, crowd numbers out. One worker per camera samples 5 frames a second, YOLO11n finds
people, their feet are projected onto the campus map, and the publisher pushes each camera's count and
3 m density cells to the API every 0.5 s. **Only numbers leave this service; frames are never stored**
(CLAUDE.md §0.2).

## Setup

```bash
cd services/vision
python -m venv .venv
.venv\Scripts\activate          # Windows (macOS/Linux: source .venv/bin/activate)
pip install -e ".[dev,yolo]"
```

For an NVIDIA GPU, install the CUDA build of torch first (the command from pytorch.org's Get Started
page), then `pip install -e ".[dev,yolo]"`; pip keeps the torch you installed.

## Run

```bash
cp configs/cameras.example.yaml configs/cameras.yaml    # then set `source` for each camera you have footage for
VISION_CAMERAS_FILE=configs/cameras.yaml python -m vision
```

Live YOLO is the only data source in the app (CLAUDE.md §3.4). A camera without footage does not run
and stays grey on the map. The first run downloads `yolo11n.pt` into `models/` (git-ignored). Put
clips in `videos/` (git-ignored) and record each clip's source and license in `docs/data-sources.md`
first. Cameras can run on several PCs: each sets sources only for its own cameras, and all push to one
API.

It serves `GET /health` and `GET /status` (each running camera's readings per second, last reading
time, error type) on `127.0.0.1:8001`.

| Variable                    | Default                        | Meaning                                       |
| --------------------------- | ------------------------------ | --------------------------------------------- |
| `VISION_API_URL`            | `http://localhost:4000`        | Where readings are pushed                     |
| `VISION_INGEST_TOKEN`       | empty                          | Must equal the API's token; keep it in `.env` |
| `VISION_DETECTOR`           | `yolo`                         | `yolo`, or `test-boxes` for synthetic clips   |
| `VISION_CAMERAS_FILE`       | `configs/cameras.example.yaml` | Camera config (the example runs nothing)      |
| `VISION_PUBLISH_INTERVAL_S` | `0.5`                          | Seconds between pushes                        |

## Add a camera

1. **Footage:** put the clip in `videos/` (git-ignored) and give it a line in `docs/data-sources.md`
   (source, license, what it shows) before using it (CLAUDE.md §0.3). Prefer a fixed, elevated view.
2. **On the map:** add the camera to `config/cameras.json` at the repo root: `id`, `name`, `section`,
   `kind` (`crowd`), where it stands (`latitude`, `longitude`) and where it looks: `heading` (degrees
   clockwise from north), `fovDeg` (the view's width in degrees) and `rangeM` (how far it sees). Until
   the team confirms a spot, it is a placeholder (§0.5). Restart the API after editing it.
3. **Processing:** add the id to `configs/cameras.example.yaml` with its thresholds, and to your
   `configs/cameras.yaml` with `source: videos/<clip>`.
4. **Check:** `pytest tests/test_registry_ids.py tests/test_cameras.py`, then run vision and open the
   map: the camera's heat should sit inside its cone. If people land in the wrong place, adjust
   `heading`, `fovDeg` or `rangeM`.

## Where people land on the map

- **Most cameras:** the camera's pose in `config/cameras.json` (position, `heading`, `fovDeg`,
  `rangeM`) gives an estimate: the bottom of the image is 5 m away, the top is `rangeM` away. Move a
  camera there when its heat is in the wrong place.
- **WILDTRACK cameras:** the dataset's own calibration, placed at a map anchor (below).

## WILDTRACK: the plaza's 7 cameras

1. Download `Wildtrack_dataset_full.zip` from the EPFL page (license and what the files are:
   `docs/data-sources.md`) and unzip it into `datasets/wildtrack/` (git-ignored), so that
   `datasets/wildtrack/calibrations/` and `datasets/wildtrack/Image_subsets/` exist.
2. The shipped calibration belongs to the frames, not the raw videos. Turn each camera's frames into a
   video, C1 to C7:
   `python tools/frames_to_video.py datasets/wildtrack/Image_subsets/C1 videos/wildtrack/C1.mp4 --fps 10`.
   If the frame numbers go up in steps of 5, the frames are 2 per second: use `--fps 2`.
3. In `configs/cameras.yaml`, set `source: videos/wildtrack/C1.mp4` for `kutuphane-meydani-1`, and so
   on to C7.
4. Run it, open the map and move the `&plaza` anchor (`lat`, `lng`, `rotation_deg`) until the heat
   sits on the plaza.

The camera order (C1 = CVLab1 … C7 = IDIAP3), the file formats, the centimetre unit and the 2 fps
frame rate were checked against the downloaded files on 2026-10-28 (`docs/data-sources.md`).

## Without footage or a GPU

```bash
python tools/make_test_clips.py --out videos/test-clips
VISION_DETECTOR=test-boxes VISION_CAMERAS_FILE=videos/test-clips/cameras.yaml python -m vision
```

White boxes walk across synthetic clips and the readings are labelled `simulated`: for automated
tests and checks only, never for the demo.

## Test

```bash
pytest
ruff check . && ruff format --check .
```
