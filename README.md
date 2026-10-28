# Campus Live

A live campus map: how crowded each spot is, how many parking slots are free, and how busy the roads
are, counted from camera video and shown on the web and on phones. An assistant answers questions about
it in Turkish ("Otopark A'da boş yer var mı?").

There is no access to campus cameras. The cameras are **demo videos** (licensed footage or our own
recordings) placed at campus positions, and every reading is labelled as demo data. Video frames never
leave the vision service; the apps get numbers only. The map shows places (outdoor areas, buildings,
parking lots, roads) and the crowd's heat, never where a camera is. Design:
[docs/architecture.md](docs/architecture.md).

## Repository

| Folder                                     | Stack                             | Purpose                                           |
| ------------------------------------------ | --------------------------------- | ------------------------------------------------- |
| [`apps/web`](apps/web)                     | Next.js 16, MapLibre GL           | Live 3D campus map and assistant in the browser   |
| [`apps/mobile`](apps/mobile)               | Expo SDK 58 (React Native)        | Live map and assistant on phones                  |
| [`services/api`](services/api)             | Node 22, Express 5, Socket.IO     | Places, live state by place, assistant            |
| [`services/vision`](services/vision)       | Python 3.12, YOLO11n, supervision | Camera workers: video in, readings out            |
| [`packages/contracts`](packages/contracts) | zod 4                             | The shared types, plus JSON Schema for Python     |
| [`packages/client`](packages/client)       | TypeScript                        | API access and map logic shared by web and mobile |
| [`docs`](docs)                             | Markdown                          | Architecture, decisions, data sources, plans      |

## Requirements

- Node.js 22 and npm
- Python 3.12 (vision service)
- A PC with an NVIDIA GPU for the vision service (YOLO); the API and the apps run anywhere

## Getting started

```bash
npm install                                   # Node 22; one install for every workspace
cp services/api/.env.example services/api/.env
cp services/vision/.env.example services/vision/.env   # the same VISION_INGEST_TOKEN in both files
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # paste as VISION_INGEST_TOKEN in both; the API refuses the placeholder
cp apps/web/.env.example apps/web/.env.local

cd services/vision && python -m venv .venv
.venv\Scripts\activate                         # Windows (macOS/Linux: source .venv/bin/activate)
pip install -e ".[dev,yolo]" && cd ../..         # GPU: install the CUDA build of torch first

npm run dev                                   # api :4000 + vision :8001 (YOLO) + web :3000
```

`npm run dev` finds `services/vision/.venv` by itself (no need to activate it in that terminal). Open
http://localhost:3000 for the live map. For the phone app, copy `apps/mobile/.env.example` to
`apps/mobile/.env`, set `EXPO_PUBLIC_API_URL` to this computer's LAN address and run `npm run dev:mobile` (a development build, not Expo Go: [apps/mobile/README.md](apps/mobile/README.md)). Vision counts only
the cameras that have footage in `services/vision/configs/cameras.yaml`; a place without one stays grey on
the map (set-up, WILDTRACK, footage for many cameras, parking slots and test clips without a GPU:
[services/vision/README.md](services/vision/README.md)).
The assistant answers rule-based until `LLM_*` is set in `services/api/.env`.

| Command                           | What it does                                                            |
| --------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                     | API, vision (live YOLO) and web together                                |
| `npm run dev:mobile`              | The Expo app                                                            |
| `npm run typecheck`               | Every TypeScript workspace                                              |
| `npm test`                        | contracts, client and API tests (vision: `pytest` in `services/vision`) |
| `npm run e2e`                     | Real API + vision on test clips: places live, cars seen, no camera leak |
| `node scripts/assistant-eval.mjs` | 5 real Turkish questions next to the live data (run with the LLM key)   |

To add a camera (its clip and license line, its spot and direction on the map, its source), follow
[services/vision/README.md](services/vision/README.md#add-a-camera).

Working rules for this repo (people and coding assistants alike): [CLAUDE.md](CLAUDE.md).

## License

Campus Live is free software under the **GNU Affero General Public License v3.0 or later**
([LICENSE](LICENSE)), copyright © 2026 the Campus Live contributors. You may use, change and share it;
if you run a changed version for others over a network, you must offer them its source code.

Why the AGPL: the vision service runs Ultralytics YOLO, which is AGPL-3.0, and Ultralytics asks for the
whole application that uses it to be released as source. It lists university work and open-source
applications as the fit. A commercial or closed-source deployment needs an Ultralytics Enterprise
license, or a detector under another license (`services/vision` reaches YOLO through one detector
interface).

Not covered by [LICENSE](LICENSE):

- `config/places.json` and `config/cameras.json` hold data built from OpenStreetMap: © OpenStreetMap
  contributors, under the [Open Database License](https://opendatacommons.org/licenses/odbl/) (ODbL).
  Changed versions of that data may be shared only under the ODbL.
- Footage, datasets and model weights are never in the repository; each keeps its own license, listed
  in [docs/data-sources.md](docs/data-sources.md).
