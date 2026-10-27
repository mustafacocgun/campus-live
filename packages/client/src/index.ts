/**
 * What the web and mobile apps share: talking to the API, merging live readings, and showing them.
 * Works in browsers and React Native (fetch + socket.io-client), so both apps use the same logic.
 */
import {
  type ApiResponse,
  type AssistantResponse,
  type CameraReading,
  type Level,
  type LiveCamera,
  SOCKET_EVENTS,
} from "@campus-live/contracts";
import { io } from "socket.io-client";

/** The API's default STALE_AFTER_MS: a camera silent for longer is shown grey. */
export const STALE_AFTER_MS = 15_000;

export const LEVEL_LABEL_TR: Record<Level, string> = { low: "Az", medium: "Orta", high: "Yoğun" };
export const LEVEL_COLOR: Record<Level | "stale", string> = {
  low: "#16a34a",
  medium: "#f59e0b",
  high: "#dc2626",
  stale: "#9ca3af",
};

async function unwrap<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.success) throw new Error(body.error.message);
  return body.data;
}

export async function fetchCameras(apiUrl: string): Promise<LiveCamera[]> {
  return unwrap<LiveCamera[]>(await fetch(`${apiUrl}/api/cameras`));
}

export async function askAssistant(apiUrl: string, message: string): Promise<AssistantResponse> {
  const response = await fetch(`${apiUrl}/api/assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return unwrap<AssistantResponse>(response);
}

export interface LiveState {
  cameras: LiveCamera[];
  connected: boolean;
  error: string | null;
}

/**
 * The live camera list for an app: the first load over REST, then readings over Socket.IO, and a
 * tick that turns silent cameras grey. Calls `onChange` with each new state; returns a stop function.
 */
export function startLiveFeed(
  apiUrl: string,
  onChange: (state: LiveState) => void,
  tickMs = 5_000,
): () => void {
  let state: LiveState = { cameras: [], connected: false, error: null };
  let stopped = false;
  const update = (patch: Partial<LiveState>) => {
    if (stopped) return;
    state = { ...state, ...patch };
    onChange(state);
  };
  const load = () =>
    fetchCameras(apiUrl)
      .then((cameras) => update({ cameras, error: null }))
      .catch(() => update({ error: "API'ye ulaşılamadı." }));

  void load();
  const socket = io(apiUrl, { transports: ["websocket"] });
  socket.on("connect", () => {
    update({ connected: true });
    // Every (re)connect re-syncs the list: if the first load failed because the API was not up yet,
    // readings for unknown cameras would otherwise be dropped and the map would stay empty.
    void load();
  });
  socket.on("disconnect", () => update({ connected: false }));
  socket.on(SOCKET_EVENTS.reading, (reading: CameraReading) =>
    update({ cameras: mergeReading(state.cameras, reading) }),
  );
  const timer = setInterval(() => {
    const now = new Date();
    update({ cameras: state.cameras.map((camera) => ({ ...camera, stale: isStale(camera.reading, now) })) });
  }, tickMs);

  return () => {
    stopped = true;
    clearInterval(timer);
    socket.close();
  };
}

/** The cameras with `reading` applied to its camera, which becomes fresh; the others are untouched. */
export function mergeReading(cameras: LiveCamera[], reading: CameraReading): LiveCamera[] {
  return cameras.map((camera) =>
    camera.id === reading.cameraId ? { ...camera, reading, stale: false } : camera,
  );
}

export function isStale(reading: CameraReading | null, now: Date, staleAfterMs = STALE_AFTER_MS): boolean {
  return !reading || now.getTime() - Date.parse(reading.measuredAt) > staleAfterMs;
}

/** Anything not from a real, permitted camera is labelled "Demo verisi" (CLAUDE.md §0.5). */
export function isDemo(reading: CameraReading): boolean {
  return reading.source !== "camera";
}

/** The number to show: free slots for parking, people or vehicles otherwise. */
export function valueText(reading: CameraReading): string {
  if (reading.kind === "parking" && reading.parking)
    return `${reading.parking.free}/${reading.parking.total} boş`;
  return `${reading.count} ${reading.kind === "crowd" ? "kişi" : "araç"}`;
}

/** A phone cannot reach the development machine as localhost; it needs the machine's LAN address. */
export function apiUrlProblem(url: string, platform: string): string | null {
  if (!url) return "EXPO_PUBLIC_API_URL ayarlı değil: API'nin adresini .env dosyasına yazın.";
  if (platform !== "web" && /\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(url)) {
    return "Telefon localhost'a ulaşamaz: EXPO_PUBLIC_API_URL bilgisayarın ağ adresi olmalı (ör. http://192.168.1.20:4000).";
  }
  return null;
}
