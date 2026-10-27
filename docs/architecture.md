# Campus Live: architecture

Campus Live is a live campus map. Each camera spot shows how crowded it is, how many parking slots are free, or how busy the road is, on the web and on phones. An assistant answers questions about that live state in Turkish ("Otopark A'da boş yer var mı?").

There is no access to campus cameras. Cameras are **demo videos** (licensed stock footage or the team's own recordings) placed at campus positions, and the apps label every reading as demo data.

## Components

```
apps/web          Next.js 16: live map (Leaflet + OpenStreetMap) and the assistant panel
apps/mobile       Expo SDK 58 (React Native): live map (react-native-maps) and the assistant screen
services/api      Node 22 + Express 5 + TypeScript: camera registry, live state, WebSocket, assistant
services/vision   Python 3.12: one worker per camera, YOLO -> counts -> readings, pushed to the API
packages/contracts  zod schemas: the TypeScript types for web, mobile and api, plus JSON Schema for vision's tests
```

## Data flow

```
video file / webcam
  -> vision worker (one per camera, 1-2 frames per second)
       detector (YOLO11n: people or vehicles) -> analyzer (crowd | parking | traffic) -> CameraReading
  -> POST /internal/readings (Bearer VISION_INGEST_TOKEN), every 2 s
  -> api: validates against contracts, keeps the latest reading per camera
       -> Socket.IO "reading" event -> web + mobile maps recolor
       -> GET /api/cameras (first load: registry + latest reading + stale flag)
       -> POST /api/assistant/chat: the LLM answers from a snapshot of the live state
```

- **Vision pushes, the API never pulls.** The vision service is the producer, so cameras can run on several machines (a GPU PC, a laptop) and all push to one API.
- **Clients talk only to the API.** They never reach the vision service or the LLM directly.
- **Simulated mode:** `VISION_DETECTOR=simulated` produces plausible readings with no video and no GPU. Web, mobile and API work runs on any laptop.

## The contract (`packages/contracts`)

`Camera` is what the map shows: `id`, `name`, `section`, `kind` (crowd, parking or traffic), `latitude`, `longitude`. The API owns this registry (`services/api/config/cameras.json`).

`CameraReading` is what vision sends:

| Field              | Meaning                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `cameraId`, `kind` | Must match a registered camera                                                                     |
| `count`            | People (crowd) or vehicles (parking, traffic) in view                                              |
| `level`            | `low`, `medium` or `high`, shown as Az, Orta or Yoğun                                              |
| `parking`          | `{ total, free }`, for parking cameras only                                                        |
| `source`           | `simulated`, `demo-footage` or `camera`. Anything but `camera` is labelled as demo data in the UI. |
| `measuredAt`       | ISO-8601 UTC                                                                                       |

The zod schemas are the single source of truth. A build step writes them as JSON Schema into `packages/contracts/schemas/`, and vision's tests check every reading against it, so a contract change breaks the build on both sides.

## Vision (AI)

- **Per-camera config** (`services/vision/configs/cameras.yaml`): video source, kind, frames per second, an optional zone polygon or parking slot polygons, and level thresholds. Camera ids must exist in the API registry; a test checks this.
- **Crowd:** people whose feet (box bottom-centre) are inside the zone. With no zone, every person in view counts. The shown count is the median of the last 5 samples, so one missed detection does not flicker the map.
- **Parking (next):** each slot is a polygon drawn once on that camera's view. A slot is taken when a vehicle's bottom-centre is inside it.
- **Traffic (after parking):** vehicles in a road zone, or vehicles per minute across a line (tracking, ported from the campus-life line counter).
- **Levels come from per-camera thresholds.** They are guesses until a hand count measures them.
- **Detector:** Ultralytics YOLO11n, COCO classes person (0) and bicycle, car, motorcycle, bus, truck (1, 2, 3, 5, 7). It is loaded lazily and installed only with the `yolo` extra. `YOLO_OFFLINE=true` turns Ultralytics analytics off.
- **Health:** `GET /status` on the vision service shows each camera's frames per second, last reading time and error. The API marks a camera `stale` after 15 s without a reading, and the maps show it grey.

## Assistant

- **Placement:** `services/api` owns the assistant, because it holds the live state.
- **Provider:** an OpenAI-compatible `/chat/completions` call. `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` come from the API's environment only, and the key never appears in a response or a log.
- **Grounding:** each question is sent with a compact snapshot of every camera (name, section, level, count, free slots, age, demo or not). The system prompt says to answer in Turkish, only from that data, to copy numbers exactly, to say "bu konuda verim yok" when the data has no answer, and to mention that the data is from demo videos.
- **Fallback:** when there is no key, the provider fails, or it takes more than 8 s, a rule-based answer is built from the same snapshot (parking, crowd or traffic, picked by keywords). The demo works without any LLM.
- **Rate limit:** 10 questions per minute per client.

## Privacy and data rules

- **Frames never leave the vision service and are never written to disk.** Only readings (numbers) leave it, and the apps show numbers and colors only.
- **Footage:** licensed footage or the team's own recordings first. Every clip gets an entry in `docs/data-sources.md`: source, license, what it shows. Videos and model weights are never committed.
- **No accounts in v1.** Following a parking lot will use the phone's push token, not a user account.

## Running it

See the root `README.md`. Short version: `npm install`, then `npm run dev` (api + web + vision in simulated mode), then `npm run dev:mobile` for the phone app.
