"use client";

import { askAssistant } from "@campus-live/client";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/config";
import { SendIcon, SparkleIcon } from "./icons";

interface Turn {
  question: string;
  answer: string;
  fallback: boolean;
}

/** One per camera kind; each matches a fallback intent, so they answer without the LLM too. */
const SUGGESTIONS = ["Otoparkta boş yer var mı?", "Kütüphane kalabalık mı?", "Yolda trafik nasıl?"];

function AssistantAvatar({ size = "h-6 w-6", icon = "h-3.5 w-3.5" }: { size?: string; icon?: string }) {
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-full bg-linear-to-br from-accent to-brand-2 text-accent-foreground shadow-sm`}
    >
      <SparkleIcon className={icon} />
    </span>
  );
}

/** Ask about the live campus in Turkish; answers come only from the live data (CLAUDE.md §4.7). */
export function AssistantPanel() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  async function ask(text: string) {
    const asked = text.trim();
    if (!asked || busy) return;
    setBusy(true);
    setQuestion("");
    try {
      const response = await askAssistant(API_URL, asked);
      setTurns((all) => [
        ...all,
        { question: asked, answer: response.answer, fallback: response.via === "fallback" },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Asistan şu an yanıt veremiyor.";
      setTurns((all) => [...all, { question: asked, answer: message, fallback: true }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-3">
        <AssistantAvatar size="h-9 w-9" icon="size-4.5" />
        <div>
          <h2 className="font-semibold">Asistana sor</h2>
          <p className="text-xs text-muted">Yanıtlar yalnızca canlı verilere dayanır.</p>
        </div>
      </div>
      <div ref={log} className="max-h-72 min-h-0 flex-1 space-y-3 overflow-y-auto text-sm lg:max-h-none">
        {!turns.length && !busy && (
          <div className="space-y-2.5 rounded-xl border border-dashed border-line p-3">
            <p className="text-muted">Kalabalık, otopark ya da trafik hakkında sorun:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void ask(suggestion)}
                  className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium transition hover:border-accent hover:text-accent-text"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, index) => (
          <div key={index} className="space-y-1.5">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-accent-foreground">
              {turn.question}
            </p>
            <div className="flex items-end gap-2">
              <AssistantAvatar />
              <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-2">
                <p className="whitespace-pre-line">{turn.answer}</p>
                {turn.fallback && <p className="mt-1 text-xs text-muted">Canlı verilerden özet</p>}
              </div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-end gap-2" role="status" aria-label="Yanıt hazırlanıyor">
            <AssistantAvatar />
            <span className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-3">
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
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Örn. Otoparkta boş yer var mı?"
          maxLength={500}
          aria-label="Asistana sorunuz"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {busy ? "…" : "Sor"}
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
