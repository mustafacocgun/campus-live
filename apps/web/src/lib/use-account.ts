"use client";

import {
  fetchMe,
  fetchNotifications,
  logOut,
  markNotificationsRead,
  startNotificationFeed,
} from "@campus-live/client";
import type { AlertNotification, User } from "@campus-live/contracts";
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "./config";

export type AccountState =
  | { status: "loading" }
  /** The API, or its accounts (no database), is unavailable: the map works, sign-in is hidden. */
  | { status: "off" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: User };

/** Campus time, whatever the device's zone (CLAUDE.md §2.10). */
export function campusTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A system notification, only while the page is in the background: in front, the toast says it. */
function notifyBrowser(notification: AlertNotification): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  new Notification("Campus Live", {
    body: notification.demo ? `${notification.message} (Demo verisi)` : notification.message,
    tag: notification.id,
  });
}

/**
 * The signed-in user, their notifications (the inbox), and the ones that just arrived (the toasts).
 * Notifications arrive over a socket opened after sign-in, so its handshake carries the cookie.
 */
export function useAccount() {
  const [account, setAccount] = useState<AccountState>({ status: "loading" });
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [arrived, setArrived] = useState<AlertNotification[]>([]);
  const userId = account.status === "signed-in" ? account.user.id : null;

  useEffect(() => {
    let current = true;
    fetchMe(API_URL)
      .then((user) => current && setAccount(user ? { status: "signed-in", user } : { status: "signed-out" }))
      .catch(() => current && setAccount({ status: "off" }));
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    fetchNotifications(API_URL)
      .then((list) => current && setNotifications(list))
      .catch(() => undefined);
    const stop = startNotificationFeed(API_URL, (notification) => {
      setNotifications((list) => [notification, ...list.filter((n) => n.id !== notification.id)]);
      setArrived((list) => [...list, notification]);
      notifyBrowser(notification);
    });
    return () => {
      current = false;
      stop();
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    await logOut(API_URL).catch(() => undefined);
    setNotifications([]);
    setArrived([]);
    setAccount({ status: "signed-out" });
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    await markNotificationsRead(API_URL).catch(() => undefined);
  }, []);

  const dismiss = useCallback((id: string) => setArrived((list) => list.filter((n) => n.id !== id)), []);

  return {
    account,
    notifications,
    unread: notifications.filter((n) => !n.readAt).length,
    arrived,
    signOut,
    markAllRead,
    dismiss,
  };
}
