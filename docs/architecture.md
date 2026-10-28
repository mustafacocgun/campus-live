# Campus Live: architecture

Campus Live is a live campus map. Camera videos are analysed by YOLO, and the map shows **where the crowd is** (a heat cloud outdoors, buildings lit by the people inside), **how many parking slots are free** in each lot, and **how busy each campus road is**, on the web and on phones. An assistant answers questions about that live state in Turkish ("Kütüphane şu an kalabalık mı?", "Otoparkta boş yer var mı?").

**Where the cameras are is never shown** (D19): someone could use a map of cameras to avoid or target them. The public API, the socket events and the apps carry places and the merged heat only. Camera positions stay on the server.

There is no access to campus cameras. The cameras are **virtual**: recorded footage (WILDTRACK clips and licensed stock clips) assigned to camera spots on the campus. The apps keep a small "Demo görüntüsü" label while the footage is not from real campus cameras.

## Components

```
apps/web             Next.js 16: colorful 3D campus map (MapLibre GL): heat, lit buildings, parking lots, roads; places list; assistant
apps/mobile          Expo SDK 58 (React Native): the same map (MapLibre React Native, development build), assistant
services/api         Node 22 + Express 5 + TypeScript: registries, live state by place, Socket.IO, assistant
services/vision      Python 3.12: one worker per camera: YOLO -> crowd (cells or counts), parking slots, road traffic
packages/contracts   zod schemas: the TypeScript types for web, mobile and api, plus JSON Schema for vision's tests
packages/client      API access, live feed, transitions and map layers shared by web and mobile
config/places.json   What users see: areas, buildings, parking lots and roads, from OpenStreetMap (public)
config/cameras.json  Every camera: its place, kind and pose (private: read by the API and vision, served to nobody)
```

## Data flow

```
video file (or webcam)
  -> vision worker (one per camera)
       crowd, outdoor: YOLO people -> feet projected onto the map -> 3 m density cells + count
       crowd, indoor:  YOLO people -> count (no positions)
       parking:        YOLO vehicles -> outlined slots taken or free -> free/total
       traffic:        YOLO vehicles in the road zone -> count
       -> CameraReading
  -> POST /internal/readings (Bearer VISION_INGEST_TOKEN), every 0.5 s
  -> api: validates against contracts, keeps the latest reading per camera (+ its receive time)
       -> per place: count, level, free slots, stale; the outdoor heat merged by max per cell
       -> GET /api/live and a Socket.IO "live" snapshot every second (places + heat, no cameras)
       -> POST /api/assistant/chat: the LLM answers from the places
web / mobile: the heat glides between snapshots; buildings, lots and roads take their colors
```

- **Live YOLO only.** Every number comes from YOLO on footage; no random or simulated data in the app. Teammates run vision on their own GPU PCs. The `test-boxes` detector (white boxes are people, yellow boxes are cars, in synthetic clips) exists for automated tests and runs without a GPU.
- **Vision pushes, the API never pulls.** Cameras can run on several machines and all push to one API.
- **Clients talk only to the API.** They never reach the vision service or the LLM directly.

## Places and cameras

| Place kind | Geometry (OpenStreetMap) | Fed by                                | Count              | On the map                        |
| ---------- | ------------------------ | ------------------------------------- | ------------------ | --------------------------------- |
| `area`     | a label point            | outdoor crowd cameras (cells + count) | max of its cameras | the heat cloud                    |
| `building` | footprint                | indoor crowd cameras (count only)     | sum of its cameras | the 3D building, colored by crowd |
| `parking`  | lot outline              | parking cameras (outlined slots)      | free/total summed  | the lot colored by free share     |
| `road`     | line                     | traffic cameras                       | max of its cameras | the road colored by traffic level |

- Views of an outdoor area can overlap, so its count is the busiest camera's, never the sum; rooms and floors of a building differ, so they add up. A place's level is the highest among its fresh cameras; with none, it is stale ("Görüntü yok").
- Place geometry is © OpenStreetMap contributors (ODbL). Places and cameras are **placeholders** until the team confirms them (CLAUDE.md §0.5). Nothing is placed on SUBÜ's buildings, and no indoor camera where people live or sleep.
- **Generated camera spots can be worked out by anyone with the code.** Indoor, parking and traffic cameras come from fixed rules on the public shapes (inside a footprint, a lot's far corner, points along a road), so `tools/build_campus.py` recomputes them. That is fine for demo placeholders only: real camera spots are entered by hand and never generated (D19). An outdoor area's label sits on a 30 m grid, not at its camera's view centre, which would point back at the camera.
- **Outdoor projection:** a camera's pose (`heading`, `fovDeg`, `rangeM`) gives an estimated image→ground homography: the bottom of the image is 5 m away, the top is `rangeM` away. The WILDTRACK plaza views can use the dataset's own calibration instead (`services/vision/README.md`).
- **Residual risk:** over hours, where heat appears outlines what cameras cover. Coarser or thresholded cells reduce it (#24, the team's call).

## The contract (`packages/contracts`)

`CameraReading` is what vision sends (internal, token-protected):

| Field              | Meaning                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `cameraId`, `kind` | Must match a registered camera                                                                              |
| `count`            | People (crowd) or vehicles (parking, traffic) in view                                                       |
| `level`            | `low`, `medium` or `high`, shown as Az, Orta or Yoğun                                                       |
| `cells`            | Outdoor crowd only: `[{lat, lng, weight}]`, the smoothed number of people per 3 m cell (no individuals)     |
| `parking`          | `{ total, free }`, for parking cameras only                                                                 |
| `source`           | `simulated` (synthetic test clips only), `demo-footage` or `camera`. Anything but `camera` is labelled demo |
| `measuredAt`       | ISO-8601 UTC                                                                                                |

`LiveSnapshot` is what the apps get (public): `places` (each place with its count, level, free slots, staleness and age) and `cells` (the merged heat). It has no camera field; a test checks the public payloads.

The zod schemas are the single source of truth. A build step writes them as JSON Schema into `packages/contracts/schemas/`, and vision's tests check every reading against it.

## Vision (AI)

- **Per-camera processing config** (`services/vision/configs/`, the local copy git-ignored): video source, start offset, frames per second, zone, parking slots, thresholds, optional dataset calibration. Ids must exist in `config/cameras.json`; a test checks this.
- **Crowd:** YOLO11n, COCO class 0 (person). The count is the median of the last 5 samples. Outdoors, each person's feet are projected and binned into a global 3 m grid anchored at (40.7420, 30.3320), smoothed per cell (EMA, α = 0.3); cells under 0.05 are dropped. Indoors, the count only.
- **Parking:** vehicle classes (car, motorcycle, bus, truck). Each slot is outlined once on a frame (`tools/draw_slots.py`); a slot is taken when a vehicle's footprint covers most of it, smoothed per slot. The reading is free/total.
- **Traffic:** vehicle classes in the road zone; the count is a median, the level comes from the camera's thresholds.
- **Levels come from per-camera thresholds.** They are guesses until a hand count measures them (CLAUDE.md §3.5).
- **Footage:** `tools/assign_clips.py` gives each camera a random clip and start offset (fixed seed); the WILDTRACK plaza's views share one clip index so they stay in sync. Car footage: licensed clips, each with a line in `docs/data-sources.md`.
- **Detector:** Ultralytics YOLO11n (AGPL-3.0), installed with the `yolo` extra. The weights download once into git-ignored `models/`. `YOLO_OFFLINE=true` turns Ultralytics analytics off.
- **Health:** `GET /status` on the vision service shows each camera's rate, last reading time and error type. The API marks a camera stale after 15 s without a reading (by its own receive time).

## Assistant

- **Placement:** `services/api` owns the assistant, because it holds the live state.
- **Provider:** an OpenAI-compatible `/chat/completions` call. `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` come from the API's environment only, and the key never appears in a response or a log.
- **Grounding:** each question is sent with a compact snapshot of every place (name, kind, level, count or free slots, age, demo or not). The system prompt says to answer in Turkish, only from that data, to copy numbers exactly, and to say "Bu konuda verim yok" when the data has no answer.
- **Fallback:** without a key, or when the provider fails or takes more than 8 s, a rule-based answer is built from the same places (the named place first, then the kind of question; a crowd question about the whole campus gets the three busiest places). The demo works without any LLM.
- **Rate limit:** 10 questions per minute per client.

## Privacy and data rules

- **Frames never leave the vision service and are never written to disk.** Only readings leave it: counts, free slots and **aggregated** density cells. No identities, tracks or per-person positions ever leave vision.
- **Camera positions never leave the server:** not in the public API, socket events, the apps or their bundles.
- **Footage:** WILDTRACK (research and evaluation license) and licensed stock clips, each with a line in `docs/data-sources.md`. Videos, dataset files and model weights are never committed.
- **Accounts keep only what alerts need** (D26): the school e-mail, a scrypt hash of the password, session-token hashes, alert rules and the notifications sent. No names or student numbers. E-mails never go into a log or the LLM prompt, and the assistant never sees accounts.

## Accounts and place alerts

- **Optional.** With `DATABASE_URL` set and Postgres reachable, the API applies `services/api/migrations/*.sql` at startup and turns accounts on; otherwise `/api/auth` and `/api/alerts` answer 503 and the map and assistant work unchanged.
- **Sign-up:** a school e-mail (exact domain match against `ALLOWED_EMAIL_DOMAINS`) and a password; a 6-digit code is mailed (15 minutes, 5 tries) and the account opens when it is entered. After that: e-mail + password. The session is an HttpOnly, SameSite=Lax cookie; the database keeps only its hash.
- **What an alert watches:** a place that some camera feeds (`GET /api/regions`), so a place a new camera feeds can be chosen after the API restarts. Its percent is the place's fresh count over private per-camera placeholder capacities (`services/api/config/capacity.json`, labelled "tahmini"), by the place's own rule: an area or a road as full as its fullest camera, a building or a parking lot summed (a lot uses its slots). A silent camera leaves both the count and the capacity. The response carries places and percents only: no camera, no capacity (§0.2).
- **Rules:** a place, below or above, a threshold in percent, and e-mail on or off. The API checks every enabled rule once a second, like the live snapshot. A rule fires once when its place crosses the threshold, again only after the place is back 5 points past it, and never twice within 10 minutes. A new rule, or a restart, only looks first: it never fires on sight.
- **Delivery:** a row in `notifications` (the in-app inbox), the Socket.IO `notification` event to that user's room (a toast, and a browser notification while the page is in the background), and the e-mail when asked. Readings that are not from a camera make the alert say "Demo verisi".

## Running it

See the root `README.md`. Short version: `npm install`, set up the vision venv with the `yolo` extra on a GPU PC, put the videos in place, then `npm run dev` (api + web + vision). The phone app needs a development build (`apps/mobile/README.md`).
