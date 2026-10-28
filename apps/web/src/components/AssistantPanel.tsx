"use client";

import { askAssistant } from "@campus-live/client";
import type { AnswerPlace, CameraKind } from "@campus-live/contracts";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/config";
import { kmFromCampus, locateDevice, type MyLocation } from "@/lib/my-location";
import {
  CollapseIcon,
  ExpandIcon,
  KindIcon,
  LocateIcon,
  NewChatIcon,
  PinIcon,
  SendIcon,
  SparkleIcon,
} from "./icons";

interface Turn {
  question: string;
  answer: string;
  fallback: boolean;
  /** The places the answer is about, nearest first: tap one to see it on the map. */
  places?: AnswerPlace[];
}

interface Suggestion {
  text: string;
  hint: string;
  icon: ReactNode;
}

const kindIcon = (kind: CameraKind) => <KindIcon kind={kind} className="h-4 w-4" />;

/** One per camera kind; each matches a fallback intent, so they answer without the LLM too. */
const SUGGESTIONS: Suggestion[] = [
  { text: "Otoparkta boş yer var mı?", hint: "Otoparklar", icon: kindIcon("parking") },
  { text: "Kütüphane kalabalık mı?", hint: "Kalabalık", icon: kindIcon("crowd") },
  { text: "Yolda trafik nasıl?", hint: "Trafik", icon: kindIcon("traffic") },
];
/** With a position, the "nearest" questions come first. */
const NEARBY_SUGGESTIONS: Suggestion[] = [
  { text: "Bana en yakın otopark nerede?", hint: "Konumuna göre", icon: <PinIcon className="h-4 w-4" /> },
  { text: "En yakın kafe nerede?", hint: "Konumuna göre", icon: <PinIcon className="h-4 w-4" /> },
];
const CHIP =
  "flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium transition hover:border-accent hover:text-accent-text disabled:opacity-50";
const HEADER_BUTTON =
  "grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20";

function AssistantAvatar({ size = "h-7 w-7", icon = "h-3.5 w-3.5" }: { size?: string; icon?: string }) {
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-full bg-linear-to-br from-accent to-accent-2 text-accent-foreground shadow-sm`}
    >
      <SparkleIcon className={icon} />
    </span>
  );
}

/**
 * Ask about the live campus in Turkish; answers come only from the live data (CLAUDE.md §4.7). With the
 * user's position (from the device or picked on the map), "the nearest…" questions are answered from
 * it; the position stays in the page and the API, never reaching the LLM.
 */
export function AssistantPanel({
  me,
  picking,
  onLocate,
  onPicking,
  onShowPlace,
  expanded = false,
  onToggleExpand,
}: {
  me: MyLocation | null;
  picking: boolean;
  onLocate: (me: MyLocation | null) => void;
  onPicking: (on: boolean) => void;
  onShowPlace: (id: string) => void;
  /** The panel fills the side panel; the place list is folded away. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const suggestions = [...(me ? NEARBY_SUGGESTIONS : []), ...SUGGESTIONS];

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  async function ask(text: string) {
    const asked = text.trim();
    if (!asked || busy) return;
    setBusy(true);
    setQuestion("");
    try {
      const response = await askAssistant(API_URL, asked, me ? { lat: me.lat, lng: me.lng } : undefined);
      setTurns((all) => [
        ...all,
        {
          question: asked,
          answer: response.answer,
          fallback: response.via === "fallback",
          places: response.places,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Asistan şu an yanıt veremiyor.";
      setTurns((all) => [...all, { question: asked, answer: message, fallback: true }]);
    } finally {
      setBusy(false);
    }
  }

  async function locateMe() {
    setLocating(true);
    setNote(null);
    try {
      const found = await locateDevice();
      const km = kmFromCampus(found);
      if (km > 2)
        setNote(`Cihaz konumu kampüsten yaklaşık ${Math.round(km)} km uzakta; haritadan seçebilirsin.`);
      else if ((found.accuracy ?? 0) > 150)
        setNote(`Konum yaklaşık (±${found.accuracy} m); daha doğrusu için haritadan seç.`);
      onLocate(found);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Konum alınamadı; haritadan seçebilirsin.");
    } finally {
      setLocating(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {/* The assistant's own header: the one navy surface in the side panel, so it reads as the feature. */}
      <div className="flex items-center gap-3 bg-linear-to-br from-accent to-accent-2 px-4 py-3 text-white">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
          <SparkleIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-semibold">
            Kampüs Asistanı
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ring-1 ring-white/25">
              Yapay zekâ
            </span>
          </h2>
          <p className="truncate text-xs text-white/75">Yanıtlar yalnızca canlı verilere dayanır.</p>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => setTurns([])}
            aria-label="Yeni sohbet"
            title="Yeni sohbet"
            className={HEADER_BUTTON}
          >
            <NewChatIcon />
          </button>
        )}
        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? "Asistanı küçült" : "Asistanı genişlet"}
            aria-pressed={expanded}
            title={expanded ? "Küçült" : "Genişlet"}
            className={`${HEADER_BUTTON} hidden lg:grid`}
          >
            {expanded ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        )}
      </div>

      <div ref={log} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        {!turns.length && !busy && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <AssistantAvatar />
              <div className="rounded-2xl rounded-tl-sm bg-surface-2 px-3.5 py-2.5 ring-1 ring-line">
                <p className="font-semibold">Merhaba! Kampüste neyi merak ediyorsun?</p>
                <p className="mt-0.5 text-muted">
                  Kalabalık, boş park yeri ya da trafik hakkında sor; canlı verilerden yanıtlayayım.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.text}
                  type="button"
                  onClick={() => void ask(suggestion.text)}
                  className="group flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3 text-left transition hover:border-accent/50 hover:bg-surface-2 hover:shadow-card"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent-text">
                    {suggestion.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-snug group-hover:text-accent-text">
                      {suggestion.text}
                    </span>
                    <span className="block text-xs text-muted">{suggestion.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, index) => (
          <div key={index} className="space-y-2.5">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-accent-foreground shadow-card">
              {turn.question}
            </p>
            <div className="flex items-start gap-2.5">
              <AssistantAvatar />
              <div className="w-fit max-w-[88%] rounded-2xl rounded-tl-sm bg-surface-2 px-3.5 py-2.5 ring-1 ring-line">
                <p className="leading-relaxed whitespace-pre-line">{turn.answer}</p>
                {turn.places?.length ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {turn.places.map((place) => (
                      <button
                        key={place.id}
                        type="button"
                        onClick={() => onShowPlace(place.id)}
                        title={place.name}
                        className="flex max-w-full items-center gap-1 rounded-full border border-accent/40 bg-surface px-2.5 py-1 text-xs font-medium whitespace-nowrap text-accent-text transition hover:border-accent"
                      >
                        <PinIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{place.name}</span>
                        {place.metres !== null && <span className="text-muted">· {place.metres} m</span>}
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="mt-2 text-[11px] text-muted">
                  {turn.fallback ? "Canlı verilerden özet" : "Yapay zekâ, canlı verilerle"}
                </p>
              </div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-start gap-2.5" role="status" aria-label="Yanıt hazırlanıyor">
            <AssistantAvatar />
            <span className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-surface-2 px-3.5 py-3.5 ring-1 ring-line">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2.5 border-t border-line bg-surface-2 px-4 pt-3 pb-4">
        {turns.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Hızlı sorular</p>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.text}
                  type="button"
                  onClick={() => void ask(suggestion.text)}
                  disabled={busy}
                  className={`${CHIP} shrink-0 whitespace-nowrap`}
                >
                  {suggestion.text}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {picking ? (
            <>
              <span className="font-medium text-accent-text">Haritada konumuna dokun…</span>
              <button type="button" onClick={() => onPicking(false)} className={CHIP}>
                Vazgeç
              </button>
            </>
          ) : me ? (
            <>
              <span className="flex items-center gap-1 font-medium">
                <LocateIcon />
                Konumun:{" "}
                {me.source === "device"
                  ? `cihazdan${me.accuracy ? ` (±${me.accuracy} m)` : ""}`
                  : "haritadan seçildi"}
              </span>
              <button type="button" onClick={() => onPicking(true)} className={CHIP}>
                Değiştir
              </button>
              <button type="button" onClick={() => onLocate(null)} className={CHIP}>
                Kaldır
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void locateMe()} disabled={locating} className={CHIP}>
                <LocateIcon />
                {locating ? "Konum alınıyor…" : "Konumumu kullan"}
              </button>
              <button type="button" onClick={() => onPicking(true)} className={CHIP}>
                <PinIcon />
                Haritadan seç
              </button>
            </>
          )}
        </div>
        {note && <p className="text-xs text-muted">{note}</p>}
        <form
          onSubmit={submit}
          className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 pl-4 shadow-card transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20"
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Asistana bir şey sor… (örn. Otoparkta boş yer var mı?)"
            maxLength={500}
            aria-label="Asistana sorunuz"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            aria-label="Sor"
            className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:bg-accent-2 active:scale-95 disabled:opacity-40"
          >
            {busy ? "…" : "Sor"}
            <SendIcon />
          </button>
        </form>
        {/* The privacy line for the position, once there is one to protect. */}
        {(me || picking) && (
          <p
            className="truncate text-[11px] text-muted"
            title="Konumun kaydedilmez; yapay zekâya yalnızca en yakın yerlerin yaklaşık mesafeleri gider."
          >
            Konum kaydedilmez; yapay zekâya yalnızca yaklaşık mesafe gider.
          </p>
        )}
      </div>
    </div>
  );
}
