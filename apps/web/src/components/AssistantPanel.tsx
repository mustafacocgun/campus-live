"use client";

import { askAssistant } from "@campus-live/client";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/config";

interface Turn {
  question: string;
  answer: string;
  fallback: boolean;
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    const asked = question.trim();
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h2 className="font-semibold">Asistana sor</h2>
        <p className="text-xs text-muted">Yanıtlar yalnızca canlı verilere dayanır.</p>
      </div>
      <div ref={log} className="max-h-72 min-h-0 flex-1 space-y-3 overflow-y-auto text-sm lg:max-h-none">
        {!turns.length && !busy && (
          <p className="rounded-xl border border-dashed border-line p-3 text-muted">
            Kalabalık, otopark ya da trafik hakkında bir soru yazın.
          </p>
        )}
        {turns.map((turn, index) => (
          <div key={index} className="space-y-1.5">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-accent-foreground">
              {turn.question}
            </p>
            <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-2">
              <p className="whitespace-pre-line">{turn.answer}</p>
              {turn.fallback && <p className="mt-1 text-xs text-muted">Canlı verilerden özet</p>}
            </div>
          </div>
        ))}
        {busy && (
          <p className="w-fit rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-2 text-muted">Yanıt hazırlanıyor…</p>
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
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "…" : "Sor"}
        </button>
      </form>
    </div>
  );
}
