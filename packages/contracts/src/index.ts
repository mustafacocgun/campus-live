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

/**
 * A camera: where it stands, where it looks and the place it feeds. Private: the registry
 * (config/cameras.json) is read by the API and vision and served to nobody (CLAUDE.md §0.2).
 */
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
  /** The id of the place in config/places.json that this camera's readings feed. */
  place: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  /** Inside a building: it sends counts only, which light up the whole building. */
  indoor: z.boolean().optional(),
});
export type Camera = z.infer<typeof Camera>;

export const PlaceKind = z.enum(["area", "building", "parking", "road"]);
export type PlaceKind = z.infer<typeof PlaceKind>;

const LngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** GeoJSON geometry, [longitude, latitude]: a label point, a footprint or lot, or a road. */
export const PlaceGeometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: LngLat }),
  z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(LngLat).min(4)).min(1) }),
  z.object({ type: z.literal("LineString"), coordinates: z.array(LngLat).min(2) }),
  z.object({ type: z.literal("MultiLineString"), coordinates: z.array(z.array(LngLat).min(2)).min(1) }),
]);
export type PlaceGeometry = z.infer<typeof PlaceGeometry>;

/** What users see: an outdoor area, a building, a parking lot or a road (config/places.json). */
export const Place = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  section: z.string().min(1),
  kind: PlaceKind,
  geometry: PlaceGeometry,
});
export type Place = z.infer<typeof Place>;

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

/** The campus map, once per app start (GET /api/places): its outline and every place. */
export const CampusMap = z.object({
  campus: z.object({ name: z.string().min(1), geometry: PlaceGeometry }),
  places: z.array(Place),
});
export type CampusMap = z.infer<typeof CampusMap>;

/**
 * A place's live state, built from its cameras' readings. Which cameras feed it, and where they are,
 * never leave the server.
 */
export const LivePlace = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** People (areas, buildings) or vehicles (parking, roads); null without a fresh reading. */
  count: z.number().int().nonnegative().nullable(),
  level: Level.nullable(),
  /** Parking lots only: free and total slots. */
  parking: ParkingState.nullable(),
  /** True when none of its cameras has a fresh reading ("Görüntü yok"). */
  stale: z.boolean(),
  /** Milliseconds since the API received the newest reading behind it, by the API's clock. */
  ageMs: z.number().int().nonnegative().nullable(),
  /** True unless every reading behind it comes from a real, permitted camera ("Demo verisi"). */
  demo: z.boolean(),
});
export type LivePlace = z.infer<typeof LivePlace>;

/** Every second (GET /api/live, the "live" socket event): each place's state and the heat. */
export const LiveSnapshot = z.object({
  places: z.array(LivePlace),
  /** The outdoor heat: fresh cameras' cells merged by max per cell. */
  cells: z.array(DensityCell),
  at: z.iso.datetime(),
});
export type LiveSnapshot = z.infer<typeof LiveSnapshot>;

/** A position on the map: the user's, from the device or picked on the map. */
export const LatLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export type LatLng = z.infer<typeof LatLng>;

export const AssistantRequest = z.object({
  message: z.string().trim().min(1).max(500),
  /**
   * Where the user is, for "the nearest…" questions. The API measures from it and gives the LLM only
   * the top places with rounded distances; it never stores, logs or forwards the position.
   */
  location: LatLng.optional(),
});
export type AssistantRequest = z.infer<typeof AssistantRequest>;

/** A place an answer is about, for the screen to point at; metres from the user, when known. */
export const AnswerPlace = z.object({
  id: z.string(),
  name: z.string(),
  metres: z.number().int().nonnegative().nullable(),
});
export type AnswerPlace = z.infer<typeof AnswerPlace>;

export const AssistantResponse = z.object({
  answer: z.string(),
  /** "fallback" when the rule-based answer was used instead of the LLM. */
  via: z.enum(["llm", "fallback"]),
  /** For "nearest" and "where" questions: the places, nearest first. */
  places: z.array(AnswerPlace).optional(),
});
export type AssistantResponse = z.infer<typeof AssistantResponse>;

/**
 * A place users can set alerts on: one that at least one camera feeds. Its percent is the place's
 * count over a placeholder capacity (CLAUDE.md §0.5), shown as "tahmini"; a parking lot uses its slots.
 * Only fresh cameras count, so a camera falling silent neither raises nor lowers it. Like every public
 * payload, it never names or locates a camera (§0.2), and it carries no capacity, which would hint at
 * how many cameras a place has.
 */
export const Region = z.object({
  /** The place's id in config/places.json. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  kind: PlaceKind,
  section: z.string().min(1),
  /** A whole percent; null while none of its cameras has a fresh reading. */
  percent: z.number().int().nonnegative().nullable(),
  /** True when any reading behind `percent` is demo data. */
  demo: z.boolean(),
});
export type Region = z.infer<typeof Region>;

const Email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "E-posta adresi çok uzun.")
  .pipe(z.email("Geçerli bir e-posta adresi girin."));

/** Sign-up: a school e-mail (its domain is checked by the API) and a password. */
export const SignupRequest = z.object({
  email: Email,
  password: z.string().min(8, "Şifre en az 8 karakter olmalı.").max(200, "Şifre çok uzun."),
});
export type SignupRequest = z.infer<typeof SignupRequest>;

export const LoginRequest = z.object({
  email: Email,
  password: z.string().min(1, "Şifrenizi girin.").max(200, "Şifre çok uzun."),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** The 6-digit code the sign-up e-mail carries. */
export const VerifyRequest = z.object({
  email: Email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Kod 6 haneli bir sayı olmalı."),
});
export type VerifyRequest = z.infer<typeof VerifyRequest>;

export const ResendCodeRequest = z.object({ email: Email });
export type ResendCodeRequest = z.infer<typeof ResendCodeRequest>;

/** What the sign-up form needs to know: the school domains, and whether mails go to the dev outbox. */
export const AuthConfig = z.object({
  domains: z.array(z.string()),
  /** True in development without SMTP: codes are written to services/api/.mail-outbox, not mailed. */
  devOutbox: z.boolean(),
});
export type AuthConfig = z.infer<typeof AuthConfig>;

/** The signed-in user, as the apps see it. The e-mail never goes into a log or an LLM prompt (§0.4). */
export const User = z.object({ id: z.string(), email: z.string() });
export type User = z.infer<typeof User>;

/** Notify when a place's percent falls below, or rises above, the user's threshold. */
export const AlertDirection = z.enum(["below", "above"]);
export type AlertDirection = z.infer<typeof AlertDirection>;

export const AlertRuleInput = z.object({
  /** A place's id (Region.id). */
  place: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "Bir yer seçin."),
  direction: AlertDirection,
  thresholdPct: z.number().int().min(1, "Eşik en az %1 olmalı.").max(100, "Eşik en fazla %100 olabilir."),
  /** Also send the alert to the user's e-mail; in-app is always on. */
  email: z.boolean(),
});
export type AlertRuleInput = z.infer<typeof AlertRuleInput>;

export const AlertRulePatch = AlertRuleInput.omit({ place: true })
  .extend({ enabled: z.boolean() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Değiştirilecek bir alan yok.");
export type AlertRulePatch = z.infer<typeof AlertRulePatch>;

export const AlertRule = AlertRuleInput.extend({
  id: z.string(),
  /** The place's name, for the list; the rule keeps its id even if the name changes. */
  placeName: z.string(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  lastNotifiedAt: z.iso.datetime().nullable(),
});
export type AlertRule = z.infer<typeof AlertRule>;

/** One alert sent to a user: kept so the in-app inbox can show what arrived while they were away. */
export const AlertNotification = z.object({
  id: z.string(),
  place: z.string(),
  placeName: z.string(),
  direction: AlertDirection,
  thresholdPct: z.number().int(),
  percent: z.number().int().nonnegative(),
  demo: z.boolean(),
  message: z.string(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
export type AlertNotification = z.infer<typeof AlertNotification>;

export const MarkReadRequest = z.object({
  /** The notifications to mark read; all of the user's when left out. */
  ids: z.array(z.string()).max(200).optional(),
});
export type MarkReadRequest = z.infer<typeof MarkReadRequest>;

export const SOCKET_EVENTS = { live: "live", notification: "notification" } as const;

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
