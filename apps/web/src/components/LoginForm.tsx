"use client";

import {
  ApiRequestError,
  fetchAuthConfig,
  fetchMe,
  logIn,
  resendCode,
  signUp,
  verifyCode,
} from "@campus-live/client";
import type { AuthConfig } from "@campus-live/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { API_URL } from "@/lib/config";
import { ArrowLeftIcon, ArrowRightIcon, CampusIcon, InfoIcon, ShieldIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

type Step = "login" | "signup" | "verify";

const RESEND_WAIT_S = 60;

const inputClass =
  "w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25";

/** Sign in, or sign up with a school e-mail and the 6-digit code mailed to it. */
export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("login");
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [off, setOff] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    let current = true;
    // Already signed in: straight to the map.
    fetchMe(API_URL)
      .then((user) => current && user && router.replace("/"))
      .catch(() => undefined);
    fetchAuthConfig(API_URL)
      .then((loaded) => current && setConfig(loaded))
      .catch(
        (reason) => current && setOff(reason instanceof Error ? reason.message : "Hesap özellikleri kapalı."),
      );
    return () => {
      current = false;
    };
  }, [router]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1_000);
    return () => clearTimeout(timer);
  }, [wait]);

  function go(next: Step) {
    setStep(next);
    setError(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      if (reason instanceof ApiRequestError && reason.code === "EMAIL_NOT_VERIFIED") {
        go("verify");
        setError("Hesabınız henüz doğrulanmadı: e-postanıza gelen kodu girin ya da yeni kod isteyin.");
      } else {
        setError(reason instanceof Error ? reason.message : "Bir şeyler ters gitti.");
      }
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step === "login") {
      void run(async () => {
        await logIn(API_URL, email, password);
        router.replace("/");
      });
    } else if (step === "signup") {
      void run(async () => {
        await signUp(API_URL, email, password);
        setCode("");
        setWait(RESEND_WAIT_S);
        go("verify");
      });
    } else {
      void run(async () => {
        await verifyCode(API_URL, email, code);
        router.replace("/");
      });
    }
  }

  function resend() {
    void run(async () => {
      await resendCode(API_URL, email);
      setWait(RESEND_WAIT_S);
    });
  }

  const domains = config?.domains.map((domain) => `@${domain}`).join(" ya da ") ?? "";
  const disabled = busy || Boolean(off);

  return (
    <main className="relative grid min-h-screen place-items-center px-4 py-10">
      <ThemeToggle className="absolute top-4 right-4 bg-surface shadow-card ring-1 ring-line" />
      <div className="w-full max-w-[400px] rounded-2xl border border-line bg-surface p-7 shadow-card sm:p-8">
        {/* The account system's real state: the API answered its config, or it did not. */}
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
          <span
            className={`h-1.5 w-1.5 rounded-full ${off ? "bg-gray-400" : config ? "bg-green-500" : "bg-amber-500"}`}
          />
          Hesap sistemi: {off ? "kapalı" : config ? "aktif" : "bağlanıyor"}
        </p>

        <Link href="/" className="mt-6 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground">
            <CampusIcon className="h-4.5 w-4.5" />
          </span>
          <span className="font-bold tracking-tight text-accent-text">Campus Live</span>
        </Link>
        <p className="mt-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
          Kampüsün canlı haritası
        </p>

        {step === "verify" ? (
          <div className="mt-6">
            <h1 className="text-xl font-bold tracking-tight">E-postanızı doğrulayın</h1>
            <p className="mt-1.5 text-sm text-muted">
              <strong className="font-semibold text-foreground">{email}</strong> adresine 6 haneli bir kod
              gönderdik. Kod 15 dakika geçerli.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6">
              <h1 className="text-xl font-bold tracking-tight">Kampüs hesabınızla giriş yapın</h1>
              <p className="mt-1.5 text-sm text-muted">
                Yoğunluk uyarıları ve bildirimler için okul e-posta adresinizle giriş yapın.
              </p>
            </div>
            <div
              role="tablist"
              aria-label="Giriş ya da kayıt"
              className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-line"
            >
              {(["login", "signup"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={step === option}
                  onClick={() => go(option)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    step === option ? "bg-surface shadow-card" : "text-muted hover:text-foreground"
                  }`}
                >
                  {option === "login" ? "Giriş yap" : "Kayıt ol"}
                </button>
              ))}
            </div>
          </>
        )}

        {off && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm"
          >
            {off} Canlı harita hesap olmadan da çalışır.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <form onSubmit={submit} className="mt-5 space-y-4">
          {step !== "verify" ? (
            <>
              <label className="block space-y-1.5">
                <span className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                  Üniversite e-posta adresi
                  {config?.domains.length ? (
                    <span className="text-xs font-medium text-muted">@{config.domains.at(-1)}</span>
                  ) : null}
                </span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={
                    config?.domains.length ? `ad.soyad@${config.domains.at(-1)}` : "ad.soyad@okul.edu.tr"
                  }
                  className={inputClass}
                />
                {step === "signup" && domains && (
                  <span className="block text-xs text-muted">
                    Yalnızca {domains} adresleriyle kayıt olunur.
                  </span>
                )}
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">Şifre</span>
                <input
                  type="password"
                  required
                  minLength={step === "signup" ? 8 : 1}
                  autoComplete={step === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClass}
                />
                {step === "signup" && <span className="block text-xs text-muted">En az 8 karakter.</span>}
              </label>
            </>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Doğrulama kodu</span>
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className={`${inputClass} text-center text-2xl font-bold tracking-[0.4em] tabular-nums`}
              />
            </label>
          )}

          <button
            type="submit"
            disabled={disabled}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-card transition hover:bg-accent-2 active:scale-[0.99] disabled:opacity-40"
          >
            {busy
              ? "Bekleyin…"
              : step === "login"
                ? "Giriş yap"
                : step === "signup"
                  ? "Doğrulama kodu gönder"
                  : "Doğrula ve giriş yap"}
            {!busy && <ArrowRightIcon />}
          </button>
        </form>

        {step === "verify" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              onClick={resend}
              disabled={busy || wait > 0}
              className="font-semibold text-accent-text transition hover:underline disabled:text-muted disabled:no-underline"
            >
              {wait > 0 ? `Yeni kod ${wait} sn sonra` : "Kodu yeniden gönder"}
            </button>
            <button
              type="button"
              onClick={() => go("signup")}
              className="text-muted transition hover:text-foreground"
            >
              E-postayı değiştir
            </button>
          </div>
        )}

        <Link
          href="/"
          className="mt-6 flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground"
        >
          <ArrowLeftIcon />
          Haritaya misafir olarak dön
        </Link>

        <div className="mt-6 space-y-2">
          {config?.devOutbox && (
            <p className="flex gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
              <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                <strong className="font-semibold text-foreground">Geliştirme modu:</strong> e-posta
                gönderilmiyor; kod services/api/.mail-outbox klasörüne yazılıyor.
              </span>
            </p>
          )}
          <p className="flex gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
            <ShieldIcon className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Kamera görüntüleri saklanmaz ve hiçbir yere gönderilmez; uygulama yalnızca sayıları gösterir.
              Hesabınızda yalnızca e-posta adresiniz ve bildirim ayarlarınız tutulur.
            </span>
          </p>
        </div>
      </div>
    </main>
  );
}
