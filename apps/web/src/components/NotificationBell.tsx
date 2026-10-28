"use client";

import type { AlertNotification } from "@campus-live/contracts";
import { useState } from "react";
import { campusTime } from "@/lib/use-account";
import { usePopover } from "@/lib/use-popover";
import { DemoBadge } from "./badges";
import { BellIcon } from "./icons";

/** The inbox: a bell with the unread count; opening it marks everything read. */
export function NotificationBell({
  notifications,
  unread,
  onOpen,
}: {
  notifications: AlertNotification[];
  unread: number;
  onOpen: () => void;
}) {
  const { open, setOpen, box } = usePopover();
  // What was unread when the menu opened stays highlighted while it is open.
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  function toggle() {
    if (!open) {
      setFresh(new Set(notifications.filter((n) => !n.readAt).map((n) => n.id)));
      if (unread) onOpen();
    }
    setOpen(!open);
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread ? `Bildirimler: ${unread} okunmamış` : "Bildirimler"}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-line bg-surface transition hover:border-accent/60"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] leading-none font-bold text-accent-foreground ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-12 right-0 z-[1100] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-2 shadow-2xl">
          <h2 className="px-2 pt-1 pb-2 text-sm font-semibold">Bildirimler</h2>
          {notifications.length ? (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={`rounded-xl px-3 py-2 text-sm ${fresh.has(notification.id) ? "bg-accent/10" : ""}`}
                >
                  <p className="leading-snug">{notification.message}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                    {campusTime(notification.createdAt)}
                    {notification.demo && <DemoBadge />}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 pb-2 text-sm text-muted">
              Henüz bildirim yok. Bildirim ayarlarından bir yer için eşik belirleyin.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
