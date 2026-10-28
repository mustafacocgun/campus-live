"use client";

import type { AlertNotification } from "@campus-live/contracts";
import { useEffect, useRef } from "react";
import { DemoBadge } from "./badges";
import { BellIcon, CloseIcon } from "./icons";

const SHOWN_MS = 8_000;

function Toast({ notification, onDismiss }: { notification: AlertNotification; onDismiss: () => void }) {
  // The page re-renders with every reading: the timer must not restart each time it does.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    const timer = setTimeout(() => dismiss.current(), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [notification.id]);
  return (
    <div className="pointer-events-auto flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl border border-line bg-surface p-3 shadow-2xl">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-linear-to-br from-accent to-accent-2 text-accent-foreground">
        <BellIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="leading-snug">{notification.message}</p>
        {notification.demo && (
          <p className="mt-1">
            <DemoBadge />
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Bildirimi kapat"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

/** Alerts that arrived while the page was open, bottom right, read out by screen readers. */
export function AlertToasts({
  items,
  onDismiss,
}: {
  items: AlertNotification[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="on-page pointer-events-none fixed right-4 bottom-4 z-[1200] flex flex-col items-end gap-2"
    >
      {items.map((notification) => (
        <Toast
          key={notification.id}
          notification={notification}
          onDismiss={() => onDismiss(notification.id)}
        />
      ))}
    </div>
  );
}
