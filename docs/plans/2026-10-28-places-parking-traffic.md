# Places, Parking and Traffic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cameras everywhere on campus, including inside faculties, without ever showing where they are: the map shows only the crowd's heat, buildings lit by their indoor crowd, parking lots with free slots and roads colored by traffic, on a colorful 3D map.

**Team decisions (2026-10-28):**

- Camera locations are never shown, because someone could misuse them.
- Indoor cameras: the whole building lights up.
- Next to the heat: places, parking lots, roads.
- Parking: slots outlined per camera.
- The map: colorful, and 3D if it stays fast.
- Footage: WILDTRACK cut into 5-minute clips, looped, assigned at random to the cameras.

## Design

**Privacy is enforced by the API, not the page.** The public API and Socket.IO carry only places and the merged heat, never a camera id, position, direction or per-camera cells. Camera positions stay in `config/cameras.json`, which the API and vision read and nobody else is served. Residual risk: over hours, where heat appears outlines what cameras cover. Coarser or thresholded cells reduce it (#24, the team's call).

**Places** (`config/places.json`, from OpenStreetMap, © OSM contributors, ODbL) are what users see:

| Kind       | Geometry        | Fed by                                      | Shown as                                |
| ---------- | --------------- | ------------------------------------------- | --------------------------------------- |
| `area`     | a label point   | outdoor crowd cameras (cells + count)       | heat cloud + list entry                 |
| `building` | OSM footprint   | indoor crowd cameras (count only, no cells) | the 3D building colored by its crowd    |
| `parking`  | OSM lot polygon | parking cameras (slots)                     | the lot colored by free share, "12 boş" |
| `road`     | OSM road line   | traffic cameras (vehicles in view)          | the road colored by traffic level       |

**Cameras** (`config/cameras.json`, private) each feed one place: `place`, `kind`, and for outdoor crowd cameras the pose (as now). Indoor cameras carry `indoor: true` and send counts only.

**Aggregation (API):**

- area count = max of its fresh cameras (views of an area may overlap);
- building count = sum (rooms and floors differ);
- parking free/total = sums (each camera has its own slots);
- road = max;
- a place's level = the highest level among its fresh cameras;
- a place with no fresh camera is stale ("Görüntü yok").
- The heat: fresh outdoor cells merged by max per cell, now on the server.

**Live updates:** `GET /api/live` and a Socket.IO `live` snapshot (places + heat) every second. The per-camera `reading` event and `GET /api/cameras` are removed. Clients keep the glide.

**Vision:**

- crowd cameras: outdoor (cells, as now) or indoor (count only);
- parking: YOLO vehicle classes, a slot is taken when a vehicle's footprint covers most of it, smoothed per slot;
- traffic: vehicles in the road zone, median, level by thresholds.

New tools:

- `tools/draw_slots.py`: click each slot's corners on a frame;
- `tools/assign_clips.py`: random clip and start offset per camera, fixed seed. The 7 WILDTRACK plaza views share one clip index and offset, so they stay in sync.

The test-boxes detector reads white boxes as people and yellow boxes as cars, so test clips cover parking and traffic.

**The map (web, then mobile):**

- OpenFreeMap **Liberty**, colorful, in light and dark mode;
- its own 3D buildings from zoom 14, with monitored buildings tinted by crowd;
- a soft mask outside the campus outline;
- place names, parking lots and traffic-colored roads;
- no pins, no cones.
- Optimized: one GeoJSON source per layer, updated in place, and extrusion only from zoom 14. Pitch starts at 45°, with a 2D/3D toggle that also follows reduced-motion.

**The dashboard (İsmail's #22):**

- the camera list, detail and summary become places;
- filters by section and by kind (Kalabalık / Otopark / Trafik);
- the session chart per place.

**Assistant:** answers per place, including parking ("Otopark A: 12 boş yer") and traffic, which return with real data.

**Footage:**

- WILDTRACK clips for crowd cameras, indoors and outdoors.
- Cars need their own clips (WILDTRACK has none): licensed stock clips of parking lots and campus-like roads, one license line each, before use.
- Until then, test clips. Real campus cameras: never without written permission (CLAUDE.md §0.3).

## Global constraints

- Camera ids, positions and per-camera cells never appear in a public response, a socket event or the web/mobile bundle. A test checks the public payloads.
- Teammates' components are adapted, not restyled; tell İsmail before Task 6 (his #22 files).
- Packages: none new on web and mobile. Vision uses the OpenCV window it has.
- Every place and camera is a placeholder until the team confirms it (§0.5). Nothing is placed on SUBÜ's buildings.
- No regressions: #3 re-sync, #5 receive-time staleness, the glide, the e2e.

## Tasks

### Task 1: Decisions, rules, architecture

- D19: no camera positions in public. D20: places. D21: building glow. D22: parking slots. D23: traffic per road. D24: Liberty 3D.
- CLAUDE.md §0.2 gains: "camera positions never leave the server".
- architecture.md, data sources (car clip candidates).
- Commit: `docs: places, parking and traffic design`.

### Task 2: Contracts and the private/public split

- `Place`, `LivePlace` (level, count, parking, stale, ageMs) and `LiveSnapshot { places, cells, at }`.
- `Camera` gains `place` and `indoor`.
- Remove `LiveCamera` from the public API.
- Tests: `a snapshot schema has no camera fields`; `rejects an indoor reading with cells`.
- Commit: `feat(contracts): places and live snapshots`.

### Task 3: Places from OSM and cameras everywhere

- `tools/build_places.py` (OSM JSON in, `config/places.json` out): campus outline, SAÜ buildings, parking lots, campus roads.
  - Inside the campus outline (OSM, 2026-10-28): 180 buildings (42 named), 34 parking lots (11 with a capacity tag) and 100 road segments (named: Kampüs İçi Yolu, Üniversite Caddesi, 180., 182. and 227. Sokak).
  - Excluded: SUBÜ's buildings (inside the same outline) and any place where people live or sleep (the dormitory, the hotel). Indoor cameras go only in faculties, libraries and dining halls.
- The camera registry is generated for coverage:
  - outdoor areas;
  - 2–4 indoor cameras per faculty;
  - one camera per parking lot (two for large lots);
  - cameras on the main campus roads.
- Tests: every camera's place exists; no camera outside the campus outline; no place on SUBÜ buildings.
- Commit: `feat: campus places from OpenStreetMap and cameras everywhere`.

### Task 4: API: places, server-side heat, snapshots, assistant per place

- `LiveStore.snapshot()` aggregates per place, using the rules in Design.
- `GET /api/live` and the `live` socket event every second; the old routes and events are removed.
- The assistant's context and fallback work per place.
- Tests:
  - aggregation (max for areas, sum for buildings and parking);
  - stale places;
  - `public payloads carry no camera id or position`;
  - the fallback answers parking with free slots and traffic per road.
- Commit: `feat(api): places, server-side heat and live snapshots`.

### Task 5: Vision: indoor, parking, traffic, footage tools

- Crowd: `indoor` cameras send counts only.
- Detector classes per kind.
- `ParkingAnalyzer`: slots in frame fractions, occupancy by footprint overlap, median per slot.
- `TrafficAnalyzer`: vehicles in the zone.
- test-boxes colors; `start_s` per camera.
- Tools: `draw_slots.py`, `assign_clips.py`, and test clips with cars.
- Tests: indoor reading without cells; a slot taken only by a car covering it; traffic level from vehicles; the assignment is reproducible and keeps the plaza in sync.
- Commit: `feat(vision): indoor counts, parking slots, traffic and clip assignment`.

### Task 6: Web: colorful 3D map and the dashboard by places

- The map:
  - Liberty with 3D buildings, and the campus mask;
  - layers: heat, building tint, parking lots, traffic roads, place labels;
  - the 2D/3D toggle;
  - no pins or cones.
- The panels: places list, detail, summary and filters.
- Check: typecheck, lint, build; live screenshots (heat, a lit building, a lot with free slots, a red road, dark mode, 3D and 2D).
- Commit: `feat(web): colorful 3D campus map by places, parking and traffic`.

### Task 7: Mobile

- The same layers, from the client helpers; no dots or labels of cameras.
- Checks: tsc, expo-doctor, export.
- Commit: `feat(mobile): places, parking and traffic on the map`.

### Task 8: End-to-end, CI, docs

- e2e: parking and traffic test clips; the payload privacy check.
- READMEs: footage assignment, drawing slots.
- Commit: `chore: places end-to-end test and footage guide`.
