"use client";

import { type LiveState, startLiveFeed } from "@campus-live/client";
import { useEffect, useState } from "react";
import { API_URL } from "./config";
import { appendReadings, type SessionHistory } from "./session-history";

/**
 * Every camera with its latest reading, kept live by the shared feed in @campus-live/client, plus the
 * readings this page has received so far (for the "Bu oturum" chart).
 */
export function useLiveCameras(): LiveState & { history: SessionHistory } {
  const [state, setState] = useState<LiveState>({ cameras: [], connected: false, error: null });
  const [history, setHistory] = useState<SessionHistory>({});
  useEffect(
    () =>
      startLiveFeed(API_URL, (next) => {
        setState(next);
        const now = Date.now();
        setHistory((previous) => appendReadings(previous, next.cameras, now));
      }),
    [],
  );
  return { ...state, history };
}
