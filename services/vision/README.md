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

## Places and cameras on the campus

`config/places.json` (what users see) and the indoor, parking and traffic cameras in
`config/cameras.json` come from OpenStreetMap through `tools/build_campus.py` (its docstring says how to
refresh them); hand-placed outdoor cameras are kept. Nothing on SUBÜ's buildings or lots, and no indoor
camera where people live or sleep.

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

## Kinds of cameras

- **Crowd, outdoors:** people's feet are projected onto the map and sent as 3 m heat cells plus a count.
- **Crowd, indoors** (`"indoor": true` in `config/cameras.json`): a count only, which lights up the whole
  building. Only where people study, eat or work: never where they live or sleep.
- **Parking:** vehicles (car, motorcycle, bus, truck) against the lot's outlined slots; a slot is taken
  when a vehicle's box covers at least 40 % of it, smoothed per slot. Sends free/total. YOLO runs at
  1280 px for parking (`IMAGE_SIZE` in `service.py`): at the default 640 px it missed most parked cars
  (#50).
- **Traffic:** vehicles in the camera's `zone` (the road), smoothed; the level comes from `thresholds`.

## Outline a parking clip's slots

Once per clip, on a PC with a screen:

```bash
python tools/draw_slots.py videos/parking/lot.mp4 --at 2
```

Click each slot's 4 corners; `u` undoes, `s` saves `videos/parking/lot.mp4.slots.yaml`. Every camera
that plays this clip gets these slots from `tools/assign_clips.py`.

## Footage for many cameras

Cut long videos into 5-minute clips, at 5 frames a second and 720p, so one PC can play many of them:

```bash
ffmpeg -i C1.mp4 -vf "fps=5,scale=1280:-2" -an -f segment -segment_time 300 -reset_timestamps 1 C1_%03d.mp4
```

Keep WILDTRACK clips at 1920×1080 (drop `scale=1280:-2`): the plaza cameras' calibration refuses any
other frame size (#46). Name them `<view>_<index>` (`C1_000.mp4` … `C7_011.mp4`): the plaza's 7 cameras
then play the same index from the same start, in sync. Then give every camera a clip, at random but
reproducibly:

```bash
python tools/assign_clips.py --clips videos/wildtrack --out configs/cameras.yaml
python tools/assign_clips.py --clips videos/parking --kind parking --config configs/cameras.yaml --out configs/cameras.yaml
python tools/assign_clips.py --clips videos/traffic --kind traffic --config configs/cameras.yaml --out configs/cameras.yaml
```

Each camera gets a random clip and start (`start_s`); `--seed` picks another draw.

**Many cameras on one PC: run more than one vision process.** One process runs every camera as a
thread, and past a few dozen cameras it falls behind while the GPU is still half idle. Split
`configs/cameras.yaml` into parts (keep the plaza's 7 cameras together) and give each part its own
process and port; they all push to the same API:

```powershell
# npm run dev runs the first part: VISION_CAMERAS_FILE=configs/cameras.part1.yaml in .env
$env:VISION_CAMERAS_FILE="configs/cameras.part2.yaml"; $env:VISION_PORT="8002"; .venv\Scripts\python -m vision
```

Measured on one laptop (RTX 4050, 6 GB) with 52 crowd cameras on 2 fps WILDTRACK clips (#39): one
process kept a median 1.33 readings a second per camera (clips play at 2), with or without 720p
clips; two processes of 26 kept 1.83–1.87, using 4.7 GB of GPU memory. Name the part files
`cameras.<anything>.yaml` and keep them out of git: they hold the clip paths.

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
   video, C1 to C7 (the frames are numbered in steps of 5: 2 per second, about 200 s):
   `python tools/frames_to_video.py datasets/wildtrack/Image_subsets/C1 videos/wildtrack/C1_000.mp4 --fps 2`.
3. In `configs/cameras.yaml`, set `source: videos/wildtrack/C1_000.mp4` for `kutuphane-meydani-1`, and so
   on to C7, or let `tools/assign_clips.py` do it (below).
4. Run it, open the map and move the `&plaza` anchor (`lat`, `lng`, `rotation_deg`) until the heat
   sits on the plaza.

The camera order (C1 = CVLab1 … C7 = IDIAP3), the file formats, the centimetre unit and the 2 fps
frame rate were checked against the downloaded files on 2026-10-28 (`docs/data-sources.md`).

## Without footage or a GPU

```bash
python tools/make_test_clips.py --out videos/test-clips
VISION_DETECTOR=test-boxes VISION_CAMERAS_FILE=videos/test-clips/cameras.yaml python -m vision
```

White boxes walk across synthetic clips (people), yellow boxes park in outlined slots or drive past
(cars), and the readings are labelled `simulated`: for automated tests and checks only, never for the
demo.

## Test

```bash
pytest
ruff check . && ruff format --check .
```
