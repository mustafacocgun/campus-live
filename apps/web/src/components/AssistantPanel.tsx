"use client";

import { askAssistant } from "@campus-live/client";
import { type FormEvent, useState } from "react";
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
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold">Asistana sor</h2>
      <div className="max-h-64 space-y-2 overflow-y-auto text-sm">
        {turns.map((turn, index) => (
          <div key={index}>
            <p className="font-medium">{turn.question}</p>
            <p className="whitespace-pre-line text-gray-700">{turn.answer}</p>
            {turn.fallback && <p className="text-xs text-gray-400">Canlı verilerden özet</p>}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Örn. Otoparkta boş yer var mı?"
          maxLength={500}
          aria-label="Asistana sorunuz"
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? "…" : "Sor"}
        </button>
      </form>
    </div>
  );
}
