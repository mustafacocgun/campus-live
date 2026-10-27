# Campus Live vision service

Camera video in, people and vehicle counts out. One worker per camera samples frames, YOLO11n finds
people, an analyzer turns them into a `CameraReading`, and the publisher pushes readings to the API
every 2 s. **Only numbers leave this service; frames are never stored** (CLAUDE.md §0.2).

## Setup

```bash
cd services/vision
python -m venv .venv
.venv\Scripts\activate          # Windows (macOS/Linux: source .venv/bin/activate)
pip install -e ".[dev]"         # add the YOLO detector with ".[dev,yolo]"
```

For an NVIDIA GPU, install the CUDA build of torch first (the command from pytorch.org's Get Started
page), then `pip install -e ".[dev,yolo]"`; pip keeps the torch you installed.

## Run

```bash
python -m vision                # simulated readings, no video or GPU needed
```

It serves `GET /health` and `GET /status` (each camera's mode, readings per second, last reading time,
error type) on `127.0.0.1:8001`, and pushes readings to the API.

| Variable                   | Default                        | Meaning                                       |
| -------------------------- | ------------------------------ | --------------------------------------------- |
| `VISION_API_URL`           | `http://localhost:4000`        | Where readings are pushed                     |
| `VISION_INGEST_TOKEN`      | empty                          | Must equal the API's token; keep it in `.env` |
| `VISION_DETECTOR`          | `simulated`                    | `simulated`, `yolo` or `replay`               |
| `VISION_CAMERAS_FILE`      | `configs/cameras.example.yaml` | Camera config                                 |
| `VISION_REPLAY_FILE`       | `recordings/demo.jsonl`        | Dataset written by record, played by replay   |
| `VISION_PUBLISH_INTERVAL_S`| `2.0`                          | Seconds between pushes                        |

## Count from video

1. Put the clip in `videos/` (git-ignored) and record its source and license in `docs/data-sources.md`.
2. `cp configs/cameras.example.yaml configs/cameras.yaml` (git-ignored) and set `source` for the camera:
   a file path, or a webcam index such as `0`.
3. `VISION_DETECTOR=yolo VISION_CAMERAS_FILE=configs/cameras.yaml python -m vision`

The first run downloads `yolo11n.pt` into `models/` (git-ignored). Crowd cameras count with YOLO;
parking and traffic cameras stay simulated until their analyzers exist, and say so in the log.

## Record once, replay anywhere

Counting video needs YOLO and a GPU; replaying what was counted needs neither. Record on the GPU
machine, then any laptop (and the stage) can play the readings back.

1. **Record** (needs the `yolo` extra and `configs/cameras.yaml` with clip sources, as above):

   ```bash
   python -m vision.record --cameras configs/cameras.yaml --out recordings/demo.jsonl
   ```

   Each camera with a video `source` runs once through the same pipeline as live (sampling, YOLO,
   the analyzer's 5-sample median), as fast as the clip decodes. Webcams are refused. Parking and
   traffic cameras are skipped until their analyzers exist. Both flags default to
   `VISION_CAMERAS_FILE` and `VISION_REPLAY_FILE`.

2. **Replay:** `VISION_DETECTOR=replay python -m vision` (or set it in `.env` and run `npm run dev`).
   Each recorded camera loops over its readings forever, keeping their recorded spacing, stamped with
   the current time and `source: "demo-footage"`, so the apps label them "Demo verisi". Cameras with
   no recorded readings stay simulated. A missing or invalid dataset stops startup.

The dataset is JSON Lines with numbers only, never frames: one `CameraReading` per line in its wire
format, with `measuredAt` replaced by `offsetS`, the seconds from the start of the clip.

```json
{"offsetS": 0.5, "cameraId": "kafe-merkez", "kind": "crowd", "count": 3, "level": "low", "source": "demo-footage"}
```

A dataset may be committed so teammates can replay without the video, but only if its clip is
listed in `docs/data-sources.md`.

## Test

```bash
pytest
ruff check . && ruff format --check .
```
