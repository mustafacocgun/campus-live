import type { Server as HttpServer } from "node:http";
import { SOCKET_EVENTS } from "@campus-live/contracts";
import { Server } from "socket.io";
import type { LiveStore } from "./live-store.js";

// How often every client gets the places' states and the heat.
const SNAPSHOT_MS = 1_000;

/**
 * The live state for web and mobile: a "live" snapshot (places + heat) on connect and every second.
 * Nothing per camera is ever emitted (CLAUDE.md §0.2).
 */
export function attachLiveSocket(
  httpServer: HttpServer,
  store: LiveStore,
  corsOrigins: string[],
  snapshotMs = SNAPSHOT_MS,
): Server {
  // Credentials: a signed-in browser's session cookie rides along, for its notifications (user-rooms.ts).
  const io = new Server(httpServer, { cors: { origin: corsOrigins, credentials: true } });
  io.on("connection", (socket) => socket.emit(SOCKET_EVENTS.live, store.live(new Date())));
  const timer = setInterval(() => {
    if (io.engine.clientsCount) io.emit(SOCKET_EVENTS.live, store.live(new Date()));
  }, snapshotMs);
  io.on("close", () => clearInterval(timer));
  httpServer.on("close", () => clearInterval(timer));
  return io;
}
