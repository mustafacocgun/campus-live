import type { Server } from "socket.io";
import type { AccountsRepo } from "../accounts/accounts.repo.js";
import { hashToken, readCookie, SESSION_COOKIE } from "../accounts/sessions.js";

export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Puts each socket whose handshake carries a live session cookie into its user's room, where that
 * user's notifications are sent. Sockets without one still get the public readings.
 */
export function attachUserRooms(io: Server, accounts: AccountsRepo): void {
  io.on("connection", (socket) => {
    const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    if (!token) return;
    accounts
      .userBySession(hashToken(token))
      .then((user) => {
        if (user) void socket.join(userRoom(user.id));
      })
      .catch(() => {
        // Database down: this socket simply gets no notifications.
      });
  });
}
