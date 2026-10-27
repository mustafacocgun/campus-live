# Campus Live

A live campus map: how crowded each spot is, how many parking slots are free, and how busy the roads
are, counted from camera video and shown on the web and on phones. An assistant answers questions about
it in Turkish ("Otopark A'da boş yer var mı?").

There is no access to campus cameras. The cameras are **demo videos** (licensed footage or our own
recordings) placed at campus positions, and every reading is labelled as demo data. Video frames never
leave the vision service; the apps get numbers only. Design: [docs/architecture.md](docs/architecture.md).

## Repository

| Folder                                     | Stack                             | Purpose                                           |
| ------------------------------------------ | --------------------------------- | ------------------------------------------------- |
| [`apps/web`](apps/web)                     | Next.js 16, react-leaflet         | Live map and assistant in the browser             |
| [`apps/mobile`](apps/mobile)               | Expo SDK 58 (React Native)        | Live map and assistant on phones                  |
| [`services/api`](services/api)             | Node 22, Express 5, Socket.IO     | Camera registry, live state, assistant            |
| [`services/vision`](services/vision)       | Python 3.12, YOLO11n, supervision | Camera workers: video in, readings out            |
| [`packages/contracts`](packages/contracts) | zod 4                             | The shared types, plus JSON Schema for Python     |
| [`packages/client`](packages/client)       | TypeScript                        | API access and map logic shared by web and mobile |
| [`docs`](docs)                             | Markdown                          | Architecture, decisions, data sources, plans      |

## Requirements

- Node.js 22 and npm
- Python 3.12 (vision service)
- A GPU machine for real YOLO counting; everything else runs anywhere in simulated mode

## Getting started

```bash
npm install                                   # Node 22; one install for every workspace
cp services/api/.env.example services/api/.env
cp services/vision/.env.example services/vision/.env   # the same VISION_INGEST_TOKEN in both files
cp apps/web/.env.example apps/web/.env.local

cd services/vision && python -m venv .venv
.venv\Scripts\activate                         # Windows (macOS/Linux: source .venv/bin/activate)
pip install -e ".[dev]" && cd ../..

npm run dev                                   # api :4000 + simulated vision + web :3000, all live
```

Open http://localhost:3000 for the live map. For the phone app, set `EXPO_PUBLIC_API_URL` in
`apps/mobile/.env` to this computer's LAN address and run `npm run dev:mobile` (Expo Go). To count from
real video with YOLO on a GPU, see [services/vision/README.md](services/vision/README.md). The assistant
answers rule-based until `LLM_*` is set in `services/api/.env`.

| Command                           | What it does                                                            |
| --------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                     | API, simulated vision and web together                                  |
| `npm run dev:mobile`              | The Expo app                                                            |
| `npm run typecheck`               | Every TypeScript workspace                                              |
| `npm test`                        | contracts, client and API tests (vision: `pytest` in `services/vision`) |
| `npm run e2e`                     | Real API + simulated vision: fresh readings and a grounded answer       |
| `node scripts/assistant-eval.mjs` | 5 real Turkish questions next to the live data (run with the LLM key)   |

Working rules for this repo (people and coding assistants alike): [CLAUDE.md](CLAUDE.md).
