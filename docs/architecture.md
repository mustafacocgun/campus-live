# Campus Live: architecture

Campus Live is a live campus map. Camera videos are analysed by YOLO, the people they see are projected onto the campus map, and a **heat cloud** shows where the crowd is and how it moves, on the web and on phones. An assistant answers questions about that live state in Turkish ("Kütüphane şu an kalabalık mı?").

There is no access to campus cameras. The cameras are **virtual**: recorded footage (the WILDTRACK multi-camera dataset and licensed stock clips) placed at campus spots taken from OpenStreetMap. The apps keep a small "Demo görüntüsü" label while the footage is not from real campus cameras.

## Components

```
apps/web            Next.js 16: live heat map (MapLibre GL) with camera cones, camera list, assistant panel
apps/mobile         Expo SDK 58 (React Native): live heat map (MapLibre React Native, development build), assistant
services/api        Node 22 + Express 5 + TypeScript: camera registry, live state, Socket.IO, assistant
services/vision     Python 3.12: one worker per camera, YOLO -> people -> projected onto the map -> density cells
packages/contracts  zod schemas: the TypeScript types for web, mobile and api, plus JSON Schema for vision's tests
packages/client     API access, live feed, cell merging, cones and transitions shared by web and mobile
config/cameras.json The camera registry with each camera's pose, shared by the API and vision
```

## Data flow

```
video file (or webcam)
  -> vision worker (one per camera, 5 frames per second for crowd cameras)
       YOLO11n (people only) -> each person's feet (box bottom-centre)
       -> projected onto the map: the camera's pose, or its dataset calibration
       -> 3 m density cells (smoothed) + the camera's people count -> CameraReading
  -> POST /internal/readings (Bearer VISION_INGEST_TOKEN), every 0.5 s
  -> api: validates against contracts, keeps the latest reading per camera (+ its receive time)
       -> Socket.IO "reading" event -> web + mobile
       -> GET /api/cameras (first load: registry + latest reading + stale + ageMs)
       -> POST /api/assistant/chat: the LLM answers from a snapshot of the live state
web / mobile: merge the cells of fresh cameras (max per cell) -> heatmap that glides between updates,
              plus each camera's view cone and a dot per camera (grey when stale)
```

- **Live YOLO only.** Every number on the map comes from YOLO on real footage; there is no random or simulated data in the app. Teammates run the vision service on their own GPU PCs. The `test-boxes` detector (white rectangles in synthetic clips) exists for automated tests only.
- **Vision pushes, the API never pulls.** Cameras can run on several machines and all push to one API.
- **Clients talk only to the API.** They never reach the vision service or the LLM directly.

## Cameras and projection

- **The registry** (`config/cameras.json`) holds every camera's `id`, `name`, `section`, `kind`, map position and pose: `heading` (degrees clockwise from north, where the camera looks), `fovDeg` (horizontal view angle) and `rangeM` (far edge of the view). Spots come from OpenStreetMap features (© OpenStreetMap contributors, ODbL) and are **placeholders** until the team confirms them.
- **Estimated projection (pose):** the image's bottom corners map to the near arc (5 m, a camera mounted 4–5 m up) and its top corners to the far arc (`rangeM`), between `heading − fov/2` and `heading + fov/2`. `cv2.getPerspectiveTransform` gives the image→ground homography, used for every person's feet.
- **Dataset calibration:** a camera can instead carry its footage's real calibration, an OpenCV pinhole model (`K` + distortion, `rvec`/`tvec` for the ground plane Z = 0) plus a **map anchor** (where the dataset's world origin sits on campus, and a rotation). Feet are undistorted, mapped through the inverse of `K·[r1 r2 t]`, scaled to metres and placed at the anchor. WILDTRACK's 7 views are calibrated this way and overlap at one campus plaza, so a crowd crossing it moves from view to view.
- **View cones** are drawn on the map so viewers see where each number comes from. For calibrated cameras the cone is the projection of the image's corners, written into the registry by a vision tool.

## The contract (`packages/contracts`)

`CameraReading` is what vision sends:

| Field              | Meaning                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `cameraId`, `kind` | Must match a registered camera                                                                              |
| `count`            | People (crowd) or vehicles (parking, traffic) in view                                                       |
| `level`            | `low`, `medium` or `high`, shown as Az, Orta or Yoğun                                                       |
| `cells`            | Crowd only: `[{lat, lng, weight}]`, the smoothed number of people per 3 m cell (no individuals)             |
| `parking`          | `{ total, free }`, for parking cameras only                                                                 |
| `source`           | `simulated` (synthetic test clips only), `demo-footage` or `camera`. Anything but `camera` is labelled demo |
| `measuredAt`       | ISO-8601 UTC                                                                                                |

The zod schemas are the single source of truth. A build step writes them as JSON Schema into `packages/contracts/schemas/`, and vision's tests check every reading against it.

## Vision (AI)

- **Per-camera processing config** (`services/vision/configs/`, the local copy git-ignored): video source, frames per second, optional zone, thresholds, optional dataset calibration. Ids must exist in `config/cameras.json`; a test checks this.
- **Crowd:** YOLO11n, COCO class 0 (person) only, so vehicles never enter the crowd heat. The camera's count is the median of the last 5 samples. Each person's feet are projected and binned into a global 3 m grid anchored at the campus origin (40.7420, 30.3320), so cells from different cameras line up. Cell weights are smoothed (EMA, α = 0.3), and cells under 0.05 are dropped.
- **Parking (next) and traffic (after parking):** separate analyzers on vehicle classes (1, 2, 3, 5, 7), on their own map layers, never mixed into the crowd heat.
- **Levels come from per-camera thresholds.** They are guesses until a hand count measures them (CLAUDE.md §3.5).
- **Detector:** Ultralytics YOLO11n (AGPL-3.0), installed with the `yolo` extra. The weights download once into git-ignored `models/`. `YOLO_OFFLINE=true` turns Ultralytics analytics off.
- **Health:** `GET /status` on the vision service shows each camera's rate, last reading time and error type. The API marks a camera stale after 15 s without a reading (by its own receive time), and the maps show it grey with "Görüntü yok".

## Assistant

- **Placement:** `services/api` owns the assistant, because it holds the live state.
- **Provider:** an OpenAI-compatible `/chat/completions` call. `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` come from the API's environment only, and the key never appears in a response or a log.
- **Grounding:** each question is sent with a compact snapshot of every camera (name, section, level, count, age, demo or not). The system prompt says to answer in Turkish, only from that data, to copy numbers exactly, and to say "Bu konuda verim yok" when the data has no answer.
- **Fallback:** without a key, or when the provider fails or takes more than 8 s, a rule-based answer is built from the same snapshot (the named place first, then the kind of question). The demo works without any LLM.
- **Rate limit:** 10 questions per minute per client.

## Privacy and data rules

- **Frames never leave the vision service and are never written to disk.** Only readings leave it: counts and **aggregated** density cells. No identities, tracks or per-person positions ever leave vision.
- **Footage:** WILDTRACK (research and evaluation license) and licensed stock clips, each with a line in `docs/data-sources.md`. Videos, dataset files and model weights are never committed.
- **No accounts in v1.**

## Running it

See the root `README.md`. Short version: `npm install`, set up the vision venv with the `yolo` extra on a GPU PC, put the videos in place, then `npm run dev` (api + web + vision). The phone app needs a development build (`apps/mobile/README.md`).
