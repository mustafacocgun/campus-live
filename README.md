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

Setup and run commands are in the "Getting started" section, added with the dev scripts.

Working rules for this repo (people and coding assistants alike): [CLAUDE.md](CLAUDE.md).
