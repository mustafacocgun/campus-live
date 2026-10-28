/**
 * Accounts and place alerts: a school e-mail, a mailed 6-digit code once, then e-mail + password; then
 * the signed-in user's alert rules and notifications. Every call carries the session cookie.
 */
import {
  type AlertDirection,
  type AlertNotification,
  type AlertRule,
  type AlertRuleInput,
  type AlertRulePatch,
  type AuthConfig,
  type Region,
  SOCKET_EVENTS,
  type User,
} from "@campus-live/contracts";
import { io } from "socket.io-client";
import { ApiRequestError, request } from "./request.js";

export { ApiRequestError };

/**
 * A browser sends the session cookie to the API's origin only with credentials "include" (the web app
 * and the API are on different ports).
 */
function withSession<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  return request<T>(url, {
    method,
    credentials: "include",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

/** Every place users can set an alert on, with its live percent over a placeholder capacity ("tahmini"). */
export const fetchRegions = (apiUrl: string) => request<Region[]>(`${apiUrl}/api/regions`);

export const fetchAuthConfig = (apiUrl: string) => request<AuthConfig>(`${apiUrl}/api/auth/config`);
export const signUp = (apiUrl: string, email: string, password: string) =>
  withSession<{ email: string }>(`${apiUrl}/api/auth/signup`, "POST", { email, password });
export const verifyCode = (apiUrl: string, email: string, code: string) =>
  withSession<User>(`${apiUrl}/api/auth/verify`, "POST", { email, code });
export const resendCode = (apiUrl: string, email: string) =>
  withSession<{ email: string }>(`${apiUrl}/api/auth/resend`, "POST", { email });
export const logIn = (apiUrl: string, email: string, password: string) =>
  withSession<User>(`${apiUrl}/api/auth/login`, "POST", { email, password });
export const logOut = (apiUrl: string) => withSession<null>(`${apiUrl}/api/auth/logout`, "POST", {});

/** The signed-in user, or null when signed out. Throws when the API or its accounts are unavailable. */
export async function fetchMe(apiUrl: string): Promise<User | null> {
  try {
    return await withSession<User>(`${apiUrl}/api/auth/me`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

export const fetchAlertRules = (apiUrl: string) => withSession<AlertRule[]>(`${apiUrl}/api/alerts/rules`);
export const createAlertRule = (apiUrl: string, input: AlertRuleInput) =>
  withSession<AlertRule>(`${apiUrl}/api/alerts/rules`, "POST", input);
export const updateAlertRule = (apiUrl: string, id: string, patch: AlertRulePatch) =>
  withSession<AlertRule>(`${apiUrl}/api/alerts/rules/${encodeURIComponent(id)}`, "PATCH", patch);
export const deleteAlertRule = (apiUrl: string, id: string) =>
  withSession<null>(`${apiUrl}/api/alerts/rules/${encodeURIComponent(id)}`, "DELETE");
export const fetchNotifications = (apiUrl: string) =>
  withSession<AlertNotification[]>(`${apiUrl}/api/alerts/notifications`);
export const markNotificationsRead = (apiUrl: string, ids?: string[]) =>
  withSession<{ updated: number }>(`${apiUrl}/api/alerts/notifications/read`, "POST", ids ? { ids } : {});

export const ALERT_DIRECTION_TR: Record<AlertDirection, string> = {
  below: "altına inince",
  above: "üstüne çıkınca",
};

/**
 * The signed-in user's alerts as they happen. A socket of its own, opened after sign-in so its
 * handshake carries the session cookie (the API puts it in the user's room). Returns a stop function.
 */
export function startNotificationFeed(
  apiUrl: string,
  onNotification: (notification: AlertNotification) => void,
): () => void {
  const socket = io(apiUrl, { transports: ["websocket"], withCredentials: true });
  socket.on(SOCKET_EVENTS.notification, onNotification);
  return () => {
    socket.close();
  };
}
