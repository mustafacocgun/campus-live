/**
 * The Campus Live contracts: one zod schema per message, with a TypeScript type of the same name.
 * The vision service (Python) is tested against the JSON Schema that `jsonSchemas()` produces.
 */
import { z } from "zod";

export const CameraKind = z.enum(["crowd", "parking", "traffic"]);
export type CameraKind = z.infer<typeof CameraKind>;

/** Shown as Az / Orta / Yoğun in the apps. */
export const Level = z.enum(["low", "medium", "high"]);
export type Level = z.infer<typeof Level>;

/** Anything but "camera" is demo data and is labelled so in the UI (CLAUDE.md §0.5). */
export const ReadingSource = z.enum(["simulated", "demo-footage", "camera"]);
export type ReadingSource = z.infer<typeof ReadingSource>;

/** A camera as the map shows it: where it stands and where it looks. The registry is config/cameras.json. */
export const Camera = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  section: z.string().min(1),
  kind: CameraKind,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Where the camera looks, in degrees clockwise from north. */
  heading: z.number().min(0).lt(360),
  /** Horizontal view angle in degrees. */
  fovDeg: z.number().min(10).max(170),
  /** Distance from the camera to the far edge of its view, in metres. */
  rangeM: z.number().min(5).max(150),
});
export type Camera = z.infer<typeof Camera>;

/** People in one 3 m cell of the campus grid, smoothed, at the cell's centre. An aggregate, never a person. */
export const DensityCell = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  weight: z.number().nonnegative(),
});
export type DensityCell = z.infer<typeof DensityCell>;

export const ParkingState = z.object({
  total: z.number().int().nonnegative(),
  free: z.number().int().nonnegative(),
});
export type ParkingState = z.infer<typeof ParkingState>;

/** What the vision service sends for one camera. */
export const CameraReading = z
  .object({
    cameraId: z.string().min(1),
    kind: CameraKind,
    /** People (crowd) or vehicles (parking, traffic) in view. */
    count: z.number().int().nonnegative(),
    level: Level,
    /** Crowd cameras only: where the people are, per 3 m cell (CLAUDE.md §3.1). */
    cells: z.array(DensityCell).max(2000).optional(),
    /** Parking cameras only. */
    parking: ParkingState.optional(),
    source: ReadingSource,
    /** ISO-8601 UTC. */
    measuredAt: z.iso.datetime(),
  })
  .superRefine((reading, ctx) => {
    if ((reading.kind === "parking") !== (reading.parking !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["parking"],
        message: "parking is required for, and only for, parking cameras",
      });
    }
    if (reading.cells !== undefined && reading.kind !== "crowd") {
      ctx.addIssue({ code: "custom", path: ["cells"], message: "cells are for crowd cameras only" });
    }
    if (reading.parking && reading.parking.free > reading.parking.total) {
      ctx.addIssue({ code: "custom", path: ["parking", "free"], message: "free cannot exceed total" });
    }
  });
export type CameraReading = z.infer<typeof CameraReading>;

export const ReadingBatch = z.object({ readings: z.array(CameraReading).min(1).max(100) });
export type ReadingBatch = z.infer<typeof ReadingBatch>;

/** A camera with no reading for this long is stale (grey). The API's STALE_AFTER_MS defaults to it. */
export const DEFAULT_STALE_AFTER_MS = 15_000;

/** A camera with its latest reading, as GET /api/cameras returns it. */
export const LiveCamera = Camera.extend({
  reading: CameraReading.nullable(),
  /** True when there is no reading, or the API received the latest one too long ago. */
  stale: z.boolean(),
  /**
   * Milliseconds since the API received the latest reading, by the API's own clock; null without one.
   * Staleness never compares clocks of different machines (vision PC, API, phone).
   */
  ageMs: z.number().int().nonnegative().nullable(),
});
export type LiveCamera = z.infer<typeof LiveCamera>;

export const AssistantRequest = z.object({ message: z.string().trim().min(1).max(500) });
export type AssistantRequest = z.infer<typeof AssistantRequest>;

export const AssistantResponse = z.object({
  answer: z.string(),
  /** "fallback" when the rule-based answer was used instead of the LLM. */
  via: z.enum(["llm", "fallback"]),
});
export type AssistantResponse = z.infer<typeof AssistantResponse>;

export const SOCKET_EVENTS = { reading: "reading" } as const;

/** The JSON Schemas the vision service's tests check against, keyed by file name. */
export function jsonSchemas(): Record<string, unknown> {
  return {
    "camera-reading": z.toJSONSchema(CameraReading),
    "reading-batch": z.toJSONSchema(ReadingBatch),
  };
}

/** The envelope every API response uses. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
