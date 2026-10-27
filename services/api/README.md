# Campus Live API

Express 5 + TypeScript. Holds the camera registry and the latest reading per camera, takes readings
from the vision service, and pushes them to web and mobile over Socket.IO.

```bash
cp .env.example .env            # set VISION_INGEST_TOKEN (the vision service uses the same value)
npm run dev -w @campus-live/api # http://localhost:4000, on every interface so phones can reach it
npm test -w @campus-live/api
```

| Route                     | Who calls it       | What it does                                                                                            |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| `GET /api/health`         | anyone             | `{status: "ok"}`                                                                                        |
| `GET /api/cameras`        | web, mobile        | Every camera with its latest reading and `stale` (no reading for `STALE_AFTER_MS`)                      |
| `POST /internal/readings` | the vision service | `Bearer VISION_INGEST_TOKEN` + `{readings}`; 202 `{accepted, rejected}`, 401, 400, or 422 if none known |
| Socket.IO `reading`       | web, mobile        | Every accepted reading, as it arrives                                                                   |

Cameras live in `config/cameras.json`. Their positions are placeholders until the team sets real ones
(CLAUDE.md §0.5), and every id must also exist in `services/vision/configs/` with the same kind.
