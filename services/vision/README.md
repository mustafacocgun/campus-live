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
| `VISION_DETECTOR`          | `simulated`                    | `simulated` or `yolo`                         |
| `VISION_CAMERAS_FILE`      | `configs/cameras.example.yaml` | Camera config                                 |
| `VISION_PUBLISH_INTERVAL_S`| `2.0`                          | Seconds between pushes                        |

## Count from video

1. Put the clip in `videos/` (git-ignored) and record its source and license in `docs/data-sources.md`.
2. `cp configs/cameras.example.yaml configs/cameras.yaml` (git-ignored) and set `source` for the camera:
   a file path, or a webcam index such as `0`.
3. `VISION_DETECTOR=yolo VISION_CAMERAS_FILE=configs/cameras.yaml python -m vision`

The first run downloads `yolo11n.pt` into `models/` (git-ignored). Crowd cameras count with YOLO;
parking and traffic cameras stay simulated until their analyzers exist, and say so in the log.

## Test

```bash
pytest
ruff check . && ruff format --check .
```
