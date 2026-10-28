# Campus Live API

Express 5 + TypeScript. Takes readings from the vision service, keeps the latest one per camera, and
gives web and mobile each place's live state and the merged heat, over HTTP and Socket.IO. Which camera
feeds a place, and where it is, never leaves the API (CLAUDE.md §0.2).

```bash
cp .env.example .env            # set VISION_INGEST_TOKEN (the vision service uses the same value);
                                # the placeholder is refused: the root README prints a random one
npm run dev -w @campus-live/api # http://localhost:4000, on every interface so phones can reach it
npm test -w @campus-live/api
```

| Route                      | Who calls it       | What it does                                                                                                               |
| -------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`          | anyone             | `{status: "ok"}`                                                                                                           |
| `GET /api/places`          | web, mobile        | The campus outline and every place (area, building, parking lot, road) with its geometry; fetched once                     |
| `GET /api/live`            | web, mobile        | `{places, cells, at}`: each place's count, level, free slots, `stale` and age, and the outdoor heat merged by max per cell |
| Socket.IO `live`           | web, mobile        | The same snapshot, on connect and every second                                                                             |
| `POST /internal/readings`  | the vision service | `Bearer VISION_INGEST_TOKEN` + `{readings}`; 202 `{accepted, rejected}`, 401, 400, or 422 if none is accepted              |
| `POST /api/assistant/chat` | web, mobile        | `{message}` → `{answer, via}`: the LLM grounded on the places, or the rule-based fallback; 10 per minute per client        |
| `GET /api/regions`         | web                | Every place a camera feeds, with its live percent over a placeholder capacity; no camera, no capacity                      |
| `/api/auth/*`              | web                | `config`, `signup`, `resend`, `verify`, `login`, `logout`, `me`: school e-mail + password, session cookie                  |
| `/api/alerts/*`            | web (signed in)    | `rules` (GET, POST, PATCH/DELETE `:id`), `notifications` (GET), `notifications/read` (POST)                                |
| Socket.IO `notification`   | web (signed in)    | An alert for the signed-in user, to the room their session cookie joined                                                   |

A place's state comes from its fresh cameras (a reading in the last `STALE_AFTER_MS`): an area or a road
takes its busiest camera (views overlap), a building or a parking lot adds its cameras up (rooms and
slots differ). With no fresh camera the place is `stale`. Only outdoor crowd cameras feed the heat; a
reading with cells from an indoor camera is rejected.

Places are in `config/places.json` (public, from OpenStreetMap by `services/vision/tools/build_campus.py`)
and cameras in `config/cameras.json` (private: id, place, kind, position and pose, shared with the
vision service). Both are placeholders until the team sets real spots (CLAUDE.md §0.5). The API refuses
to start when a camera feeds no known place or a place has a camera's id. `PLACES_FILE` and
`CAMERAS_FILE` override the paths; the tests use their own `test/fixtures/`.

## Accounts and place alerts

Optional: they need Postgres. Without `DATABASE_URL` (or with the database down) `/api/auth` and
`/api/alerts` answer 503 and everything else works. To run them locally, create a role and two databases
(the app's and the tests', which the tests empty), then put both URLs in `.env`:

```sql
CREATE ROLE campus_live LOGIN PASSWORD '<a random password>';
CREATE DATABASE campus_live OWNER campus_live;
CREATE DATABASE campus_live_test OWNER campus_live;
```

The API applies `migrations/*.sql` itself at startup. A rule watches a place some camera feeds; its
percent is the place's fresh count over the placeholder capacities in `config/capacity.json` (private,
like the camera registry; the apps show the percent as "tahmini", CLAUDE.md §0.5), with the place's own
rule: an area or a road as full as its fullest camera, a building or a parking lot summed. The check runs
every second. Without `SMTP_*`, sign-up codes and alert mails are written to `services/api/.mail-outbox/`
(git-ignored) instead of sent; any SMTP provider works (Gmail with an app password, Mailjet), and the API
logs at startup whether the mail login works.

## The assistant

The team uses Google AI Studio's free tier with `gemini-3.5-flash-lite` (D26). `.env.example` already has its
base URL and model, so only `LLM_API_KEY` is left: a free key from aistudio.google.com. Any other
OpenAI-compatible API works through the same three settings; without a key it answers rule-based from the
same live data. On the free tier Google may use the questions and human reviewers may read them, so a
question must never carry personal data (CLAUDE.md §0.4). Before building more UI around
it, run the 5 real questions against a running stack and check every number (CLAUDE.md §4.8):

```bash
node scripts/assistant-eval.mjs
```
