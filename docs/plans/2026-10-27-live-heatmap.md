# Live Crowd Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the random demo with real YOLO counts from camera videos, projected through each virtual camera's position and direction onto the campus map, and shown as a live heat cloud on web and mobile.

**Architecture:**

- Each of 12 virtual cameras (placed from OpenStreetMap data) plays a video. YOLO finds people, and their feet are projected into the camera's view cone on the map through a homography built from position, heading, view angle and range.
- The vision service bins the projected feet into a global 3 m grid and sends only per-cell weights (no individual positions or paths).
- Web (MapLibre GL) and mobile (MapLibre React Native) merge the cells of fresh cameras and draw a heatmap that glides between updates, plus each camera's view cone.

**Tech Stack:** MapLibre GL JS 6.16, @maplibre/maplibre-react-native 11.5 (Expo dev build), OpenCV homography, Ultralytics YOLO11n, existing contracts/API/client.

**Spec:** the Design section below, merged into `docs/architecture.md` in Task 1. Plan approved with **dataset calibration**, and **WILDTRACK** chosen as the footage core (2026-10-27). Team decisions of 2026-10-27, second round:

- MapLibre GL on the web;
- **live YOLO only** (each teammate runs it on their own GPU PC; random data is removed from the app);
- I propose about 12 camera spots;
- MapLibre React Native on mobile.

## Design

- **Camera pose** (`config/cameras.json`, shared by the API and vision): `latitude`, `longitude`, `heading` (degrees clockwise from north, where the camera looks), `fovDeg` (horizontal view angle), `rangeM` (far edge of the view). The near edge is 2 m.
- **Projection:** the image's bottom corners map to the near arc's ends and its top corners to the far arc's ends: left edge = `heading − fov/2`, right edge = `heading + fov/2`, in local east/north metres around the camera. `cv2.getPerspectiveTransform` gives the image→ground homography. A person's feet (box bottom-centre) map to metres, then to lat/lng (`lat = lat0 + north/111320`, `lng = lng0 + east/(111320·cos lat0)`). Accurate calibration (4 clicked point pairs) is a later option.
- **Density:**
  - A global grid of 3 m cells anchored at the campus origin (40.7420, 30.3320), so cells from different cameras align.
  - Per camera, feet are binned per sampled frame, and each cell's weight is smoothed (EMA, α = 0.3). Cells under 0.05 are dropped.
  - Sent as `cells: [{lat, lng, weight}]` on crowd readings (cell centres).
  - Clients merge by cell, taking the **max** weight across overlapping fresh cameras.
- **Rates:** crowd cameras sample 5 frames/s; the publisher pushes every 0.5 s. Clients animate weights over 500 ms (linear interpolation), so the cloud flows instead of jumping.
- **Data source:** live YOLO only. The `test-boxes` detector (white rectangles in synthetic clips; real footage gives no people) exists for automated tests only.
- **Privacy:** only aggregated per-cell weights leave vision: no IDs, tracks, positions of individuals, or frames (CLAUDE.md §0.2).
- **Honesty:** a small "Demo görüntüsü" label stays while the footage is not from real campus cameras (§0.5, §4.4).
- **Dataset calibration (approved addition):** a camera may carry the real calibration of its source footage instead of the estimated pose. This is an OpenCV pinhole model: intrinsics `K` + distortion, extrinsics `rvec`/`tvec` for a ground plane at Z = 0, the world unit, and a **map anchor** (the lat/lng of the dataset's world origin plus a rotation).
  - Foot points are undistorted (`cv2.undistortPoints`), mapped to the ground through the inverse of `H = K·[r1 r2 t]`, scaled to metres, then rotated and offset onto the map.
  - The view cone drawn on the map comes from the calibration too (the image's bottom and top corners projected).
- **Footage core:** WILDTRACK (EPFL; 7 overlapping, calibrated HD cameras over one plaza; research and evaluation license). It is placed at one campus plaza, so its 7 views overlap on the map and a crowd crossing the plaza moves from view to view. Stock clips (Pexels, Pixabay, Mixkit, Coverr; one license line per clip) fill other spots. Spots without a local video stay grey ("Görüntü yok").
  - Dataset files and videos are never committed: they live in git-ignored `services/vision/datasets/` and `videos/`.
- **Scope:** all cameras are crowd cameras. Parking and traffic cameras return with their analyzers (order: crowd → parking → traffic). Until then the assistant answers "Bu konuda verim yok" for them.

## Global Constraints

- **Kürşat's PR #18 restyle stays:** theme tokens, dashboard layout, legend overlay, fit-all-cameras. Re-read `apps/web` (pull first) before Task 7, and port his map styling to MapLibre instead of replacing it.
- **Packages:** only the approved new ones (`maplibre-gl`, `@maplibre/maplibre-react-native`). Leaflet, react-leaflet and react-native-maps are removed. Anything else gets asked first (§0.6).
- **Basemap:** OpenFreeMap is used only after its terms of use are read on its own site (§5.4). Otherwise MapLibre with OSM raster tiles. The heatmap colors are never inverted: use a real dark style, or keep the light basemap.
- **Placeholders:** camera positions and directions are placeholders derived from OpenStreetMap (© OSM contributors, ODbL), marked as such. Thresholds are guesses (§0.5, §3.6).
- **Contract changes:** contracts, the Python mirror, API, client, web and mobile in the same commit (§2.8).
- **No regressions from earlier PRs:**
  - live re-sync on reconnect (#3);
  - receive-time staleness (#5);
  - the fallback assistant's place matching (#4);
  - the venv launcher (#6).
- **Commits:** one logical change each; no attribution (§0.8); one PR at the end for the team.

## Review Focus

1. **The projection points the wrong way** (heading convention, left/right swapped). Pinned by `test_feet_at_bottom_centre_land_at_near_distance_along_heading` and `test_left_edge_is_heading_minus_half_fov` (Task 3).
2. **Overlapping cameras double-count a crowd.** Pinned by `merges overlapping cells by max weight` (Task 6).
3. **A dead camera's heat stays on the map.** Pinned by `excludes cells from stale cameras` (Task 6).
4. **Detection fails and the map is just empty, with no explanation.** Cameras turn grey with "Görüntü yok" and `/status` shows the error. Pinned by `cameras without readings have no cells and are stale` (Task 6) plus the live check in Task 7.
5. **Per-person data leaks out of vision.** Pinned by `test_two_people_in_one_cell_make_one_cell_of_weight_two` and `test_reading_carries_only_contract_fields` (Task 3/4).

---

### Task 1: Decisions, rules and architecture

**Files:**

- `docs/architecture.md`: the Design section above; replaces the simulated mode and the dots.
- `CLAUDE.md`:
  - §3.1 pipeline: add projection → cells;
  - §3.4: "Live YOLO is the only data source in the app; the test-boxes detector is for automated tests only";
  - §6 stack: MapLibre GL / MapLibre React Native (dev build); live state includes cells.
- `docs/decisions.md`: D13 MapLibre GL, D14 live YOLO only (supersedes the simulated default), D15 MapLibre RN with a dev build, D16 per-cell density for privacy, D17 cameras placed from OSM as placeholders.
- `docs/data-sources.md`: the licensed-footage shortlist from the research (when it reports).

- [ ] **Step 1:** Write the changes. **Check:** `prettier --check`; `grep -n "Simulated mode is the default" CLAUDE.md` prints nothing.
- [ ] **Step 2: Commit:** `docs: live heatmap design, rules and decisions`.

### Task 2: Contracts, shared camera config and pose

**Files:**

- `packages/contracts/src/index.ts`
- `packages/contracts/schemas/*` (regenerated)
- `services/vision/src/vision/contracts.py`
- `config/cameras.json` (new, repo root)
- `services/api/config/cameras.json` (removed)
- the API registry loader
- `services/vision` config and loader
- the tests named below

**Interfaces (produces):**

- Vision config, per camera: optional `calibration: {intrinsics_file | K + dist, rvec, tvec, world_unit_m, anchor: {lat, lng, rotation_deg}}`. For WILDTRACK, a loader reads the dataset's own calibration XML files from `services/vision/datasets/wildtrack/`.
- **Camera** gains:
  - `heading: number` (0 ≤ h < 360)
  - `fovDeg: number` (10–170)
  - `rangeM: number` (5–150)
- **New type:** `DensityCell = {lat, lng, weight: number ≥ 0}`.
- **CameraReading:** `cells?: DensityCell[]` (≤ 2000), present only on crowd readings (enforced by `superRefine`). The pydantic mirror matches.
- **The shared camera file** `config/cameras.json` holds 12 crowd cameras: id, name, section, pose. The API resolves it from the repo root, and `loadRegistry` takes the path. Vision reads pose by id; its YAML keeps processing fields only (`source`, `sample_fps`, `zone`, `thresholds`).
- **The spots (OSM-derived):** the 7 WILDTRACK views around one campus plaza (anchor placed from OSM), plus these stock-clip spots: library, library walkway, student dining hall, dining-hall walkway, Merkez Kantin, Taş Kafe, Kantin, Rektörlük, Mühendislik, Bilişim, Fen-Edebiyat, Kongre Merkezi. Each sits about 20 m from its target and faces it. Nothing is placed on the other university's buildings (SUBÜ).
- **API tests** use their own fixture registry (`services/api/test/fixtures/cameras.json`), so the demo config can change freely.

- [ ] **Step 1: Failing tests:**
  - contracts: `accepts cells on a crowd reading`, `rejects cells on a parking reading`, `rejects a negative cell weight`, `rejects a heading of 360`, and the schemas-up-to-date test.
  - vision: `test_reading_with_cells_matches_contract_schema`, `test_shared_config_has_pose_for_every_vision_camera`.
  - API: `loads the shared registry with poses`.
- [ ] **Step 2: Run:** fails. **Step 3: Implement.** **Step 4: Run:** all suites green.
- [ ] **Step 5: Commit:** `feat(contracts): camera pose, density cells and the shared camera config`.

### Task 3: Projection and density (pure functions)

**Files:** `services/vision/src/vision/projection.py`, `services/vision/src/vision/calibration.py` (OpenCV pinhole + the WILDTRACK XML loader), `services/vision/src/vision/density.py`, tests.

**Interfaces:**

- `CameraPose(lat, lng, heading, fov_deg, range_m, near_m=2.0)`
- `ground_homography(pose, frame_size) -> np.ndarray` (3×3)
- `project_feet(boxes_xyxy, homography, pose) -> list[tuple[float, float]]` (lat, lng)
- `DensityGrid(origin=(40.7420, 30.3320), cell_m=3.0, alpha=0.3, floor=0.05)` with `update(points) -> list[DensityCell]` (EMA per cell)
- `cell_center(lat, lng) -> (lat, lng)`
- `CalibratedProjection(K, dist, rvec, tvec, world_unit_m, anchor)` with `project(points_px) -> list[(lat, lng)]` and `cone(frame_size) -> list[(lat, lng)]`
- `load_wildtrack_calibration(dir, camera_index) -> (K, dist, rvec, tvec)`

- [ ] **Step 1: Failing tests** (hand-derived values; 100×100 frame, near 2, range 40, fov 60):
  - `test_feet_at_bottom_centre_land_at_near_distance_along_heading`: heading 0 gives about 2 m north; heading 90 gives about 2 m east.
  - `test_top_centre_lands_at_range`: about 40 m along the heading.
  - `test_left_edge_is_heading_minus_half_fov`: the bottom-left corner lands at bearing −30°.
  - `test_two_people_in_one_cell_make_one_cell_of_weight_two`
  - `test_cells_from_two_cameras_share_centres`
  - `test_weight_decays_when_people_leave`
  - `test_tiny_weights_are_dropped`
  - `test_calibrated_round_trip`: a synthetic camera with known `K`, `R`, `t` and distortion. Ground points projected to the image with `cv2.projectPoints` come back to the same ground points within 1 cm.
  - `test_anchor_rotation_moves_points_on_the_map`
  - `test_wildtrack_xml_loader_reads_opencv_storage`, against a synthetic XML in the same format (the real files are never committed).
- [ ] **Step 2: Run:** fails. **Step 3: Implement.** **Step 4: Run:** passes. Mutants: swap left/right, ignore the heading.
- [ ] **Step 5: Commit:** `feat(vision): project people onto the map and bin them into a density grid`.

### Task 4: Vision runtime: live YOLO only, cells on readings

**Files:** `analyzers/crowd.py`, `service.py`, `config.py`, `detector.py`, `publisher.py`, `worker*.py`. Delete `simulated.py` and its tests. New: `services/vision/tools/make_test_clips.py`, which writes one synthetic clip per camera (white boxes walking across the frame) plus a matching camera YAML, for the `test-boxes` detector in Task 7's live check and Task 9's e2e test.

**Interfaces:**

- `CrowdAnalyzer(camera, pose, grid)` returns a reading with `count` (median, as now) and `cells`.
- `Settings.detector: Literal["yolo", "test-boxes"] = "yolo"` and `publish_interval_s = 0.5`; crowd `sample_fps` defaults to 5.
- `YoloDetector` downloads the weights once under a lock, then each worker loads its own model (thread safety; fixes #10).
- The publisher loop catches and logs every exception (fixes #9).

- [ ] **Step 1: Failing tests:**
  - `test_crowd_reading_has_cells_inside_the_cone`
  - `test_reading_carries_only_contract_fields`
  - `test_service_defaults_to_yolo`
  - `test_test_boxes_detector_finds_white_rectangles_only`
  - `test_weights_download_once_for_many_workers`
  - `test_publisher_survives_unexpected_errors`
- [ ] **Step 2: Run:** fails. **Step 3: Implement.** **Step 4: Run:** `pytest` and ruff are green.
- [ ] **Step 5: Commit:** `feat(vision): live YOLO only, with density cells on crowd readings (fixes #9, fixes #10)`.

### Task 5: API: shared registry, cells through, assistant

**Files:**

- `services/api/src/modules/cameras/camera-registry.ts`
- `config/env.ts` (`CAMERAS_FILE` defaults to the repo-root file)
- the assistant: the crowd fallback mentions the busiest camera
- `test/fixtures/cameras.json`
- tests

- [ ] **Step 1: Failing tests:**
  - `accepts crowd readings with cells and serves them`
  - `rejects cells on a non-crowd camera`
  - `the fallback names the busiest crowd camera for a general crowd question`
  - existing tests moved to the fixture registry.
- [ ] **Step 2: Run:** fails. **Step 3: Implement.** **Step 4: Run:** green.
- [ ] **Step 5: Commit:** `feat(api): shared camera registry and density cells`.

### Task 6: Client: merged heat, cones, glide

**Files:** `packages/client/src/index.ts`, tests.

**Interfaces:**

- `mergeCells(cameras: LiveCamera[]) -> DensityCell[]`: fresh cameras only, max weight per cell.
- `cameraCone(camera, steps = 12) -> [lng, lat][]`: a closed polygon from the pose.
- `lerpCells(from, to, t) -> DensityCell[]`: cells that appear fade in and cells that vanish fade out.
- `LiveState` gains `cells`.

- [ ] **Step 1: Failing tests:**
  - `merges overlapping cells by max weight`
  - `excludes cells from stale cameras`
  - `cameras without readings have no cells and are stale`
  - `cone of a north-facing camera opens northwards`
  - `lerp halfway averages weights and fades new cells in`
- [ ] **Step 2: Run:** fails. **Step 3: Implement.** **Step 4: Run:** green.
- [ ] **Step 5: Commit:** `feat(client): merged density cells, camera cones and smooth transitions`.

### Task 7: Web: MapLibre heat cloud

**Files:**

- `apps/web/src/components/LiveMap.tsx`, rewritten with `maplibre-gl`;
- `globals.css`: MapLibre controls, popups and labels on Kürşat's tokens; dark mode without inverting the heat;
- `LiveDashboard.tsx`: the legend becomes a heat ramp plus the camera states;
- `package.json`: drop leaflet and react-leaflet, add maplibre-gl.

**The map's layers:**

- **heatmap:** cell points weighted by `weight`, a transparent→blue→green→yellow→red ramp, radius by zoom;
- **cones:** a fill at about 8% plus an outline;
- **cameras:** circles colored by level, grey when stale;
- **labels:** camera names.

The map fits the bounds of all cameras (Kürşat's behavior). The demo banner stays, reading "Demo görüntüsü" while the footage is not from campus cameras. Each socket update animates over 500 ms through `lerpCells` and `requestAnimationFrame`.

- [ ] **Step 1:** Verify OpenFreeMap's terms on its site, and pick the basemap and dark style (ruling in the ledger).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Check:**
  - typecheck, lint and `next build` pass.
  - Live: the API plus vision with `test-boxes` on the clips from `tools/make_test_clips.py` (Task 4). A headless Firefox screenshot shows the heat cloud inside the cones and the cameras.
  - A second screenshot taken 2 s later shows the cloud moved.
- [ ] **Step 4: Commit:** `feat(web): live crowd heat cloud on MapLibre`.

### Task 8: Mobile: MapLibre React Native

**Files:**

- `apps/mobile/app.json` (the MapLibre plugin)
- `package.json` (remove react-native-maps; add @maplibre/maplibre-react-native)
- `src/app/index.tsx`
- `README.md`: the development build, through EAS Build or Android Studio, because Expo Go cannot load MapLibre

**Screen:** the same layers as the web, from the client helpers, using MapLibre RN's `ShapeSource`, `HeatmapLayer`, `FillLayer`, `CircleLayer` and `SymbolLayer`. The legend and the localhost banner stay.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Check:**
  - `tsc` and `expo-doctor` pass;
  - `npx expo prebuild --platform android --no-install` generates the project with the plugin applied, then the generated folder is deleted (it is git-ignored);
  - `npx expo export --platform android` bundles;
  - `npm ls react` shows a single version.
  - **A phone check with a development build is the team's.**
- [ ] **Step 3: Commit:** `feat(mobile): live crowd heat cloud on MapLibre React Native`.

### Task 9: End-to-end, CI, docs

**Files:**

- `scripts/e2e-smoke.mjs`: the vision service with `test-boxes` on generated synthetic clips; asserts every camera is fresh and has cells inside its cone, and that the assistant answers a crowd question.
- `.github/workflows/ci.yml`: a new job, `yolo-smoke`: CPU torch, then `pip install -e services/vision[yolo]`, then the **real** YoloDetector on Ultralytics' bundled `bus.jpg`, asserting at least 3 people.
- `README.md` and `services/vision/README.md`: how to add a camera (clip and license line, `source`, pose).

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Check:** `npm run e2e` passes locally, and fails when the projection is broken (mutant). CI is all green after the push.
- [ ] **Step 3: Commit:** `chore: heatmap end-to-end test, real-YOLO CI job and camera guide`. Then a PR for the team.
