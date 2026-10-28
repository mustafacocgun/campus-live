import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Camera, CameraReading } from "@campus-live/contracts";
import { z } from "zod";

/** services/api/config/capacity.json (same depth from src/ and dist/). */
export const DEFAULT_CAPACITY_FILE = fileURLToPath(new URL("../../../config/capacity.json", import.meta.url));

const Capacity = z.number().int().positive();
const CapacityFile = z.object({
  defaultPerCamera: z.object({ crowd: Capacity, traffic: Capacity }),
  cameras: z.record(z.string(), Capacity),
});
export type CapacityTable = z.infer<typeof CapacityFile>;

export function loadCapacity(path: string): CapacityTable {
  return CapacityFile.parse(JSON.parse(readFileSync(path, "utf8")));
}

/**
 * What one camera's view holds at once: a parking camera's reported slots, else the placeholder for
 * its id, else its kind's default. A camera added to the registry later needs no entry.
 */
export function cameraCapacity(table: CapacityTable, camera: Camera, reading: CameraReading): number {
  if (reading.parking && reading.parking.total > 0) return reading.parking.total;
  return (
    table.cameras[camera.id] ??
    (camera.kind === "traffic" ? table.defaultPerCamera.traffic : table.defaultPerCamera.crowd)
  );
}
