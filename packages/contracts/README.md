# @campus-live/contracts

The one contract between vision, API, web and mobile (CLAUDE.md §2.8): zod schemas in `src/index.ts`,
each with a TypeScript type of the same name.

```bash
npm run schemas -w @campus-live/contracts   # build, then write schemas/*.schema.json for Python
npm test -w @campus-live/contracts          # fails while schemas/ is out of date
```

Changing a schema: edit `src/index.ts`, run `npm run schemas`, and update every consumer in the same
commit — `services/api`, `services/vision` (`vision.contracts`), `packages/client`, `apps/*`.
