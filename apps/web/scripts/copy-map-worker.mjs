// MapLibre runs a web worker from its own file, which the bundler cannot locate once MapLibre is
// bundled. Copy the installed version's worker into public/ (git-ignored) before dev and build.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const target = new URL("../public/", import.meta.url);
mkdirSync(target, { recursive: true });
copyFileSync(
  require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs"),
  new URL("maplibre-gl-worker.mjs", target),
);
