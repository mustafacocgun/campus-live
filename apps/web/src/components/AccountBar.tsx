"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "@/lib/use-account";
import { usePopover } from "@/lib/use-popover";
import { AlertSettings } from "./AlertSettings";
import { AlertToasts } from "./AlertToasts";
import { LogOutIcon, SlidersIcon } from "./icons";
import { NotificationBell } from "./NotificationBell";

/**
 * The header's account corner: "Giriş yap" when signed out; alert settings, the inbox and the
 * account menu when signed in. Nothing at all while accounts are off (no database): the map works.
 */
export function AccountBar() {
  const { account, notifications, unread, arrived, signOut, markAllRead, dismiss } = useAccount();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { open: menuOpen, setOpen: setMenuOpen, box: menuBox } = usePopover();

  if (account.status === "loading" || account.status === "off") return null;
  if (account.status === "signed-out") {
    return (
      <Link
        href="/giris"
        className="rounded-full bg-linear-to-r from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/25 transition hover:opacity-95"
      >
        Giriş yap
      </Link>
    );
  }

  const { email } = account.user;
  return (
    <>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-semibold transition hover:border-accent/60"
      >
        <SlidersIcon className="h-4 w-4 text-accent-text" />
        <span className="hidden sm:inline">Bildirim ayarları</span>
        <span className="sr-only sm:hidden">Bildirim ayarları</span>
      </button>
      <NotificationBell notifications={notifications} unread={unread} onOpen={() => void markAllRead()} />
      <div ref={menuBox} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label="Hesap"
          title={email}
          className="grid h-10 w-10 place-items-center rounded-full bg-linear-to-br from-accent to-accent-2 font-bold text-accent-foreground shadow-md shadow-accent/25"
        >
          {email.charAt(0).toLocaleUpperCase("tr")}
        </button>
        {menuOpen && (
          <div className="absolute top-12 right-0 z-[1100] w-64 rounded-2xl border border-line bg-surface p-2 shadow-2xl">
            <p className="truncate px-2 pt-1 pb-2 text-sm text-muted">{email}</p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium transition hover:bg-surface-2"
            >
              <LogOutIcon />
              Çıkış yap
            </button>
          </div>
        )}
      </div>
      <AlertSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AlertToasts items={arrived} onDismiss={dismiss} />
    </>
  );
}
