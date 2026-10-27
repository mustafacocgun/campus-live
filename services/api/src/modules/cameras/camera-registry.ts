import { readFileSync } from "node:fs";
import { Camera } from "@campus-live/contracts";
import { z } from "zod";

/** The cameras the map shows, from config/cameras.json. */
export class CameraRegistry {
  private readonly byId = new Map<string, Camera>();

  constructor(private readonly cameras: Camera[]) {
    for (const camera of cameras) {
      if (this.byId.has(camera.id)) throw new Error(`duplicate camera id: ${camera.id}`);
      this.byId.set(camera.id, camera);
    }
  }

  list(): Camera[] {
    return this.cameras;
  }

  get(id: string): Camera | undefined {
    return this.byId.get(id);
  }
}

export function loadRegistry(path: string): CameraRegistry {
  const file = z.object({ cameras: z.array(Camera).min(1) }).parse(JSON.parse(readFileSync(path, "utf8")));
  return new CameraRegistry(file.cameras);
}
