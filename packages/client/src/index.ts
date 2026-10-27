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

/** Calls `onReading` for every live reading; returns a function that disconnects. */
export function connectLive(
  apiUrl: string,
  onReading: (reading: CameraReading) => void,
  onConnection?: (connected: boolean) => void,
): () => void {
  const socket = io(apiUrl, { transports: ["websocket"] });
  socket.on(SOCKET_EVENTS.reading, onReading);
  socket.on("connect", () => onConnection?.(true));
  socket.on("disconnect", () => onConnection?.(false));
  return () => {
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
