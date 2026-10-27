# Decisions

Why the stack is what it is. Each entry: the decision, the reason, and what would make us revisit it.
Team decisions are dated; "open" items live in CLAUDE.md §6.

| #   | Decision                                                                                               | Why                                                                                    | Revisit when                                   |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| D1  | One npm-workspace monorepo (`apps/`, `services/`, `packages/`)                                         | Web, mobile and API share one set of types, so a contract change fails at compile time | Build times hurt; then add Turborepo on top    |
| D2  | `packages/contracts` (zod) is the single contract; JSON Schema is generated for Python                 | One source of truth across TypeScript and Python                                       | Never; extend it instead                       |
| D3  | The vision service pushes readings to the API (`POST /internal/readings`)                              | Vision is the producer; cameras can run on several machines and push to one API        | Many cameras: put a queue (Redis) between them |
| D4  | Live state in API memory; Socket.IO to clients; REST for the first load                                | Fewest moving parts for a live demo; Socket.IO reconnects on flaky Wi-Fi               | History and alerts land: add Postgres          |
| D5  | Apps show numbers and colors only, never camera images (team, 2026-10-27)                              | Frames never leave vision (KVKK); no faces republished                                 | Never without a CLAUDE.md §0.2 change          |
| D6  | Footage: licensed or our own first; YouTube maybe later (team, 2026-10-27)                             | Licenses and consent are defensible on stage                                           | The team decides otherwise, recorded here      |
| D7  | Express 5 + TypeScript for the API (team, 2026-10-27)                                                  | The team already used it in campus-life                                                | —                                              |
| D8  | Expo SDK 58 for mobile (team, 2026-10-27)                                                              | Same TypeScript and types as web; Expo Go on phones during the hackathon               | Native modules Expo Go cannot load             |
| D9  | One React (19.3.0) pinned by root `overrides`                                                          | Expo pins React exactly; two copies break React Native hooks                           | Expo SDK upgrade: move the pin with it         |
| D10 | The assistant lives in the API: an OpenAI-compatible adapter, a grounded prompt, a rule-based fallback | The API holds the live state; any provider plugs in; the demo works without a key      | The team picks a provider with a different API |
| D11 | No user accounts in v1                                                                                 | Following a parking lot can use the phone's push token                                 | Features need identity                         |
| D12 | Crowd → parking → traffic (team, 2026-10-27)                                                           | Crowd reuses the most; parking has the clearest user value; traffic is cut first       | —                                              |
