# Campus Live Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A professional monorepo where one live path works end to end: vision readings (simulated anywhere, YOLO on the GPU PC) reach the API and recolor markers on the web and mobile maps, and an assistant answers questions from the same live state.

**Architecture:** npm-workspace monorepo. The `contracts` package (zod) is the single source of truth, emitted as JSON Schema for the Python service. The vision service pushes readings to the Express API, which keeps the latest reading per camera and broadcasts it over Socket.IO. A shared `client` package gives web and mobile the same data and presentation logic. The assistant lives in the API: a grounded, OpenAI-compatible LLM call with a rule-based fallback.

**Tech Stack:** Node 22, npm workspaces, TypeScript 6, zod 4.6, Express 5.3, Socket.IO 4.8, Vitest; Next.js 16.4 + react-leaflet 5; Expo SDK 58 (React Native 0.88) + react-native-maps; Python 3.12, FastAPI, supervision 0.31, Ultralytics YOLO11n (optional extra).

**Spec:** `docs/architecture.md`, plus the team decisions of 2026-10-27: licensed or own footage first (YouTube later, maybe), numbers and colors only, crowd → parking → traffic, Expo, Express, a private repo `mustafacocgun/campus-live`, a thin end-to-end slice, and an LLM assistant.

## Global Constraints

- One React for the whole repo: root `overrides` pin `react` and `react-dom` to **19.3.0** (Expo SDK 58's pin; Next 16 accepts `^19`).
- Secrets live only in git-ignored `.env` files; each app has a `.env.example`. A key never goes in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`.
- Frames never leave the vision service and are never written to disk. Only `CameraReading`s leave it.
- Every reading carries `source`. The UI labels anything except `camera` as demo data ("Demo verisi").
- Camera positions, slot counts and level thresholds are placeholders, marked as such where they appear.
- UI text is Turkish; code, comments and commits are English. Commits never mention Claude or AI assistance; identity `mustafacocgun`.
- Each task's tests are named in the task; Python runs with `pytest` from `services/vision`, TypeScript with `npm test -w <workspace>`.

## Review Focus

1. **A phone cannot reach `localhost`.** `EXPO_PUBLIC_API_URL` must be the dev machine's LAN address. Pinned by `apiUrlProblem` tests (Task 7); the mobile app shows a warning banner.
2. **The LLM key leaks.** Pinned by `assistant never returns the API key` (Task 6). The key exists only in the API's env.
3. **A dead camera is shown as live.** Pinned by `marks a camera stale after STALE_AFTER_MS` (Task 5) and the `isStale` tests (Task 7).
4. **Two Reacts in the monorepo** (Next and Expo). Pinned by the Task 8 check: `npm ls react` shows a single 19.3.0.
5. **The assistant invents numbers.** Pinned by `context carries exact free-slot numbers` and `fallback quotes the live numbers` (Task 6). The model's own faithfulness is checked by `scripts/assistant-eval.mjs` with 5 Turkish questions, run with the real key.

---

### Task 1: Monorepo foundation, rules and docs

**Files:** Create root `package.json` (workspaces `packages/*`, `services/api`, `apps/*`; `overrides`; `engines.node >=22`), `.gitignore`, `.editorconfig`, `.nvmrc` (22), `.prettierrc.json`, `README.md`, `CLAUDE.md` (built on campus-life's §0–§7 rules, adapted), `docs/decisions.md`, `docs/data-sources.md`, `.github/CODEOWNERS`, `.github/pull_request_template.md`.

- [ ] **Step 1:** Write the files. `.gitignore` covers `node_modules`, `.env*` except `.env.example`, `.next`, `.expo`, `dist`, `__pycache__`, `.venv`, `services/vision/videos/`, `services/vision/models/*` (keeping `.gitkeep`), and `*.pt`.
- [ ] **Step 2: Verify:** `npm install` exits 0; `git check-ignore -q .env services/vision/videos/a.mp4 services/vision/models/yolo11n.pt` exits 0.
- [ ] **Step 3: Commit:** `chore: monorepo foundation, rules and architecture docs`.

### Task 2: `packages/contracts`

**Files:** `packages/contracts/{package.json,tsconfig.json,src/index.ts,scripts/write-schemas.mjs,schemas/*.json,test/contracts.test.ts}`.

**Interfaces (produces):**

- zod values with same-named types: `CameraKind` (`crowd|parking|traffic`), `Level` (`low|medium|high`), `ReadingSource` (`simulated|demo-footage|camera`), `Camera`, `ParkingState {total, free}`, `CameraReading`, `ReadingBatch {readings: 1..100}`, `LiveCamera` (`Camera` + `reading: CameraReading | null` + `stale: boolean`), `AssistantRequest {message: trimmed 1..500}`, `AssistantResponse {answer, via: "llm"|"fallback"}`.
- `CameraReading` rules: `parking` is present exactly when `kind === "parking"`; `free <= total`; `count` is a non-negative integer; `measuredAt` is an ISO datetime.
- `SOCKET_EVENTS = { reading: "reading" } as const`.
- `schemas/camera-reading.schema.json` and `schemas/reading-batch.schema.json`, written by `npm run schemas -w @campus-live/contracts` with `z.toJSONSchema`.

- [ ] **Step 1: Failing tests:**
  - `accepts a crowd reading`
  - `rejects parking data on a crowd camera`
  - `rejects a parking reading without parking data`
  - `rejects free > total`
  - `rejects a negative count`
  - `rejects a non-ISO measuredAt`
  - `trims assistant messages and rejects empty or over-500`
  - `committed JSON Schemas match the zod schemas`: regenerate in memory and compare with `schemas/*.json`.
- [ ] **Step 2: Run:** `npm test -w @campus-live/contracts` fails (module missing).
- [ ] **Step 3: Implement**, build, and write the schemas.
- [ ] **Step 4: Run:** all pass; `npm run build -w @campus-live/contracts` exits 0.
- [ ] **Step 5: Commit:** `feat(contracts): camera, reading and assistant schemas with JSON Schema output`.

### Task 3: Vision core: settings, camera config, analyzers, simulated readings

**Files:** `services/vision/{pyproject.toml,configs/cameras.example.yaml,src/vision/{__init__,config,contracts,cameras,simulated}.py,src/vision/analyzers/{__init__,levels,crowd}.py,tests/...}`.

**Interfaces (produces):**

- `Settings` (env prefix `VISION_`): `api_url="http://localhost:4000"`, `ingest_token=""`, `cameras_file="configs/cameras.yaml"`, `detector: Literal["simulated","yolo"]="simulated"`, `publish_interval_s=2.0`, `port=8001`.
- `CameraReading` (pydantic, camelCase aliases, the same rules as the zod schema), with `to_json() -> dict` (`by_alias`, `exclude_none`, ISO UTC).
- `CameraConfig`: `id`, `kind`, `source: str | None`, `sample_fps=2.0`, `zone: list[tuple[float, float]] | None` (fractions of the frame), `thresholds: Thresholds(medium:int, high:int)`, `simulated_total=20` (parking). `load_cameras(path) -> list[CameraConfig]`.
- `level_for_count(count, thresholds) -> Level`. `level_for_parking(free, total) -> Level`: high below 10 % free, medium below 30 %, otherwise low.
- `CrowdAnalyzer(camera)` with `update(detections: sv.Detections, frame_size: tuple[int, int], now: datetime, source: ReadingSource) -> CameraReading`: counts people whose bottom-centre is inside the zone (all people when no zone) and reports the median of the last 5 counts.
- `SimulatedCamera(camera, seed)` with `next_reading(now) -> CameraReading`: a bounded random walk per kind, `source="simulated"`.

- [ ] **Step 1: Failing tests:**
  - `test_counts_people_inside_zone` (3 boxes, 2 feet inside → 2)
  - `test_counts_everyone_without_zone`
  - `test_median_hides_one_missed_frame` ([5,5,0,5,5] → 5)
  - `test_level_boundaries` (count == medium → medium)
  - `test_parking_levels` (2/40 → high, 10/40 → medium, 20/40 → low)
  - `test_simulated_stays_in_bounds` (1000 steps; free ≤ total)
  - `test_simulated_is_deterministic_per_seed`
  - `test_readings_match_contract_schema` (crowd and parking readings validate against `packages/contracts/schemas/camera-reading.schema.json`)
  - `test_model_rejects_parking_on_crowd`
  - `test_example_config_loads`
- [ ] **Step 2: Run:** `pytest` fails (package missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run:** `pytest` passes.
- [ ] **Step 5: Commit:** `feat(vision): camera config, crowd analyzer, levels and simulated readings`.

### Task 4: Vision runtime: worker, detector, publisher, service

**Files:** `services/vision/src/vision/{detector,worker,publisher,service,__main__}.py`, `services/vision/tests/...`.

**Interfaces:**

- Consumes everything from Task 3.
- `YoloDetector(classes: list[int])` is callable `(frame) -> sv.Detections`. It sets `YOLO_OFFLINE=true` before importing Ultralytics, and its weights live in git-ignored `models/yolo11n.pt`. Constants: `PERSON = [0]`, `VEHICLES = [1, 2, 3, 5, 7]`.
- `CameraWorker(camera, detector_factory, analyzer, *, loop=True, realtime=True)`:
  - It reads the video source and samples frames at `sample_fps` (skipped frames are only `grab()`bed), then runs detector → analyzer.
  - `latest(now) -> CameraReading | None` returns None before the first reading, after an error, or once the reading is older than 10 s.
  - It also has `start()`, `stop()` and `status() -> dict` (fps, last reading time, error). The loop rewind and the error handling are ported from campus-life `counter_worker.py`.
- `SimulatedWorker(camera, seed)` has the same `latest` / `start` / `stop` / `status`.
- `Publisher(api_url, token, workers)`: `publish_once() -> bool` POSTs `{readings}` for readings newer than the last publish, and returns False on any HTTP or network error without raising. `run(interval)` loops.
- `vision.service.app` (FastAPI): `GET /health` and `GET /status`. The lifespan builds workers from `Settings` + `load_cameras` (`detector=simulated` → `SimulatedWorker`) and starts the publisher.
- `python -m vision` runs it with uvicorn.

- [ ] **Step 1: Failing tests:**
  - `test_worker_reads_crowd_from_clip` (synthetic clip + fake detector)
  - `test_worker_samples_frames` (a 30-frame clip at 30 fps with `sample_fps=5` runs the detector on 5 frames)
  - `test_worker_loops_clip`
  - `test_missing_source_is_reported`
  - `test_detector_load_failure_is_reported`
  - `test_reading_goes_stale`
  - `test_publisher_sends_batch_with_token` (stub HTTP server)
  - `test_publisher_survives_api_down`
  - `test_publisher_skips_when_nothing_new`
  - `test_status_lists_cameras_without_frames`
  - `test_detector_turns_off_ultralytics_analytics`
  - `test_weights_path_is_git_ignored`
  - `test_simulated_service_starts_without_opencv`
- [ ] **Step 2: Run:** fails. **Step 3: Implement.** **Step 4: Run:** `pytest` passes. Then live: `VISION_DETECTOR=simulated python -m vision` and `curl :8001/status` lists the example cameras.
- [ ] **Step 5: Commit:** `feat(vision): camera workers, YOLO detector, publisher and status service`.

### Task 5: API core: registry, live state, ingest, Socket.IO

**Files:** `services/api/{package.json,tsconfig.json,.env.example,config/cameras.json,src/{index,app}.ts,src/config/env.ts,src/lib/http.ts,src/middleware/{error-handler,require-service-token}.ts,src/modules/{health,cameras,live}/...,test/*.test.ts}`, `services/vision/tests/test_registry_ids.py`.

**Interfaces:**

- Consumes `@campus-live/contracts`.
- `env` (zod): `PORT=4000`, `CORS_ORIGINS`, `VISION_INGEST_TOKEN` (at least 16 characters), `STALE_AFTER_MS=15000`, plus the optional `LLM_*` from Task 6.
- `loadRegistry(path) -> CameraRegistry` with `list(): Camera[]` and `get(id)`.
- `LiveStore` with:
  - `upsert(reading)`
  - `snapshot(now: Date): LiveCamera[]` (in registry order; `stale` when there is no reading or it is older than `STALE_AFTER_MS`)
  - `onReading(listener)`
- `createApp({ registry, store, env })`. Routes:
  - `GET /api/health`
  - `GET /api/cameras` returns `ok(LiveCamera[])`.
  - `POST /internal/readings` takes a Bearer token and a `ReadingBatch`. It returns 202 `{accepted}`, 401 for a missing or wrong token, 400 `VALIDATION_ERROR`, or 422 `UNKNOWN_CAMERA` for an unknown id or a kind mismatch.
- `attachLiveSocket(httpServer, store, corsOrigins)` emits `SOCKET_EVENTS.reading` on every upsert.

- [ ] **Step 1: Failing tests** (real HTTP on port 0 with `fetch`, and `socket.io-client`):
  - `rejects ingest without a token`
  - `rejects ingest with a wrong token`
  - `rejects an invalid batch with 400`
  - `rejects an unknown camera with 422`
  - `rejects a kind mismatch with 422`
  - `serves an ingested reading on GET /api/cameras`
  - `marks a camera stale after STALE_AFTER_MS`
  - `broadcasts readings over Socket.IO`
  - Python: `test_vision_camera_ids_exist_in_api_registry` (same id and kind)
- [ ] **Step 2: Run:** fails. **Step 3: Implement.** **Step 4: Run:** both suites pass. Then live: the API plus `python -m vision` (simulated), and `curl :4000/api/cameras` shows fresh readings for every camera.
- [ ] **Step 5: Commit:** `feat(api): camera registry, live state, vision ingest and Socket.IO broadcast`.

### Task 6: The assistant

**Files:** `services/api/src/modules/assistant/{llm-client,live-context,fallback-answer,rate-limit,assistant.routes}.ts`, `services/api/test/assistant.test.ts`, `scripts/assistant-eval.mjs`.

**Interfaces:**

- `createLlmClient({ baseUrl, apiKey, model, timeoutMs })` with `complete(messages): Promise<string>`. It POSTs `{baseUrl}/chat/completions` (temperature 0.2, max 300 tokens) and throws `LlmError` on a non-2xx answer, a timeout or a malformed body. The error message never includes headers or the key.
- `buildLiveContext(cameras, now) -> string`: one Turkish line per camera, for example `- Otopark A (Otoparklar): 12/40 boş, seviye Orta, 4 sn önce, demo verisi`, or `veri yok` when stale. `SYSTEM_PROMPT` holds the Turkish grounding rules from the architecture doc.
- `fallbackAnswer(question, cameras, now) -> string`: keyword intent (parking, crowd, traffic, or a general summary). Stale cameras are reported as having no current data.
- `answerQuestion(question, { llm | null, store, now }) -> AssistantResponse`: the LLM when configured, otherwise the fallback.
- `POST /api/assistant/chat` takes `AssistantRequest` and returns `ok(AssistantResponse)`; the 11th request within a minute from one IP gets 429.
- Env: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TIMEOUT_MS=8000`. With no key, there is no LLM client.

- [ ] **Step 1: Failing tests** (stub LLM = a local HTTP server):
  - `context carries exact free-slot numbers`
  - `uses the LLM answer when it responds`
  - `falls back when the LLM returns 500`
  - `falls back when the LLM times out`
  - `never calls the LLM without a key`
  - `fallback quotes the live numbers`
  - `stale cameras are not reported as current`
  - `assistant never returns the API key`
  - `limits a client to 10 questions per minute`
- [ ] **Step 2: Run:** fails. **Step 3: Implement.** **Step 4: Run:** passes.
- [ ] **Step 5:** `scripts/assistant-eval.mjs` asks 5 Turkish questions against a running stack and prints each answer with the snapshot, so a person checks the numbers. The user runs it with the real key.
- [ ] **Step 6: Commit:** `feat(api): grounded campus assistant with LLM and rule-based fallback`.

### Task 7: `packages/client` and the web app

**Files:** `packages/client/{package.json,src/index.ts,test/client.test.ts}`; `apps/web` (create-next-app: TypeScript, App Router, `src/`) with `src/components/{LiveMap,CameraList,AssistantPanel}.tsx`, `src/app/page.tsx` and `.env.example`.

**Interfaces (`@campus-live/client`, used by web and mobile):**

- `fetchCameras(apiUrl) -> LiveCamera[]`
- `connectLive(apiUrl, onReading) -> () => void`
- `mergeReading(cameras, reading) -> LiveCamera[]`
- `isStale(reading, now, staleAfterMs)`
- `askAssistant(apiUrl, message) -> AssistantResponse`
- `LEVEL_LABEL_TR` (Az / Orta / Yoğun), `LEVEL_COLOR` (low #16a34a, medium #f59e0b, high #dc2626, stale #9ca3af)
- `isDemo(reading)`
- `apiUrlProblem(url, platform) -> string | null`: flags `localhost` or `127.0.0.1` when the platform is not web.

**Web:**

- `LiveMap`: react-leaflet + OSM tiles with attribution, loaded client-only, one colored circle per camera, and a popup with the numbers and a "Demo verisi" badge.
- `CameraList`: grouped by section.
- `AssistantPanel`.
- `NEXT_PUBLIC_API_URL`.

- [ ] **Step 1: Failing tests (client):**
  - `mergeReading replaces only the matching camera`
  - `isStale after staleAfterMs`
  - `labels levels in Turkish`
  - `isDemo for every source but camera`
  - `apiUrlProblem flags localhost on a phone`
- [ ] **Step 2: Run:** fails. **Step 3: Implement** the client and the web app.
- [ ] **Step 4: Run:** client tests pass; `npm run build -w web` exits 0. Live: with api + vision (simulated) + `npm run dev -w web`, `curl :3000` returns 200. **Opening the map in a browser is the user's check.**
- [ ] **Step 5: Commit:** `feat(web): shared live client and the live campus map with the assistant`.

### Task 8: Mobile app

**Files:** `apps/mobile` (create-expo-app, SDK 58, expo-router) with `app/(tabs)/{index,assistant}.tsx` and `.env.example` (`EXPO_PUBLIC_API_URL=http://<LAN IP>:4000`).

**Interfaces:**

- Consumes `@campus-live/client`.
- The **Harita** tab: `react-native-maps` with a colored marker per camera, plus the banner from `apiUrlProblem`.
- The **Asistan** tab: chat.

- [ ] **Step 1:** Scaffold and build both screens.
- [ ] **Step 2: Verify:**
  - `npx tsc --noEmit` exits 0.
  - `npx expo-doctor` reports no SDK mismatch.
  - `npx expo export --platform android` bundles, which shows that Metro resolves the workspace packages.
  - `npm ls react` shows a single `react@19.3.0`.
  - **Running it on a phone in Expo Go is the user's check.**
- [ ] **Step 3: Commit:** `feat(mobile): live map and assistant screens`.

### Task 9: Dev scripts, CI, an end-to-end smoke test, push

**Files:** root `package.json` scripts (`dev` runs api + web + simulated vision through `concurrently`; `dev:mobile`; `typecheck`; `test`), `scripts/e2e-smoke.mjs`, `.github/workflows/ci.yml`, and the final `README.md` quickstart.

- [ ] **Step 1:** `scripts/e2e-smoke.mjs` starts the API and simulated vision. It waits until `GET /api/cameras` has a fresh reading for every camera, then asks the assistant "Otoparkta boş yer var mı?" (fallback, no key) and expects the parking camera's free count in the answer. Run it: it passes.
- [ ] **Step 2:** CI on push and PR:
  - Node: `npm ci`, build contracts, check that the schemas are up to date with `git diff --exit-code`, typecheck, tests.
  - Python: `pip install -e services/vision[dev]`, `ruff check`, `pytest`.
- [ ] **Step 3:** `git push -u origin main` (approved by the user), then `gh run watch` until CI is green.
- [ ] **Step 4: Commit** (before the push): `chore: dev scripts, CI and end-to-end smoke test`.
