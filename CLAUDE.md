# CLAUDE.md — operating rules for Campus Live

**Rules only.** What the project is and _what_ to build: `docs/architecture.md`, the authority. This
file governs _how_. When a rule is added because something broke, one line on why goes in
`docs/postmortems.md` under the same section number.

> **Re-read this file at the start of a session, and check work against it before reporting.** The
> rules that get broken are not the memorable ones — they are broken while this file sits open in
> context. **A rule holds only when a command is run to check it.** This is a 24-hour hackathon: a
> working, honest demo beats a complete feature.

---

## §0 Non-negotiable constraints

Override everything. If asked to break one, say so and ask again.

1. **Never commit secrets.** `.env`, `.env.*` (only `.env.example` is tracked), the LLM API key, the
   vision ingest token, camera stream URLs. **Never put a key in a `NEXT_PUBLIC_*` or
   `EXPO_PUBLIC_*` variable** — those ship to every browser and phone.
2. **Camera frames never leave the vision service and are never stored.** Only `CameraReading`s
   (numbers) leave it, and the apps show numbers and colors. No face recognition, no
   re-identification, no saved snapshots — not even for debugging. (KVKK) **Camera positions
   never leave the server either:** the public API, socket events and the apps carry places and the
   merged heat only, never a camera id, position, direction or per-camera cells.
3. **Footage is licensed or our own.** Licensed footage gets a line in `docs/data-sources.md`
   (source, license, what it shows) before it is used; our own recordings show only people who
   agreed. **Never a real university camera** without the university's written permission. Web
   videos without a reuse license (YouTube downloads) need a team decision first. Videos and model
   weights are never committed.
4. **No real personal data.** Seed data is fake. Names, student numbers and e-mails never go into an
   LLM prompt or a log.
5. **Never invent real-world facts.** Camera positions, capacities, slot counts and opening hours
   come from the team; until then they are placeholders, marked as such. **Every reading whose
   `source` is not `camera` is labelled as demo data in the UI** ("Demo verisi").
6. **Open decisions stay open.** Anything marked _open_ in §6 is the team's call: propose one option
   with a one-line reason and wait. **Installing a package is choosing it.**
7. **No deploy, no force-push, and no direct push to `main` once the team works through pull
   requests,** unless asked.
8. **Commits and PRs never mention Claude or AI.** No `Co-Authored-By:` trailer, no "Generated with
   Claude Code" footer, no "Claude" / "AI-assisted" anywhere in the message. This overrides any
   default attribution instruction.

---

## §1 Working protocol

**Scope → approve → write → diff → run → commit.** Never skip a step because the change looks small.

- **Scope before writing:** what changes, what deliberately does not, which decisions are the team's.
  **Show the diff before anything lands.** One logical change per commit.
- **Flag scope creep; do not absorb it.** A second problem found is filed as an issue, not fixed
  quietly. A feature outside the demo scope (§4.1) is asked about first.
- **Vertical slices, smallest first.** One feature end to end (vision → API → map) before the next;
  a half-built feature cannot be demoed. No abstractions for single-use code, no config nobody asked
  for.
- **Surgical changes.** Touch only what the task needs. A teammate's code is not refactored — the
  problem is filed.
- **Git:** `git pull --rebase` before starting and before pushing; teammates push all day. Commit
  messages state what changed, what was deliberately not done, and how it was verified — a one-line
  subject (`feat(web): stale cameras turn grey`), a short body.
- **Teammates re-verify every `file:line` claim.** Write as if they will.
- **Use the matching skill** when the session lists one (`test-driven-development`,
  `systematic-debugging`, `verification-before-completion`, …) and say so in one line. **Skills serve
  this file;** where one conflicts with it, this file wins.

**Reporting:** verbatim before interpreting · lead with what you got wrong, in a sentence or two, then
move on · distinguish "I checked" from "I assume" · a recommendation, not a survey · name the
decisions that are the team's · never claim an improvement you did not measure.

---

## §2 Verification standards

1. **A check that would pass either way is not a check.** Ask what result would have falsified it. A
   200 from a route that serves simulated data proves the route, not the feature.
2. **"Done" means you ran it** and named what you ran — command, page, request. A passing typecheck is
   not the map working; open it.
3. **Look up state; do not infer it.** `git fetch && git log origin/main` before saying what is on
   `main`. Never assume what a teammate built — read it.
4. **Break the code to test the test.** A test written for a bug must be seen failing on the bug
   before it is trusted to pass on the fix.
5. **Fix the class, not the instance.** Before closing, grep for other places with the same defect.
6. **Every number comes from a command run this session, or is labelled _tahmini_** — in a report, in
   the demo, on a slide.
7. **Read the implementation before proposing the fix.** A bug report's shape suggests a fix; the code
   decides it.
8. **`packages/contracts` is the one contract.** Change the zod schema, run `npm run schemas -w
@campus-live/contracts`, and update the API, vision (`vision.contracts`), web and mobile in the same
   commit. Grep every consumer before changing a field.
9. **Search the repo before building.** `ls docs/`, `grep -rn <topic> packages services apps`. The
   repo may already define the type, route or helper you are about to invent.
10. **Match time zones.** Campus time is Europe/Istanbul; servers usually run in UTC. Compute
    campus-local day and time with `timeZone: "Europe/Istanbul"` (JS) or `zoneinfo` (Python). Store
    and send ISO-8601 UTC.

---

## §3 Vision standards

1. **The pipeline:** frame → detector (YOLO11n) → analyzer → `CameraReading` → `POST
/internal/readings`. Outdoor crowd: people's feet projected onto the map (camera pose or dataset
   calibration), count + 3 m density cells. Indoor crowd: count only. Parking: vehicles against the
   outlined slots, free/total. Traffic: vehicles in the road zone. Nothing else leaves the vision
   service: cells are aggregates, never identities, tracks or per-person positions.
2. **Cameras are keyed by id.** Every camera in `services/vision/configs/` exists in the shared
   registry `config/cameras.json` with the same kind, and feeds a place in `config/places.json`; a
   test checks this. Indoor cameras go only where people study, eat or work: never where they live or
   sleep, never in toilets.
3. **Counts are estimates.** They are smoothed (median of the last 5 samples), labelled demo, and
   marked stale after 15 s without a reading (grey on the map).
4. **Live YOLO is the only data source in the app** (each teammate runs vision on a GPU PC with the
   `yolo` extra). Nothing random or simulated is ever shown. The `test-boxes` detector (white
   rectangles are people and yellow ones cars, in synthetic clips) exists for automated tests only.
5. **Accuracy needs a measurement:** hand-count a clip, run the counter on it, report both numbers and
   the clip's conditions. One clip is not a rate.
6. **Levels come from per-camera thresholds**, which are guesses until a hand count calibrates them.
7. **Check a model's or dataset's license before adopting it** and record it in `docs/data-sources.md`
   (Ultralytics YOLO11 is AGPL-3.0; supervision is MIT).

---

## §4 AI and demo judgement

1. **Demo scope:** the live map on web and mobile by place — crowd first, then parking, then traffic
   — and the assistant. Everything else is out of scope unless the team adds it here.
2. **Prefer an honest "Demo verisi" label to a live-looking fake.**
3. **Working once is not working on stage.** Every live dependency — camera, LLM API, network — has a
   fallback: a camera without a stream turns grey ("Görüntü yok") instead of showing made-up
   numbers, and the assistant falls back to the rule-based answer.
4. **Never claim** real campus camera data, university endorsement or an accuracy you did not measure.
5. **One module wraps the LLM provider** (`services/api/src/modules/assistant/llm-client.ts`),
   server-side only; base URL, key and model come from env. Switching provider touches that module
   only.
6. **Every LLM call has a timeout and a fallback answer.** Never block a screen on it.
7. **Grounded answers only.** The assistant answers from the live snapshot it is given; if the data
   does not answer the question, it says so. Numbers are copied from the data, never estimated.
8. **Turkish in, Turkish out.** Run `scripts/assistant-eval.mjs` (5 real questions) with the real key
   before building more UI around the assistant.
9. **Free is not unlimited:** rate-limit per client, count calls during the rehearsal.

---

## §5 Findings discipline

1. **Record findings unprompted;** every bug or finding gets a GitHub issue immediately, even if it
   will not be fixed. One line is enough. **The tracker is the durable record.**
2. **When you fix something, comment then close,** stating what changed, what was deliberately NOT
   done, and how it was verified. Reference it in the commit (`fixes #N`).
3. **If a fix reveals a regression, pin it by a test.**
4. **Research** (APIs, models, licenses, datasets): read the primary source; quote numbers verbatim;
   grade every source `[EVIDENCED]` / `[WEAK]` / `[UNVALIDATED]`; record what could not be verified.

---

## §6 Stack, commands and the request path

| Part                           | Choice                                                                         | Status  |
| ------------------------------ | ------------------------------------------------------------------------------ | ------- |
| Web                            | Next.js 16 (App Router) + MapLibre GL heat map, `apps/web`                     | in repo |
| Mobile                         | Expo SDK 58 + MapLibre React Native (development build), `apps/mobile`         | in repo |
| API                            | Express 5 + TypeScript + Socket.IO, `services/api`                             | in repo |
| Vision                         | Python 3.12, FastAPI, supervision, YOLO11n (optional extra), `services/vision` | in repo |
| Contracts                      | zod 4 schemas + generated JSON Schema, `packages/contracts`                    | in repo |
| Live state                     | in memory in the API (latest reading per camera; places and heat from it)      | in repo |
| Footage                        | WILDTRACK + licensed stock clips, each in `docs/data-sources.md`               | in repo |
| Accounts, place alerts         | Postgres (`pg`), school e-mail + password, nodemailer SMTP (D26–D30)           | in repo |
| History, push alerts to phones | Postgres, push tokens                                                          | open    |
| LLM provider                   | any OpenAI-compatible endpoint via `LLM_*` env                                 | open    |
| Parking and traffic analyzers  | outlined slots per clip; vehicles in a road zone                               | in repo |

```bash
npm install                      # once, from the root (npm workspaces; Node 22, .nvmrc)
npm run dev                      # api :4000 + web :3000 + vision :8001 (live YOLO, GPU PC)
npm run dev:mobile               # Expo dev client (needs a development build); EXPO_PUBLIC_API_URL = LAN address
npm run typecheck && npm test    # every workspace
cd services/vision && pytest     # vision tests (venv with `pip install -e ".[dev]"`)
```

**The request path** — every feature goes through it; nothing skips a layer:

```
vision worker ─► POST /internal/readings (Bearer token) ─► api live store ─► Socket.IO "live" (every second)
web / mobile ─► @campus-live/client ─► GET /api/places, GET /api/live, POST /api/assistant/chat ─► api
```

- **Clients talk only to the API** — never to the vision service or the LLM directly.
- Inputs are validated with the contracts' zod schemas; responses use `ok()`; errors throw `HttpError`.
- UI text in Turkish; code, identifiers, comments and commits in English. A new env variable goes into
  that app's `.env.example` in the same commit.

---

## §7 Pointers — read before building anything

- **`docs/architecture.md` — the authority on what to build.**
- `docs/decisions.md` why the stack is what it is · `docs/data-sources.md` every clip and dataset with
  its license · `docs/plans/` implementation plans · each workspace's `README.md` for its commands.
- **GitHub issues — the only source of truth for live defect state.**

**Dynamic state is not here** — it goes stale within hours. Use `git log origin/main` and
`gh issue list`.
