# Campus Live API

Express 5 + TypeScript. Holds the camera registry and the latest reading per camera, takes readings
from the vision service, and pushes them to web and mobile over Socket.IO.

```bash
cp .env.example .env            # set VISION_INGEST_TOKEN (the vision service uses the same value);
                                # the placeholder is refused: the root README prints a random one
npm run dev -w @campus-live/api # http://localhost:4000, on every interface so phones can reach it
npm test -w @campus-live/api
```

| Route                      | Who calls it       | What it does                                                                                                       |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/health`          | anyone             | `{status: "ok"}`                                                                                                   |
| `GET /api/cameras`         | web, mobile        | Every camera with its latest reading and `stale` (no reading for `STALE_AFTER_MS`)                                 |
| `POST /internal/readings`  | the vision service | `Bearer VISION_INGEST_TOKEN` + `{readings}`; 202 `{accepted, rejected}`, 401, 400, or 422 if none known            |
| `POST /api/assistant/chat` | web, mobile        | `{message}` → `{answer, via}`: the LLM grounded on live data, or the rule-based fallback; 10 per minute per client |
| Socket.IO `reading`        | web, mobile        | Every accepted reading, as it arrives                                                                              |

Cameras live in `config/cameras.json` at the repo root, shared with the vision service: id, name,
section, kind, position and pose (`heading`, `fovDeg`, `rangeM`). The spots are placeholders until the
team sets real ones (CLAUDE.md §0.5). `CAMERAS_FILE` overrides the path; the tests use their own
`test/fixtures/cameras.json`.

## The assistant

Set `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` in `.env` (any OpenAI-compatible API) to answer with the
LLM; leave them empty and it answers rule-based from the same live data. Before building more UI around
it, run the 5 real questions against a running stack and check every number (CLAUDE.md §4.8):

```bash
node scripts/assistant-eval.mjs
```
