"use client";

import {
  ALERT_DIRECTION_TR,
  createAlertRule,
  deleteAlertRule,
  fetchAlertRules,
  fetchRegions,
  updateAlertRule,
} from "@campus-live/client";
import type { AlertDirection, AlertRule, AlertRulePatch, PlaceKind, Region } from "@campus-live/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/config";
import { CloseIcon, MailIcon, TrashIcon } from "./icons";

const REGIONS_REFRESH_MS = 10_000;

// The place list is long: grouped by kind, in the order people look for them.
const KIND_GROUP: [PlaceKind, string][] = [
  ["area", "Açık alanlar"],
  ["building", "Binalar"],
  ["parking", "Otoparklar"],
  ["road", "Yollar"],
];

function percentText(region: Region | undefined): string {
  if (!region || region.percent === null) return "şu an veri yok";
  return `şu an %${region.percent}${region.demo ? ", demo" : ""}`;
}

const message = (error: unknown) => (error instanceof Error ? error.message : "Bir şeyler ters gitti.");

/** The settings dialog: native <dialog>, so focus stays inside and Escape closes it. */
export function AlertSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    if (!open && element?.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="alert-settings-title"
      className="on-page m-auto max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100vw-2rem))] overflow-y-auto rounded-3xl border border-line bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {open && <SettingsBody onClose={onClose} />}
    </dialog>
  );
}

function SettingsBody({ onClose }: { onClose: () => void }) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [direction, setDirection] = useState<AlertDirection>("below");
  const [threshold, setThreshold] = useState(60);
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Mounted only once the dialog opens, in the browser: Notification exists here.
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  useEffect(() => {
    let current = true;
    Promise.all([fetchRegions(API_URL), fetchAlertRules(API_URL)])
      .then(([loadedRegions, loadedRules]) => {
        if (!current) return;
        setRegions(loadedRegions);
        setRules(loadedRules);
        setPlaceId((chosen) => chosen || loadedRegions[0]?.id || "");
      })
      .catch((reason) => current && setError(message(reason)))
      .finally(() => current && setLoading(false));
    // The percents beside each region stay live while the dialog is open.
    const timer = setInterval(() => {
      fetchRegions(API_URL)
        .then((fresh) => current && setRegions(fresh))
        .catch(() => undefined);
    }, REGIONS_REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, []);

  const byId = new Map(regions.map((region) => [region.id, region]));
  const chosen = byId.get(placeId);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const rule = await createAlertRule(API_URL, {
        place: placeId,
        direction,
        thresholdPct: threshold,
        email,
      });
      setRules((all) => [...all, rule]);
      // The first rule is the moment a person asks for alerts: ask the browser then, never on load.
      if (permission === "default") setPermission(await Notification.requestPermission());
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function change(rule: AlertRule, patch: AlertRulePatch) {
    setRules((all) => all.map((r) => (r.id === rule.id ? { ...r, ...patch } : r)));
    try {
      const saved = await updateAlertRule(API_URL, rule.id, patch);
      setRules((all) => all.map((r) => (r.id === rule.id ? saved : r)));
    } catch (reason) {
      setRules((all) => all.map((r) => (r.id === rule.id ? rule : r)));
      setError(message(reason));
    }
  }

  async function remove(rule: AlertRule) {
    if (confirming !== rule.id) {
      setConfirming(rule.id);
      return;
    }
    setConfirming(null);
    try {
      await deleteAlertRule(API_URL, rule.id);
      setRules((all) => all.filter((r) => r.id !== rule.id));
    } catch (reason) {
      setError(message(reason));
    }
  }

  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 id="alert-settings-title" className="text-xl font-bold tracking-tight">
            Bildirim ayarları
          </h2>
          <p className="mt-1 text-sm text-muted">
            Bir yerin doluluğu belirlediğiniz eşiği geçtiğinde size haber verelim.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Bildirim ayarlarını kapat"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          <CloseIcon />
        </button>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <form onSubmit={add} className="space-y-4 rounded-2xl bg-surface-2 p-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Yer</span>
          <select
            value={placeId}
            onChange={(event) => setPlaceId(event.target.value)}
            disabled={loading || !regions.length}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          >
            {KIND_GROUP.map(([kind, label]) => {
              const group = regions.filter((region) => region.kind === kind);
              return group.length ? (
                <optgroup key={kind} label={label}>
                  {group.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name} ({percentText(region)})
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>

        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-semibold">Ne zaman</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["below", "above"] as const).map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium transition has-checked:border-accent has-checked:bg-accent/10 has-checked:text-accent-text has-focus-visible:ring-2 has-focus-visible:ring-accent/40"
              >
                <input
                  type="radio"
                  name="direction"
                  value={option}
                  checked={direction === option}
                  onChange={() => setDirection(option)}
                  className="sr-only"
                />
                {option === "below" ? "Eşiğin altına inince" : "Eşiğin üstüne çıkınca"}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-2">
          <span className="flex items-baseline justify-between text-sm font-semibold">
            Doluluk eşiği
            <span className="text-2xl leading-none font-bold tabular-nums">%{threshold}</span>
          </span>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
            className="w-full accent-accent"
          />
        </label>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={email}
            onChange={(event) => setEmail(event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          E-postama da gönder
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted">
            {chosen ? (
              <>
                <strong className="font-semibold text-foreground">{chosen.name}</strong> doluluğu %{threshold}{" "}
                {ALERT_DIRECTION_TR[direction]} bildirim gelir.
              </>
            ) : (
              "Yerler yükleniyor…"
            )}
          </p>
          <button
            type="submit"
            disabled={busy || !chosen}
            className="rounded-xl bg-linear-to-r from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/25 transition hover:opacity-95 active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? "Ekleniyor…" : "Bildirimi ekle"}
          </button>
        </div>
      </form>

      <section className="space-y-2">
        <h3 className="flex items-baseline justify-between text-sm font-semibold">
          Bildirimlerim
          {rules.length > 0 && <span className="text-xs font-medium text-muted">{rules.length} kural</span>}
        </h3>
        {loading ? (
          <p className="text-sm text-muted">Yükleniyor…</p>
        ) : rules.length ? (
          <ul className="space-y-1.5">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className={`flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 ${rule.enabled ? "" : "opacity-60"}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{rule.placeName}</p>
                  <p className="text-xs text-muted">
                    %{rule.thresholdPct} {ALERT_DIRECTION_TR[rule.direction]},{" "}
                    {percentText(byId.get(rule.place))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void change(rule, { email: !rule.email })}
                  aria-pressed={rule.email}
                  aria-label={rule.email ? "E-postayla gönderme" : "E-postayla da gönder"}
                  title={rule.email ? "E-postayla da gönderiliyor" : "Yalnızca uygulamada"}
                  className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                    rule.email ? "bg-accent/15 text-accent-text" : "text-muted hover:bg-surface-2"
                  }`}
                >
                  <MailIcon />
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.enabled}
                  aria-label={`${rule.placeName} bildirimi ${rule.enabled ? "açık" : "kapalı"}`}
                  onClick={() => void change(rule, { enabled: !rule.enabled })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${rule.enabled ? "bg-accent" : "bg-line"}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      rule.enabled ? "translate-x-5" : ""
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(rule)}
                  onBlur={() => setConfirming((id) => (id === rule.id ? null : id))}
                  aria-label={confirming === rule.id ? "Silmeyi onayla" : "Kuralı sil"}
                  className={`flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition ${
                    confirming === rule.id
                      ? "bg-red-500/15 text-red-700 dark:text-red-300"
                      : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <TrashIcon />
                  {confirming === rule.id && "Sil"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">
            Henüz bildirim yok. Yukarıdan bir yer ve eşik seçip ekleyin.
          </p>
        )}
      </section>

      {permission !== "unsupported" && permission !== "granted" && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
          {permission === "denied"
            ? "Tarayıcı bildirimleri engelli: tarayıcı ayarlarından izin verebilirsiniz. Bildirimler uygulamada yine görünür."
            : "Sayfa arka plandayken de haber almak için tarayıcı bildirimlerini açın."}
          {permission === "default" && (
            <button
              type="button"
              onClick={() => void Notification.requestPermission().then(setPermission)}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold transition hover:border-accent/60"
            >
              Tarayıcı bildirimlerini aç
            </button>
          )}
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Yüzde, bir yerdeki kameraların saydığı kişilerin ya da araçların o yerin tahmini kapasitesine
        oranıdır; otoparklarda dolu park yerlerinin oranıdır. Kapasiteler henüz ölçülmedi. Bildirim, doluluk
        eşiği geçtiği anda bir kez gelir ve eşiğin öbür yanına dönmeden tekrarlanmaz. Görüntüsü gelmeyen
        kameralar hesaba katılmaz.
      </p>
    </div>
  );
}
