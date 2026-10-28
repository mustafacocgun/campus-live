import {
  fetchMe,
  fetchNotifications,
  logOut,
  markNotificationsRead,
  startNotificationFeed,
} from "@campus-live/client";
import type { AlertNotification, User } from "@campus-live/contracts";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { API_URL } from "@/constants/api";

export type AccountStatus =
  | { status: "loading" }
  /** The API, or its accounts (no database), is unavailable: the map works, sign-in is hidden. */
  | { status: "off" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: User };

interface AccountState {
  account: AccountStatus;
  notifications: AlertNotification[];
  unread: number;
  /** Notifications that arrived while the app was open: the toasts. */
  arrived: AlertNotification[];
  signedIn: (user: User) => void;
  signOut: () => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => void;
}

const AccountContext = createContext<AccountState | null>(null);

/**
 * The signed-in user, their notifications (the inbox), and the ones that just arrived (the toasts), as
 * on the web (apps/web/src/lib/use-account.ts). The phone keeps the session cookie the API sets, so
 * every call and the notification socket's handshake carry it.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountStatus>({ status: "loading" });
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [arrived, setArrived] = useState<AlertNotification[]>([]);
  const userId = account.status === "signed-in" ? account.user.id : null;

  useEffect(() => {
    if (!API_URL) {
      setAccount({ status: "off" });
      return;
    }
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
    });
    return () => {
      current = false;
      stop();
    };
  }, [userId]);

  const signedIn = useCallback((user: User) => setAccount({ status: "signed-in", user }), []);

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

  const value = useMemo(
    () => ({
      account,
      notifications,
      unread: notifications.filter((n) => !n.readAt).length,
      arrived,
      signedIn,
      signOut,
      markAllRead,
      dismiss,
    }),
    [account, notifications, arrived, signedIn, signOut, markAllRead, dismiss],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountState {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useAccount outside AccountProvider");
  return account;
}
