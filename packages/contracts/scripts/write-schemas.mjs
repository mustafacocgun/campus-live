// Writes the contracts' JSON Schemas into schemas/ for the vision service's tests.
// Run with `npm run schemas` (it builds first); the contracts test fails while they are stale.
import { writeFileSync } from "node:fs";
import { jsonSchemas } from "../dist/index.js";

for (const [name, schema] of Object.entries(jsonSchemas())) {
  writeFileSync(
    new URL(`../schemas/${name}.schema.json`, import.meta.url),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
  console.log(`wrote schemas/${name}.schema.json`);
}
