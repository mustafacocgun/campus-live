import type { Server as HttpServer } from "node:http";
import { SOCKET_EVENTS } from "@campus-live/contracts";
import { Server } from "socket.io";
import type { LiveStore } from "./live-store.js";

/** Broadcasts every new reading to all connected web and mobile clients. */
export function attachLiveSocket(httpServer: HttpServer, store: LiveStore, corsOrigins: string[]): Server {
  const io = new Server(httpServer, { cors: { origin: corsOrigins } });
  store.onReading((reading) => io.emit(SOCKET_EVENTS.reading, reading));
  return io;
}
