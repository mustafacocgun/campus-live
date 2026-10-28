"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "@/lib/use-account";
import { usePopover } from "@/lib/use-popover";
import { AlertSettings } from "./AlertSettings";
import { AlertToasts } from "./AlertToasts";
import { BellIcon, GearIcon, LogOutIcon, UserIcon } from "./icons";
import { NotificationBell } from "./NotificationBell";

const ICON_BUTTON =
  "grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground";

/**
 * The top bar's account corner. Signed out: the bell and the settings lead to sign-in, beside
 * "Giriş yap". Signed in: the inbox, alert settings and the account menu. Nothing at all while
 * accounts are off (no database): the map works.
 */
export function AccountBar() {
  const { account, notifications, unread, arrived, signOut, markAllRead, dismiss } = useAccount();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { open: menuOpen, setOpen: setMenuOpen, box: menuBox } = usePopover();

  if (account.status === "loading" || account.status === "off") return null;
  if (account.status === "signed-out") {
    return (
      <>
        <Link
          href="/giris"
          className={ICON_BUTTON}
          aria-label="Bildirimler için giriş yapın"
          title="Bildirimler için giriş yapın"
        >
          <BellIcon className="h-[18px] w-[18px]" />
        </Link>
        <Link
          href="/giris"
          className={ICON_BUTTON}
          aria-label="Bildirim ayarları için giriş yapın"
          title="Bildirim ayarları için giriş yapın"
        >
          <GearIcon className="h-[18px] w-[18px]" />
        </Link>
        <span aria-hidden className="mx-1.5 hidden h-5 w-px bg-line sm:block" />
        <Link
          href="/giris"
          className="flex items-center gap-2.5 rounded-full py-1 pr-1 pl-2 text-sm font-semibold transition hover:bg-surface-2"
        >
          <span className="hidden sm:inline">Giriş yap</span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground">
            <UserIcon className="h-4 w-4" />
          </span>
        </Link>
      </>
    );
  }

  const { email } = account.user;
  return (
    <>
      <NotificationBell notifications={notifications} unread={unread} onOpen={() => void markAllRead()} />
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label="Bildirim ayarları"
        title="Bildirim ayarları"
        className={ICON_BUTTON}
      >
        <GearIcon className="h-[18px] w-[18px]" />
      </button>
      <span aria-hidden className="mx-1.5 hidden h-5 w-px bg-line sm:block" />
      <div ref={menuBox} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label="Hesap"
          title={email}
          className="flex items-center gap-2.5 rounded-full py-1 pr-1 pl-2 transition hover:bg-surface-2"
        >
          <span className="hidden max-w-40 truncate text-sm font-medium text-muted lg:inline">{email}</span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
            {email.charAt(0).toLocaleUpperCase("tr")}
          </span>
        </button>
        {menuOpen && (
          <div className="on-page absolute top-11 right-0 z-[1100] w-64 rounded-2xl border border-line bg-surface p-2 shadow-2xl">
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
